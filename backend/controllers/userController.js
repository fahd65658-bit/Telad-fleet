'use strict';

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { VALID_ROLES } = require('../utils/constants');

function newId() { return crypto.randomUUID(); }

function audit(logs, action, username) {
  logs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

function list() {
  return (req, res, next) => {
    const { users } = req.app.locals;
    res.json(users.map(({ passwordHash: _, ...u }) => u));
  };
}

function create() {
  return (req, res) => {
    const { users, auditLogs } = req.app.locals;
    const { name, username, email = '', password, role } = req.body || {};
    if (!name || !username || !password || !role)
      return res.status(400).json({ error: 'الحقول المطلوبة: الاسم، اسم المستخدم، كلمة المرور، الدور' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: `الدور غير صالح. الأدوار المتاحة: ${VALID_ROLES.join(', ')}` });
    if (users.find(u => u.username === username))
      return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });

    const user = { id: newId(), name, username, email, passwordHash: bcrypt.hashSync(password, 10), role, active: true, createdAt: new Date().toISOString() };
    users.push(user);
    audit(auditLogs, `إضافة مستخدم: ${username} (${role})`, req.user.username);
    const { passwordHash: _, ...safe } = user;
    res.status(201).json(safe);
  };
}

function update() {
  return (req, res) => {
    const { users, auditLogs } = req.app.locals;
    const idx = users.findIndex(u => String(u.id) === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (users[idx].id === 1) {
      if (req.body.role && req.body.role !== 'admin')
        return res.status(400).json({ error: 'لا يمكن تغيير دور المدير الرئيسي للنظام' });
      if (req.body.active === false)
        return res.status(400).json({ error: 'لا يمكن تعطيل المدير الرئيسي للنظام' });
    }

    const { name, email, role, active, password } = req.body;
    if (name     !== undefined) users[idx].name   = name;
    if (email    !== undefined) users[idx].email  = email;
    if (role && VALID_ROLES.includes(role)) users[idx].role = role;
    if (active   !== undefined) users[idx].active = Boolean(active);
    if (password) users[idx].passwordHash = bcrypt.hashSync(password, 10);

    audit(auditLogs, `تعديل مستخدم: ${users[idx].username}`, req.user.username);
    const { passwordHash: _, ...safe } = users[idx];
    res.json(safe);
  };
}

function remove() {
  return (req, res) => {
    const { users, auditLogs } = req.app.locals;
    const idx = users.findIndex(u => String(u.id) === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (users[idx].id === 1) return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي للنظام' });
    const username = users[idx].username;
    users.splice(idx, 1);
    audit(auditLogs, `حذف مستخدم: ${username}`, req.user.username);
    res.json({ ok: true });
  };
}

module.exports = { list, create, update, remove };
