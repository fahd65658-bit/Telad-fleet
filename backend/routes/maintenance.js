'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/maintenanceController');

function createRouter() {
  const router = Router();
  const authAll      = requireAuth();
  const supervisorUp = requireAuth(['admin', 'supervisor']);

  router.get('/',           authAll,      ctrl.listMaintenance());
  router.post('/',          supervisorUp, ctrl.createMaintenance());
  router.put('/:id',        supervisorUp, ctrl.updateMaintenance());
  router.delete('/:id',     supervisorUp, ctrl.removeMaintenance());
  router.get('/incidents',  authAll,      ctrl.listIncidents());
  router.post('/incidents', supervisorUp, ctrl.createIncident());

  return router;
}

module.exports = createRouter;
