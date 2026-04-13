'use strict';

const crypto = require('crypto');

let maintenanceRecords = [];
let incidents = [];

function newId() { return crypto.randomUUID(); }

function audit(logs, action, username) {
  logs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

function listMaintenance() {
  return (_req, res) => res.json(maintenanceRecords);
}

function createMaintenance() {
  return (req, res) => {
    const { auditLogs } = req.app.locals;
    const record = { id: newId(), ...req.body, createdAt: new Date().toISOString() };
    maintenanceRecords.push(record);
    audit(auditLogs, 'إضافة سجل صيانة', req.user.username);
    res.status(201).json(record);
  };
}

function updateMaintenance() {
  return (req, res) => {
    const { auditLogs } = req.app.locals;
    const idx = maintenanceRecords.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'سجل الصيانة غير موجود' });
    maintenanceRecords[idx] = { ...maintenanceRecords[idx], ...req.body, id: maintenanceRecords[idx].id };
    audit(auditLogs, `تعديل سجل صيانة: ${maintenanceRecords[idx].id}`, req.user.username);
    res.json(maintenanceRecords[idx]);
  };
}

function removeMaintenance() {
  return (req, res) => {
    const { auditLogs } = req.app.locals;
    const idx = maintenanceRecords.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'سجل الصيانة غير موجود' });
    maintenanceRecords.splice(idx, 1);
    audit(auditLogs, `حذف سجل صيانة`, req.user.username);
    res.json({ ok: true });
  };
}

function listIncidents() {
  return (_req, res) => res.json(incidents);
}

function createIncident() {
  return (req, res) => {
    const { auditLogs } = req.app.locals;
    const incident = { id: newId(), ...req.body, createdAt: new Date().toISOString() };
    incidents.push(incident);
    audit(auditLogs, 'إضافة حادث', req.user.username);
    res.status(201).json(incident);
  };
}

module.exports = { listMaintenance, createMaintenance, updateMaintenance, removeMaintenance, listIncidents, createIncident };
