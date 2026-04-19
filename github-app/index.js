'use strict';

const express = require('express');
const { Webhooks } = require('@octokit/webhooks');
const auth = require('./auth');
const integration = require('./fleet-integration');
const { handleWebhookEvent } = require('./webhooks');
const { webhookLimiter } = require('./middleware/rate-limit');
const { webhookLogger, errorLogger } = require('./middleware/logger');

function isAppConfigured() {
  const hasPrivateKey = Boolean(process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_PATH);
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_WEBHOOK_SECRET && hasPrivateKey);
}

function isEnabled() {
  return process.env.GITHUB_APP_ENABLED !== 'false';
}

/**
 * Build the Express router for GitHub webhooks.
 * @returns {import('express').Router}
 */
function buildWebhookRouter() {
  const router = express.Router();

  if (process.env.GITHUB_APP_WEBHOOK_SECRET) {
    // Keep a validated Webhooks instance ready for future signature/event extensions.
    const _webhooks = new Webhooks({ secret: process.env.GITHUB_APP_WEBHOOK_SECRET });
    void _webhooks;
  }

  router.post(
    '/',
    webhookLimiter,
    express.raw({ type: 'application/json', limit: '5mb' }),
    webhookLogger,
    async (req, res) => {
      try {
        if (!isEnabled()) {
          return res.status(503).json({ status: 'disabled', message: 'تكامل GitHub App غير مفعل حالياً.' });
        }

        if (!isAppConfigured()) {
          return res.status(202).json({ status: 'skipped', message: 'GitHub App غير مُعد بعد، وتم تجاوز معالجة الحدث.' });
        }

        const signature = req.headers['x-hub-signature-256'];
        const eventName = req.headers['x-github-event'];

        const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
        const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}), 'utf8');

        const validSignature = auth.verifyWebhookSignature(payload, String(signature || ''), secret);
        if (!validSignature) {
          integration.logActivity('github.webhook.invalid_signature', { eventName: String(eventName || '') });
          return res.status(401).json({ error: 'توقيع Webhook غير صالح' });
        }

        const parsedPayload = JSON.parse(payload.toString('utf8'));
        await handleWebhookEvent(String(eventName || 'unknown'), parsedPayload);

        return res.status(200).json({ ok: true });
      } catch (error) {
        integration.logActivity('github.webhook.failed', { error: error.message });
        return res.status(500).json({ error: 'فشل معالجة Webhook' });
      }
    }
  );

  router.use(errorLogger);
  return router;
}

/**
 * Initialize GitHub App core and optional Socket.io binding.
 * @param {{io?: import('socket.io').Server}} options
 */
function initializeGitHubApp(options = {}) {
  if (options.io) {
    integration.setSocketIO(options.io);
  }

  return {
    enabled: isEnabled(),
    configured: isAppConfigured(),
    webhookRouter: buildWebhookRouter(),
  };
}

module.exports = {
  initializeGitHubApp,
  buildWebhookRouter,
  isEnabled,
  isAppConfigured,
};
