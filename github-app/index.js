'use strict';

require('dotenv').config();

const express = require('express');
const { verifyWebhookSignature, getAuthenticatedOctokit } = require('./auth');
const handlers = require('./webhooks');
const { webhookRateLimit } = require('./middleware/rate-limit');
const { logEvent, logError } = require('./middleware/logger');

const router = express.Router();
const enabled = process.env.GITHUB_APP_ENABLED === 'true';
let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

function emitToDashboard(eventType, data) {
  if (ioInstance && typeof ioInstance.emit === 'function') {
    ioInstance.emit(eventType, data);
  }
}

const eventHandlers = {
  push: handlers.handlePush,
  pull_request: handlers.handlePullRequest,
  issues: handlers.handleIssues,
  deployment: handlers.handleDeployment,
  deployment_status: handlers.handleDeploymentStatus,
  release: handlers.handleRelease,
  workflow_run: handlers.handleWorkflowRun,
  installation: handlers.handleInstallation,
};

async function handleWebhook(req, res) {
  if (!enabled) {
    return res.status(503).json({ ok: false, message: 'GitHub App is disabled' });
  }

  const deliveryId = req.get('x-github-delivery');
  const eventType = req.get('x-github-event');

  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    const signature = req.get('x-hub-signature-256');

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const installationId = payload?.installation?.id || process.env.GITHUB_APP_INSTALLATION_ID;
    const octokitAuth = installationId ? await getAuthenticatedOctokit(installationId) : { token: null };

    const handler = eventHandlers[eventType];
    logEvent(eventType || 'unknown', deliveryId, {
      installationId,
      repository: payload?.repository?.full_name,
    });

    if (handler) {
      await handler(payload, octokitAuth, {
        emit: emitToDashboard,
        deliveryId,
      });
    }

    emitToDashboard('github:webhook', {
      event: eventType,
      deliveryId,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, event: eventType });
  } catch (error) {
    logError(error, {
      deliveryId,
      eventType,
    });
    return res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
}

if (!enabled) {
  console.warn('[github-app] GITHUB_APP_ENABLED is not true. Running in no-op mode.');

  router.post('/webhook', (_req, res) => {
    res.status(503).json({ ok: false, message: 'GitHub App disabled' });
  });
  router.get('/status', (_req, res) => {
    res.json({ status: 'disabled', enabled: false });
  });
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', enabled: false, timestamp: new Date().toISOString() });
  });

  router.handleWebhook = handleWebhook;
  router.setIO = setIO;
  module.exports = router;
} else {
  router.post('/webhook', webhookRateLimit, express.raw({ type: 'application/json' }), handleWebhook);
  router.get('/status', (_req, res) => {
    res.json({ status: 'ok', enabled: true, appId: process.env.GITHUB_APP_ID || null });
  });
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), enabled: true });
  });

  router.handleWebhook = handleWebhook;
  router.setIO = setIO;

  module.exports = router;
}
