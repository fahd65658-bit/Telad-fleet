'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { newId }       = require('../utils/helpers');
const { store }       = require('../config/database');

function audit(action, username) {
  store.auditLogs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

router.get('/', requireAuth(), (_req, res) => res.json(store.drivers));

router.post('/', requireAuth(['admin', 'supervisor']), (req, res) => {
  const d = { id: newId(), createdAt: new Date().toISOString(), status: 'active', ...req.body };
  store.drivers.push(d);
  audit('إضافة سائق: ' + d.name, req.user.username);
  res.status(201).json(d);
});

router.put('/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const idx = store.drivers.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'السائق غير موجود' });
  store.drivers[idx] = { ...store.drivers[idx], ...req.body, id: req.params.id };
  audit('تعديل سائق: ' + req.params.id, req.user.username);
  res.json(store.drivers[idx]);
});

router.delete('/:id', requireAuth(['admin']), (req, res) => {
  const idx = store.drivers.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'السائق غير موجود' });
  store.drivers.splice(idx, 1);
  audit('حذف سائق: ' + req.params.id, req.user.username);
  res.json({ ok: true });
});

module.exports = router;
