'use strict';

const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../middleware/auth');
const { newId, audit } = require('../utils/helpers');
const { store }        = require('../config/database');

router.get('/', requireAuth(), (_req, res) => res.json(store.vehicles));

router.post('/', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const v = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  store.vehicles.push(v);
  audit(store.auditLogs, 'إضافة مركبة: ' + (v.plate || v.name), req.user.username);
  res.status(201).json(v);
});

router.put('/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const idx = store.vehicles.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  store.vehicles[idx] = { ...store.vehicles[idx], ...req.body, id: req.params.id };
  audit(store.auditLogs, 'تعديل مركبة: ' + req.params.id, req.user.username);
  res.json(store.vehicles[idx]);
});

router.delete('/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const idx = store.vehicles.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  const label = store.vehicles[idx].plate || store.vehicles[idx].name;
  store.vehicles.splice(idx, 1);
  audit(store.auditLogs, 'حذف مركبة: ' + label, req.user.username);
  res.json({ ok: true });
});

module.exports = router;
