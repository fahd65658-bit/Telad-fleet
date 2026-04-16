'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { newId, audit } = require('../utils/helpers');
const { store }        = require('../config/database');

router.get('/', requireAuth(), (_req, res) => res.json(store.forms));

router.post('/', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const f = { id: newId(), createdAt: new Date().toISOString(), status: 'pending', ...req.body };
  store.forms.push(f);
  audit(store.auditLogs, 'إضافة نموذج: ' + (f.type || ''), req.user.username);
  res.status(201).json(f);
});

router.put('/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const idx = store.forms.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'النموذج غير موجود' });
  store.forms[idx] = { ...store.forms[idx], ...req.body, id: req.params.id };
  res.json(store.forms[idx]);
});

router.delete('/:id', requireAuth(['admin']), (req, res) => {
  const idx = store.forms.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'النموذج غير موجود' });
  store.forms.splice(idx, 1);
  res.json({ ok: true });
});

module.exports = router;
