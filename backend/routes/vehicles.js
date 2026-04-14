'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/vehicleController');

function createRouter(auditLogs) {
  const router = Router();

  router.get('/',     requireAuth(),                                   ctrl.list(auditLogs));
  router.post('/',    requireAuth(['admin', 'supervisor', 'operator']), ctrl.create(auditLogs));
  router.put('/:id',  requireAuth(['admin', 'supervisor']),             ctrl.update(auditLogs));
  router.delete('/:id', requireAuth(['admin', 'supervisor']),           ctrl.remove(auditLogs));

  return router;
}

module.exports = createRouter;
