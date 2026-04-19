'use strict';

const express = require('express');
const { getGitHubAppStatus, processWebhook } = require('../../github-app');
const { requireAdminJwt } = require('../../github-app/middleware/auth-middleware');
const { apiRateLimit, webhookRateLimit } = require('../../github-app/middleware/rate-limit');
const { githubEventLogger, logError } = require('../../github-app/middleware/logger');
const { getActivityLog, initFleetIntegration } = require('../../github-app/fleet-integration');
const { handleWebhookEvent } = require('../../github-app/webhooks');

function createRouter({ io } = {}) {
  const router = express.Router();

  initFleetIntegration({ io, logger: console });

  // POST /api/github/webhook — public, HMAC verified, raw body required
  router.post('/webhook', webhookRateLimit, express.raw({ type: 'application/json' }), githubEventLogger, async (req, res) => {
    try {
      await processWebhook(req, res, io);
    } catch (error) {
      logError(error, {
        eventType: req.headers['x-github-event'],
        deliveryId: req.headers['x-github-delivery'],
      });
      res.status(500).json({
        ok: false,
        error: 'حدث خطأ أثناء معالجة Webhook.',
        details: error.message,
      });
    }
  });

  router.use(apiRateLimit);

  // GET  /api/github/status  — public
  router.get('/status', (_req, res) => {
    res.json({
      ok: true,
      status: getGitHubAppStatus(),
    });
  });

  // GET  /api/github/health  — public
  router.get('/health', (_req, res) => {
    const status = getGitHubAppStatus();
    const healthy = !status.enabled || (status.configured && status.webhookSecretConfigured);
    res.status(healthy ? 200 : 503).json({
      ok: healthy,
      service: 'github-app',
      status,
      checkedAt: new Date().toISOString(),
    });
  });

  // GET  /api/github/installations — admin JWT required
  router.get('/installations', requireAdminJwt, (_req, res) => {
    res.json({
      ok: true,
      installations: process.env.GITHUB_APP_INSTALLATION_ID
        ? [{ id: process.env.GITHUB_APP_INSTALLATION_ID, source: 'env' }]
        : [],
    });
  });

  // GET  /api/github/activity — admin JWT required
  router.get('/activity', requireAdminJwt, (_req, res) => {
    res.json({ ok: true, items: getActivityLog() });
  });

  // POST /api/github/app/setup — admin JWT required
  router.post('/app/setup', requireAdminJwt, (_req, res) => {
    res.json({
      ok: true,
      message: 'تم تنفيذ فحص إعداد GitHub App بنجاح.',
      status: getGitHubAppStatus(),
      nextStep: 'شغّل node github-app/setup.js --verify للتحقق الكامل.',
    });
  });

  // POST /api/github/test-webhook — admin JWT + NODE_ENV=development only
  router.post('/test-webhook', requireAdminJwt, express.json(), async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        ok: false,
        error: 'هذا المسار متاح فقط في بيئة التطوير.',
      });
    }

    const tokenFromHeader = req.headers['x-github-app-test-token'];
    if (process.env.GITHUB_APP_TEST_TOKEN && tokenFromHeader !== process.env.GITHUB_APP_TEST_TOKEN) {
      return res.status(403).json({
        ok: false,
        error: 'رمز اختبار webhook غير صالح.',
      });
    }

    const eventName = req.body?.event || 'push';
    const payload = req.body?.payload || {};

    try {
      await handleWebhookEvent(eventName, payload, { io, logger: console });
      return res.json({ ok: true, message: 'تم إرسال Webhook تجريبي بنجاح.' });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
