'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/userController');

function createRouter() {
  const router = Router();
  const adminOnly = requireAuth(['admin']);

  router.get('/',     adminOnly, ctrl.list());
  router.post('/',    adminOnly, ctrl.create());
  router.put('/:id',  adminOnly, ctrl.update());
  router.delete('/:id', adminOnly, ctrl.remove());

  return router;
}

module.exports = createRouter;
