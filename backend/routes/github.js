'use strict';

const express = require('express');
const { initializeGitHubApp, isAppConfigured, isEnabled } = require('../../github-app');
const { requireAdminJwt, requireInstallationAccess } = require('../../github-app/middleware/auth-middleware');
const { apiLimiter } = require('../../github-app/middleware/rate-limit');
const integration = require('../../github-app/fleet-integration');
const { generateJWT, getPrivateKey } = require('../../github-app/auth');

const router = express.Router();

router.use(apiLimiter);

const githubCore = initializeGitHubApp();
router.use('/webhook', githubCore.webhookRouter);

router.get('/status', (_req, res) => {
  res.json({
    status: isEnabled() ? 'enabled' : 'disabled',
    configured: isAppConfigured(),
    appId: process.env.GITHUB_APP_ID || null,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID || null,
  });
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'github-app',
    enabled: isEnabled(),
    configured: isAppConfigured(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/installations', requireAdminJwt, async (_req, res) => {
  try {
    if (!isAppConfigured()) {
      return res.status(200).json({ installations: [], configured: false });
    }

    const appJwt = generateJWT(process.env.GITHUB_APP_ID, getPrivateKey());
    const response = await fetch('https://api.github.com/app/installations', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${appJwt}`,
        'User-Agent': process.env.GITHUB_APP_NAME || 'telad-fleet-manager',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({ error: 'تعذّر جلب التثبيتات', details: body });
    }

    const body = await response.json();
    return res.json({ configured: true, installations: body });
  } catch (error) {
    return res.status(500).json({ error: 'خطأ أثناء قراءة التثبيتات', details: error.message });
  }
});

router.post('/app/setup', requireAdminJwt, async (req, res) => {
  try {
    const io = req.app.get('io');
    if (io) integration.setSocketIO(io);

    const report = {
      enabled: isEnabled(),
      configured: isAppConfigured(),
      appId: process.env.GITHUB_APP_ID || null,
      installationId: process.env.GITHUB_APP_INSTALLATION_ID || null,
      webhookUrl: 'https://api.fna.sa/api/github/webhook',
      timestamp: new Date().toISOString(),
    };

    integration.logActivity('github.setup.requested', {
      by: req.user?.username || req.user?.name || 'admin',
      source: req.ip,
    });

    return res.json(report);
  } catch (error) {
    return res.status(500).json({ error: 'فشل إعداد GitHub App', details: error.message });
  }
});

router.get('/activity', requireAdminJwt, (_req, res) => {
  try {
    return res.json({ items: integration.getActivity(200) });
  } catch (error) {
    return res.status(500).json({ error: 'فشل قراءة سجل النشاط', details: error.message });
  }
});

router.post('/test-webhook', requireAdminJwt, requireInstallationAccess, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'هذا المسار مخصص للتطوير فقط.' });
    }

    const payload = {
      action: 'completed',
      workflow_run: {
        name: 'Manual Test Webhook',
        conclusion: 'success',
      },
    };

    const result = await require('../../github-app/webhooks').handleWebhookEvent('workflow_run', payload);
    return res.json({ ok: true, result, installationId: req.githubInstallationId });
  } catch (error) {
    return res.status(500).json({ error: 'فشل اختبار Webhook', details: error.message });
  }
});

module.exports = router;
