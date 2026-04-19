'use strict';

const express = require('express');
const authMiddleware = require('../../github-app/middleware/auth-middleware');
const { apiRateLimit } = require('../../github-app/middleware/rate-limit');
const githubApp = require('../../github-app/index');
const { printStatus } = require('../../github-app/setup');

const router = express.Router();

router.use('/', githubApp.router);

router.get('/activity', apiRateLimit, authMiddleware, (_req, res) => {
  return res.json({
    enabled: githubApp.isEnabled(),
    activity: githubApp.getActivityLog(),
  });
});

router.post('/app/setup', apiRateLimit, authMiddleware, (_req, res) => {
  const setup = printStatus();
  return res.json({
    enabled: githubApp.isEnabled(),
    setup,
    message: 'تم تنفيذ فحص إعداد GitHub App بنجاح',
  });
});

module.exports = router;
