'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/reportsController');
const { vehicles } = require('../controllers/vehicleController');

function createRouter() {
  const router = Router();

  router.get('/dashboard', requireAuth(),          ctrl.dashboard(vehicles));
  router.get('/logs',      requireAuth(['admin']),  ctrl.auditLogs());

  return router;
}

module.exports = createRouter;
