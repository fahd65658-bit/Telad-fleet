'use strict';

const express = require('express');
const requireGitHubAppAdmin = require('../../github-app/middleware/auth-middleware');
const { webhookRateLimit, apiRateLimit } = require('../../github-app/middleware/rate-limit');
const { getActivityLog } = require('../../github-app/fleet-integration');

let githubApp;
try {
  githubApp = require('../github-app/index');
} catch (_error) {
  githubApp = require('../../github-app/index');
}

const router = express.Router();

router.post('/webhook', webhookRateLimit, express.raw({ type: 'application/json' }), (req, res, next) => {
  if (typeof githubApp?.handleWebhook === 'function') {
    return githubApp.handleWebhook(req, res, next);
  }

  if (typeof githubApp === 'function') {
    return githubApp(req, res, next);
  }

  return res.status(500).json({ ok: false, error: 'GitHub app handler unavailable' });
});

router.get('/status', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'TELAD Fleet Manager',
    version: '2.0.1',
    enabled: process.env.GITHUB_APP_ENABLED,
  });
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

router.get('/activity', apiRateLimit, requireGitHubAppAdmin, (_req, res) => {
  res.json({
    status: 'ok',
    count: getActivityLog().length,
    data: getActivityLog(),
  });
});

router.post('/app/setup', apiRateLimit, requireGitHubAppAdmin, (_req, res) => {
  res.json({
    status: 'ok',
    message: 'GitHub App setup instructions',
    instructions: {
      ar: [
        'سجل التطبيق باستخدام github-app/app-manifest.json',
        'اضبط متغيرات البيئة على الخادم',
        'أعد تشغيل PM2 ثم اختبر /api/github/health',
      ],
      en: [
        'Register the app using github-app/app-manifest.json',
        'Configure environment variables on the server',
        'Reload PM2 and test /api/github/health',
      ],
    },
  });
});

module.exports = router;
