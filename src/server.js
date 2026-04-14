'use strict';

const { PORT, CORS_ORIGINS } = require('./config/environment');
const { loginLimiter, apiLimiter } = require('./config/security');
const { notFound, errorHandler } = require('./middleware/error');
const { requireAuth, VALID_ROLES } = require('./middleware/auth');
const { newId, audit }  = require('./utils/helpers');
const { store }  = require('./config/database');
const logger     = require('./utils/logger');
const { healthCheck } = require('./controllers/health');

const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { Server } = require('socket.io');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('./config/environment');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ['GET', 'POST'] },
});

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'none'"],
      scriptSrc:      ["'none'"],
      styleSrc:       ["'none'"],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS not allowed for: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', healthCheck);

// ── Auth ──────────────────────────────────────────────────────────────────────
function auditLog(action, username) {
  audit(store.auditLogs, action, username);
}

app.post('/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

  const user = store.users.find(u => u.username === username && u.active);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

  const payload = { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  auditLog('تسجيل دخول', user.username);
  res.json({ token, user: payload });
});

app.get('/auth/me', requireAuth(), (req, res) => res.json(req.user));

app.get('/auth/users', requireAuth(['admin']), (_req, res) => {
  res.json(store.users.map(({ passwordHash: _, ...u }) => u));
});

app.post('/auth/users', requireAuth(['admin']), (req, res) => {
  const { name, username, email = '', password, role } = req.body || {};
  if (!name || !username || !password || !role)
    return res.status(400).json({ error: 'الحقول المطلوبة: الاسم، اسم المستخدم، كلمة المرور، الدور' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: `الدور غير صالح. الأدوار: ${VALID_ROLES.join(', ')}` });
  if (store.users.find(u => u.username === username))
    return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });

  const user = { id: newId(), name, username, email, passwordHash: bcrypt.hashSync(password, 10), role, active: true, createdAt: new Date().toISOString() };
  store.users.push(user);
  auditLog(`إضافة مستخدم: ${username} (${role})`, req.user.username);
  const { passwordHash: _, ...safe } = user;
  res.status(201).json(safe);
});

app.put('/auth/users/:id', requireAuth(['admin']), (req, res) => {
  const idx = store.users.findIndex(u => String(u.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (String(store.users[idx].id) === '1') {
    if (req.body.role && req.body.role !== 'admin') return res.status(400).json({ error: 'لا يمكن تغيير دور المدير الرئيسي' });
    if (req.body.active === false) return res.status(400).json({ error: 'لا يمكن تعطيل المدير الرئيسي' });
  }
  const { name, email, role, active, password } = req.body;
  if (name  !== undefined) store.users[idx].name   = name;
  if (email !== undefined) store.users[idx].email  = email;
  if (role && VALID_ROLES.includes(role)) store.users[idx].role = role;
  if (active !== undefined) store.users[idx].active = Boolean(active);
  if (password) store.users[idx].passwordHash = bcrypt.hashSync(password, 10);
  auditLog(`تعديل مستخدم: ${store.users[idx].username}`, req.user.username);
  const { passwordHash: _, ...safe } = store.users[idx];
  res.json(safe);
});

app.delete('/auth/users/:id', requireAuth(['admin']), (req, res) => {
  const idx = store.users.findIndex(u => String(u.id) === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (String(store.users[idx].id) === '1') return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي' });
  const username = store.users[idx].username;
  store.users.splice(idx, 1);
  auditLog(`حذف مستخدم: ${username}`, req.user.username);
  res.json({ ok: true });
});

// ── GPS ───────────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('gps', data => io.emit('gps-stream', data));
});

app.post('/gps', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  io.emit('gps-stream', req.body);
  res.json({ ok: true });
});

// ── AI predict ────────────────────────────────────────────────────────────────
app.get('/ai/predict', requireAuth(['admin', 'supervisor']), (_req, res) => {
  res.json({
    risk:       +(Math.random() * 100).toFixed(1),
    confidence: +(50 + Math.random() * 50).toFixed(1),
    status:     'OK',
    model:      'telad-fleet-ai-v1',
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/dashboard', requireAuth(), (_req, res) =>
  res.json({
    cities:    store.cities.length,
    projects:  store.projects.length,
    vehicles:  store.vehicles.length,
    employees: store.employees.length,
    drivers:   store.drivers.length,
  })
);

// ── CRUD routes ───────────────────────────────────────────────────────────────
app.use('/vehicles',   require('./routes/vehicles'));
app.use('/employees',  require('./routes/employees'));
app.use('/drivers',    require('./routes/drivers'));
app.use('/maintenance',require('./routes/maintenance'));
app.use('/forms',      require('./routes/forms'));

// Cities & Projects (inline)
app.get('/cities',  requireAuth(), (_req, res) => res.json(store.cities));
app.post('/cities', requireAuth(['admin', 'supervisor']), (req, res) => {
  const c = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  store.cities.push(c);
  res.status(201).json(c);
});

app.get('/projects',  requireAuth(), (_req, res) => res.json(store.projects));
app.post('/projects', requireAuth(['admin', 'supervisor']), (req, res) => {
  const p = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  store.projects.push(p);
  res.status(201).json(p);
});

// Audit logs
app.get('/logs', requireAuth(['admin']), (_req, res) => res.json(store.auditLogs));

// ── Error handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  logger.info(`TELAD FLEET backend running on port ${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
});

module.exports = { app, server };
