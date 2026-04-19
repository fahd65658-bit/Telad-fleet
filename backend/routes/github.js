'use strict';

const express = require('express');
const helmet = require('helmet');
const { createGitHubAppCore } = require('../../github-app');
const { createGitHubRateLimiter } = require('../../github-app/middleware/rate-limit');
const { githubAppLogger, githubAppLoggerFinalize } = require('../../github-app/middleware/logger');
const { verifySetup } = require('../../github-app/setup');

/**
 * Builds GitHub App API routes mounted under /api/github.
 * @param {{
 *   io?: import('socket.io').Server,
 *   adminOnly?: import('express').RequestHandler,
 *   getDeployId?: function(): string,
 *   setDeployId?: function(string): void
 * }} options Route options.
 * @returns {import('express').Router} Configured router.
 */
function createGitHubRoutes(options = {}) {
  const router = express.Router();
  const adminOnly = options.adminOnly || ((_req, _res, next) => next());
  const appCore = createGitHubAppCore({
    io: options.io,
    getDeployId: options.getDeployId,
    setDeployId: options.setDeployId,
  });

  router.use(helmet());
  router.use(githubAppLogger());
  router.use(githubAppLoggerFinalize());
  router.use(createGitHubRateLimiter());

  router.post('/webhook', async (req, res) => {
    try {
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
      const result = await appCore.processWebhook(rawBody, req.headers['x-hub-signature-256'], req.headers);
      if (!result.ok) return res.status(result.statusCode || 400).json({ error: result.error });
      return res.status(result.statusCode).json({ ok: true, event: result.event });
    } catch (error) {
      return res.status(500).json({ error: 'فشل معالجة Webhook', details: error.message });
    }
  });

  router.get('/status', async (_req, res) => {
    try {
      const status = await appCore.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'تعذر جلب حالة GitHub App', details: error.message });
    }
  });

  router.get('/installations', adminOnly, async (_req, res) => {
    try {
      const items = await appCore.listInstallations();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: 'تعذر جلب قائمة التثبيتات', details: error.message });
    }
  });

  router.post('/app/setup', adminOnly, (_req, res) => {
    const verification = verifySetup();
    res.status(verification.ok ? 200 : 400).json(verification);
  });

  router.get('/activity', adminOnly, (_req, res) => {
    res.json(appCore.getActivity());
  });

  return router;
}

module.exports = createGitHubRoutes;
