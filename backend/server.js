
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Production Backend
// Domain : fna.sa   |   API : https://api.fna.sa
// Version: 2.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const crypto      = require('crypto');
const express     = require('express');
const http        = require('http');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const rateLimit   = require('express-rate-limit');
const { Server }  = require('socket.io');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT     = process.env.PORT || 5000;
const IS_PROD  = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'telad-fleet-dev-only-not-for-production';

if (IS_PROD && !process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET is not set in production; using fallback secret temporarily.');
}

const CORS_ORIGINS = [
  'https://fna.sa',
  'https://www.fna.sa',
  'https://fleet.fna.sa',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5500',  // VS Code Live Server (dev)
  'null',                    // file:// open in dev
];

// ─── App setup ───────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ['GET', 'POST'] },
});

app.set('trust proxy', 1);

// ─── Gzip compression ────────────────────────────────────────────────────────
app.use(compression({ threshold: 512 }));

// ─── Response-time header ────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const origEnd = res.end;
  let called = false;
  res.end = function (...args) {
    if (!called && !res.headersSent) {
      called = true;
      res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
    }
    return origEnd.apply(this, args);
  };
  next();
});

// Helmet with API-appropriate CSP (no HTML is served, but set safe defaults)
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'none'"],
      scriptSrc:   ["'none'"],
      styleSrc:    ["'none'"],
      connectSrc:  ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = CORS_ORIGINS.includes(origin)
      || origin.endsWith('.vercel.app')
      || origin.endsWith('.github.io');

    if (allowed) return cb(null, true);
    cb(new Error('CORS not allowed for: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ─── Rate limiting ───────────────────────────────────────────────────────────

// Strict limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'عدد محاولات تسجيل الدخول تجاوز الحد المسموح — حاول بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter applied to all other authenticated routes
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 120,
  message: { error: 'طلبات كثيرة جداً — حاول بعد لحظة' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // health check is always free
});

// ═══════════════════════════════════════════════════════════════════════════
// USERS  (in-memory store — swap for PostgreSQL in production)
// Default super-admin: username=F  password=0241
// ═══════════════════════════════════════════════════════════════════════════
const users = [
  {
    id: 1,
    name: 'مدير النظام',
    username: 'F',
    email: 'admin@fna.sa',
    passwordHash: bcrypt.hashSync('0241', 10),
    role: 'admin',   // admin | supervisor | operator | viewer
    active: true,
    createdAt: new Date().toISOString(),
  },
];

// Role permission levels
const VALID_ROLES = ['admin', 'supervisor', 'operator', 'viewer'];

// ─── ID generator (collision-safe) ───────────────────────────────────────────
function newId() {
  return crypto.randomUUID();
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'غير مصرح — يرجى تسجيل الدخول' });

    const token = header.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'رمز المصادقة مفقود' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'لا تملك الصلاحية الكافية لهذا الإجراء' });
      }
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'انتهت صلاحية الجلسة — يرجى إعادة تسجيل الدخول' });
    }
  };
}

const authAll      = requireAuth();
const adminOnly    = requireAuth(['admin']);
const supervisorUp = requireAuth(['admin', 'supervisor']);

// ─── Cache-Control helpers ───────────────────────────────────────────────────
// noCache: always fetch fresh (live counters, health)
function noCache(_req, res, next) { res.set('Cache-Control', 'no-store'); next(); }
// shortCache: authenticated list endpoints — 30 s client-side, not shared
function shortCache(_req, res, next) { res.set('Cache-Control', 'private, max-age=30'); next(); }

// ─── Apply global API rate limiter to all routes ─────────────────────────────
app.use(apiLimiter);

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
function buildHealthPayload() {
  const mem = process.memoryUsage();
  return {
    status:    'ok',
    system:    'TELAD FLEET',
    domain:    'fna.sa',
    timestamp: new Date().toISOString(),
    version:   '2.0.0',
    uptime:    Math.floor(process.uptime()),
    memory: {
      heapUsedMB:  +(mem.heapUsed  / 1024 / 1024).toFixed(1),
      heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(1),
      rssMB:       +(mem.rss       / 1024 / 1024).toFixed(1),
    },
    store: {
      cities:    cities.length,
      projects:  projects.length,
      vehicles:  vehicles.length,
      employees: employees.length,
      auditLogs: auditLogs.length,
      users:     users.length,
    },
  };
}

app.get('/health', noCache, (_req, res) => {
  res.json(buildHealthPayload());
});

// Emergency diagnostics endpoint (GET — read-only, admin-protected)
app.get('/api/v1/admin/diagnostics', adminOnly, noCache, (_req, res) => {
  res.json({
    ...buildHealthPayload(),
    node: process.version,
    pid:  process.pid,
    env:  process.env.NODE_ENV || 'development',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /auth/login
app.post('/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

  const user = users.find(u => u.username === username && u.active);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

  const payload = {
    id:       user.id,
    name:     user.name,
    username: user.username,
    email:    user.email,
    role:     user.role,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  audit('تسجيل دخول', user.username);
  res.json({ token, user: payload });
});

// GET /auth/me
app.get('/auth/me', authAll, (req, res) => res.json(req.user));

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT  (admin only)
// ═══════════════════════════════════════════════════════════════════════════

// GET /auth/users
app.get('/auth/users', adminOnly, (_req, res) => {
  res.json(users.map(({ passwordHash: _, ...u }) => u));
});

// POST /auth/users
app.post('/auth/users', adminOnly, (req, res) => {
  const { name, username, email = '', password, role } = req.body || {};
  if (!name || !username || !password || !role)
    return res.status(400).json({ error: 'الحقول المطلوبة: الاسم، اسم المستخدم، كلمة المرور، الدور' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: `الدور غير صالح. الأدوار المتاحة: ${VALID_ROLES.join(', ')}` });
  if (users.find(u => u.username === username))
    return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });

  const user = {
    id:           newId(),
    name,
    username,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    active:       true,
    createdAt:    new Date().toISOString(),
  };
  users.push(user);
  audit(`إضافة مستخدم: ${username} (${role})`, req.user.username);
  const { passwordHash: _, ...safe } = user;
  res.status(201).json(safe);
});

// PUT /auth/users/:id
app.put('/auth/users/:id', adminOnly, (req, res) => {
  const id  = req.params.id;
  const idx = users.findIndex(u => String(u.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });

  // Protect the original super-admin (numeric id=1)
  if (users[idx].id === 1) {
    if (req.body.role   && req.body.role !== 'admin')
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

  audit(`تعديل مستخدم: ${users[idx].username}`, req.user.username);
  const { passwordHash: _, ...safe } = users[idx];
  res.json(safe);
});

// DELETE /auth/users/:id
app.delete('/auth/users/:id', adminOnly, (req, res) => {
  const id  = req.params.id;
  const idx = users.findIndex(u => String(u.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
  // Protect original super-admin (numeric id=1)
  if (users[idx].id === 1) return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي للنظام' });
  const username = users[idx].username;
  users.splice(idx, 1);
  audit(`حذف مستخدم: ${username}`, req.user.username);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// GPS / SOCKET.IO  — real-time vehicle tracking
// ═══════════════════════════════════════════════════════════════════════════
io.on('connection', socket => {
  socket.on('gps', data => io.emit('gps-stream', data));
  socket.on('disconnect', () => {});
});

app.post('/gps', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  io.emit('gps-stream', req.body);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI PREDICT  (supervisor+)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/ai/predict', supervisorUp, (req, res) => {
  // Replace with real ML model in production
  res.json({
    risk:       +(Math.random() * 100).toFixed(1),
    confidence: +(50 + Math.random() * 50).toFixed(1),
    status:     'OK',
    model:      'telad-fleet-ai-v1',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CRUD DATA  (in-memory — replace with PostgreSQL using schema in /database/schema.sql)
// ═══════════════════════════════════════════════════════════════════════════
let cities    = [];
let projects  = [];
let vehicles  = [];
let employees = [];
let auditLogs = [];

function audit(action, username) {
  auditLogs.push({
    id:     newId(),
    action,
    user:   username,
    time:   new Date().toISOString(),
  });
}

// Dashboard summary
app.get('/dashboard', authAll, noCache, (_req, res) => {
  res.json({
    cities:    cities.length,
    projects:  projects.length,
    vehicles:  vehicles.length,
    employees: employees.length,
  });
});

// Cities
app.post('/cities', supervisorUp, (req, res) => {
  const c = { id: newId(), ...req.body };
  cities.push(c);
  audit('إضافة مدينة', req.user.username);
  res.status(201).json(c);
});
app.get('/cities', authAll, shortCache, (_req, res) => res.json(cities));

// Projects
app.post('/projects', supervisorUp, (req, res) => {
  const p = { id: newId(), ...req.body };
  projects.push(p);
  audit('إضافة مشروع', req.user.username);
  res.status(201).json(p);
});
app.get('/projects', authAll, shortCache, (_req, res) => res.json(projects));

// Vehicles
app.post('/vehicles', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const v = { id: newId(), ...req.body };
  vehicles.push(v);
  audit('إضافة مركبة', req.user.username);
  res.status(201).json(v);
});
app.get('/vehicles', authAll, shortCache, (_req, res) => res.json(vehicles));
app.delete('/vehicles/:id', supervisorUp, (req, res) => {
  const id  = req.params.id;
  const idx = vehicles.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  const plate = vehicles[idx].plate || vehicles[idx].name;
  vehicles.splice(idx, 1);
  audit(`حذف مركبة: ${plate}`, req.user.username);
  res.json({ ok: true });
});

// Employees
app.post('/employees', supervisorUp, (req, res) => {
  const e = { id: newId(), ...req.body };
  employees.push(e);
  audit('إضافة موظف', req.user.username);
  res.status(201).json(e);
});
app.get('/employees', authAll, shortCache, (_req, res) => res.json(employees));

// Audit logs (admin only)
app.get('/logs', adminOnly, (_req, res) => res.json(auditLogs));

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[TELAD FLEET ERROR]', err.message);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
function startServer(port = PORT) {
  return server.listen(port, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════╗');
    console.log('║       🚀 TELAD FLEET BACKEND          ║');
    console.log(`║       Running on port ${port}             ║`);
    console.log('║       Domain: https://fna.sa          ║');
    console.log('║       API:    https://fna.sa/api      ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('');
    console.log('  Admin login:  username=F  password=0241');
    console.log(`  Health:       http://localhost:${port}/health`);
    console.log('');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.startServer = startServer;
