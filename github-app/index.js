'use strict';

const express = require('express');
const { verifyWebhookSignature } = require('./auth');
const handlers = require('./webhooks');
const { getActivityLog } = require('./fleet-integration');
const { logEvent, logError } = require('./middleware/logger');
const { webhookRateLimit, apiRateLimit } = require('./middleware/rate-limit');
const { getSetupStatus } = require('./setup');

let octokitAppAvailable = true;
try {
  require('@octokit/app');
} catch (_error) {
  octokitAppAvailable = false;
}

function isEnabled() {
  return process.env.GITHUB_APP_ENABLED === 'true';
}

function disabledResponse(req, res) {
  if (req.method === 'POST') {
    return res.status(202).json({
      enabled: false,
      skipped: true,
      message: 'GitHub App integration is disabled',
    });
  }

  return res.json({
    enabled: false,
    status: 'disabled',
    octokitAppAvailable,
    timestamp: new Date().toISOString(),
  });
}

const router = express.Router();

router.post('/webhook', webhookRateLimit, express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(req, res);

    const signature = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'] || null;
    const eventType = req.headers['x-github-event'];

    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const handler = handlers[eventType];
    if (!handler) {
      logEvent('unhandled_event', deliveryId, { eventType });
      return res.status(202).json({ received: true, handled: false, event: eventType });
    }

    await handler(payload, {
      deliveryId,
      eventType,
      io: req.app.get('io') || null,
      req,
    });

    return res.status(200).json({ received: true, handled: true, event: eventType });
  } catch (error) {
    logError(error, { route: '/webhook' });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.get('/status', apiRateLimit, (req, res) => {
  try {
    if (!isEnabled()) return disabledResponse(req, res);

    return res.json({
      enabled: true,
      status: 'active',
      octokitAppAvailable,
      setup: getSetupStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, { route: '/status' });
    return res.status(500).json({ error: 'Failed to fetch status' });
  }
});

router.get('/health', apiRateLimit, (req, res) => {
  if (!isEnabled()) {
    return res.json({ status: 'ok', enabled: false, timestamp: new Date().toISOString() });
  }

  return res.json({
    status: 'ok',
    enabled: true,
    timestamp: new Date().toISOString(),
  });
});

module.exports = {
  router,
  isEnabled,
  getActivityLog,
  getSetupStatus,
  octokitAppAvailable,
};
