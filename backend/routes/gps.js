'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/gpsController');

function createRouter(io) {
  const router = Router();
  router.post('/', requireAuth(['admin', 'supervisor', 'operator']), ctrl.postGps(io));
  return router;
}

module.exports = createRouter;
