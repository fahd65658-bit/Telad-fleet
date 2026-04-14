'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { newId }       = require('../utils/helpers');
const { store }       = require('../config/database');

function audit(action, username) {
  store.auditLogs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

router.get('/', requireAuth(), (_req, res) => res.json(store.maintenance));

router.post('/', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const m = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  store.maintenance.push(m);
  audit('إضافة صيانة للمركبة: ' + (m.vehicleId || ''), req.user.username);
  res.status(201).json(m);
});

router.put('/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const idx = store.maintenance.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'سجل الصيانة غير موجود' });
  store.maintenance[idx] = { ...store.maintenance[idx], ...req.body, id: req.params.id };
  res.json(store.maintenance[idx]);
});

router.delete('/:id', requireAuth(['admin']), (req, res) => {
  const idx = store.maintenance.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'سجل الصيانة غير موجود' });
  store.maintenance.splice(idx, 1);
  res.json({ ok: true });
});

module.exports = router;
