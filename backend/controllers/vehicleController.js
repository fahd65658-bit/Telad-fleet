'use strict';

const crypto = require('crypto');

const vehicles = [];

function newId() { return crypto.randomUUID(); }

function audit(logs, action, username) {
  logs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

function list(auditLogs) {
  return (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const start = (page - 1) * limit;
    res.json({
      data:  vehicles.slice(start, start + limit),
      total: vehicles.length,
      page,
      limit,
    });
  };
}

function create(auditLogs) {
  return (req, res) => {
    const v = { id: newId(), ...req.body };
    vehicles.push(v);
    audit(auditLogs, 'إضافة مركبة', req.user.username);
    res.status(201).json(v);
  };
}

function update(auditLogs) {
  return (req, res) => {
    const idx = vehicles.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
    vehicles[idx] = { ...vehicles[idx], ...req.body, id: vehicles[idx].id };
    audit(auditLogs, `تعديل مركبة: ${vehicles[idx].plate || vehicles[idx].name}`, req.user.username);
    res.json(vehicles[idx]);
  };
}

function remove(auditLogs) {
  return (req, res) => {
    const idx = vehicles.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
    const plate = vehicles[idx].plate || vehicles[idx].name;
    vehicles.splice(idx, 1);
    audit(auditLogs, `حذف مركبة: ${plate}`, req.user.username);
    res.json({ ok: true });
  };
}

module.exports = { list, create, update, remove, vehicles };
