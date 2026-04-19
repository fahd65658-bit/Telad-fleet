'use strict';

const express = require('express');
const { verifyWebhookSignature, getGitHubAppConfig } = require('./auth');
const { handleWebhookEvent } = require('./webhooks');
const { initFleetIntegration, getActivityLog, logActivity } = require('./fleet-integration');
const { githubEventLogger, logError } = require('./middleware/logger');
const { webhookRateLimit, apiRateLimit } = require('./middleware/rate-limit');

function isGitHubAppEnabled() {
  return process.env.GITHUB_APP_ENABLED === 'true';
}

function isGitHubAppReady() {
  const cfg = getGitHubAppConfig();
  return cfg.ready && Boolean(process.env.GITHUB_APP_WEBHOOK_SECRET);
}

function getGitHubAppStatus() {
  const cfg = getGitHubAppConfig();
  return {
    enabled: cfg.enabled,
    configured: cfg.ready,
    webhookSecretConfigured: Boolean(process.env.GITHUB_APP_WEBHOOK_SECRET),
    installationIdConfigured: Boolean(process.env.GITHUB_APP_INSTALLATION_ID),
    mode: cfg.ready ? 'active' : 'graceful-degradation',
    messageAr: cfg.ready
      ? 'تكامل GitHub App جاهز.'
      : 'GitHub App غير مكتمل الإعداد. النظام يعمل بشكل طبيعي بدون التكامل.',
    messageEn: cfg.ready
      ? 'GitHub App integration is ready.'
      : 'GitHub App is not fully configured. System continues normally without integration.',
  };
}

async function processWebhook(req, res, io) {
  const status = getGitHubAppStatus();
  if (!isGitHubAppEnabled() || !isGitHubAppReady()) {
    return res.status(202).json({
      ok: true,
      skipped: true,
      message: 'تم تجاوز معالجة Webhook لأن GitHub App غير مفعّل أو غير مكتمل.',
      status,
    });
  }

  const signature = req.headers['x-hub-signature-256'];
  const eventName = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('{}');

  const valid = verifyWebhookSignature(rawBody, signature, process.env.GITHUB_APP_WEBHOOK_SECRET);
  if (!valid) {
    return res.status(401).json({
      ok: false,
      error: 'فشل التحقق من توقيع GitHub Webhook.',
      deliveryId,
    });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    return res.status(400).json({
      ok: false,
      error: 'صيغة JSON غير صالحة في payload.',
      deliveryId,
    });
  }

  await handleWebhookEvent(eventName, payload, { io, logger: console });
  logActivity('webhook_processed', { event: eventName, deliveryId });

  return res.status(200).json({ ok: true, event: eventName, deliveryId });
}

function createGitHubAppRouter({ io } = {}) {
  const router = express.Router();
  initFleetIntegration({ io, logger: console });

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
        error: 'حدث خطأ داخلي أثناء معالجة Webhook.',
        details: error.message,
      });
    }
  });

  router.use(apiRateLimit);

  router.get('/status', (_req, res) => {
    res.json({ ok: true, status: getGitHubAppStatus() });
  });

  router.get('/health', (_req, res) => {
    const status = getGitHubAppStatus();
    const healthy = !status.enabled || (status.configured && status.webhookSecretConfigured);
    res.status(healthy ? 200 : 503).json({
      ok: healthy,
      service: 'github-app',
      status,
      time: new Date().toISOString(),
    });
  });

  router.get('/activity', (_req, res) => {
    res.json({ ok: true, items: getActivityLog() });
  });

  return router;
}

module.exports = {
  createGitHubAppRouter,
  getGitHubAppStatus,
  isGitHubAppEnabled,
  isGitHubAppReady,
  processWebhook,
};
