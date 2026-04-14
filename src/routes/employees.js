'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { newId }       = require('../utils/helpers');
const { store }       = require('../config/database');

function audit(action, username) {
  store.auditLogs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

router.get('/', requireAuth(), (_req, res) => res.json(store.employees));

router.post('/', requireAuth(['admin', 'supervisor']), (req, res) => {
  const e = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  store.employees.push(e);
  audit('إضافة موظف: ' + e.name, req.user.username);
  res.status(201).json(e);
});

router.put('/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const idx = store.employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الموظف غير موجود' });
  store.employees[idx] = { ...store.employees[idx], ...req.body, id: req.params.id };
  audit('تعديل موظف: ' + req.params.id, req.user.username);
  res.json(store.employees[idx]);
});

router.delete('/:id', requireAuth(['admin']), (req, res) => {
  const idx = store.employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الموظف غير موجود' });
  store.employees.splice(idx, 1);
  audit('حذف موظف: ' + req.params.id, req.user.username);
  res.json({ ok: true });
});

module.exports = router;
