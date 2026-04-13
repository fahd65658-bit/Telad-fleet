'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/reportsController');

function createRouter() {
  const router = Router();

  router.get('/dashboard', requireAuth(),        ctrl.dashboard());
  router.get('/logs',      requireAuth(['admin']), ctrl.auditLogs());

  return router;
}

module.exports = createRouter;
