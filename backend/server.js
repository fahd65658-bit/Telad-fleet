
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Production Backend
// Domain : fna.sa   |   API : https://api.fna.sa
// Version: 2.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const crypto    = require('crypto');
const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT     = process.env.PORT || 5000;
const IS_PROD  = process.env.NODE_ENV === 'production';

// Fail fast in production if JWT_SECRET is not set
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable must be set in production.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'telad-fleet-dev-only-not-for-production';

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
    if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
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

// ─── Apply global API rate limiter to all routes ─────────────────────────────
app.use(apiLimiter);

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'TELAD FLEET',
    domain: 'fna.sa',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
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
let cities        = [];
let projects      = [];
let vehicles      = [];
let employees     = [];
let drivers       = [];
let maintenanceJobs = [];
let appointments  = [];
let regions       = [];
let reports       = [];
let notifications = [];
let auditLogs     = [];

function audit(action, username) {
  auditLogs.push({
    id:     newId(),
    action,
    user:   username,
    time:   new Date().toISOString(),
  });
}

// ─── Dashboard summary ────────────────────────────────────────────────────────
app.get('/dashboard', authAll, (_req, res) =>
  res.json({
    cities:       cities.length,
    projects:     projects.length,
    vehicles:     vehicles.length,
    employees:    employees.length,
    drivers:      drivers.length,
    maintenance:  maintenanceJobs.filter(m => m.status !== 'completed').length,
    appointments: appointments.filter(a => a.status === 'pending').length,
    regions:      regions.length,
  })
);

// ─── Cities ───────────────────────────────────────────────────────────────────
app.post('/cities', supervisorUp, (req, res) => {
  const c = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  cities.push(c);
  audit('إضافة مدينة', req.user.username);
  res.status(201).json(c);
});
app.get('/cities', authAll, (_req, res) => res.json(cities));

// ─── Projects ─────────────────────────────────────────────────────────────────
app.post('/projects', supervisorUp, (req, res) => {
  const p = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  projects.push(p);
  audit('إضافة مشروع', req.user.username);
  res.status(201).json(p);
});
app.get('/projects', authAll, (_req, res) => res.json(projects));

// ─── Vehicles ─────────────────────────────────────────────────────────────────
app.post('/vehicles', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const v = { id: newId(), status: 'active', createdAt: new Date().toISOString(), ...req.body };
  vehicles.push(v);
  audit('إضافة مركبة', req.user.username);
  res.status(201).json(v);
});
app.get('/vehicles', authAll, (_req, res) => res.json(vehicles));
app.get('/vehicles/:id', authAll, (req, res) => {
  const v = vehicles.find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'المركبة غير موجودة' });
  res.json(v);
});
app.put('/vehicles/:id', supervisorUp, (req, res) => {
  const idx = vehicles.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  vehicles[idx] = { ...vehicles[idx], ...req.body, id: vehicles[idx].id, updatedAt: new Date().toISOString() };
  audit(`تعديل مركبة: ${vehicles[idx].plate || vehicles[idx].name}`, req.user.username);
  res.json(vehicles[idx]);
});
app.delete('/vehicles/:id', supervisorUp, (req, res) => {
  const idx = vehicles.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  const plate = vehicles[idx].plate || vehicles[idx].name;
  vehicles.splice(idx, 1);
  audit(`حذف مركبة: ${plate}`, req.user.username);
  res.json({ ok: true });
});

// ─── Employees ────────────────────────────────────────────────────────────────
app.post('/employees', supervisorUp, (req, res) => {
  const e = { id: newId(), createdAt: new Date().toISOString(), ...req.body };
  employees.push(e);
  audit('إضافة موظف', req.user.username);
  res.status(201).json(e);
});
app.get('/employees', authAll, (_req, res) => res.json(employees));

// ─── Drivers ──────────────────────────────────────────────────────────────────
app.get('/drivers', authAll, (_req, res) => res.json(drivers));
app.post('/drivers', supervisorUp, (req, res) => {
  const { name, phone, licenseNo, licenseExpiry, vehicleId, status = 'active' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم السائق مطلوب' });
  const d = {
    id: newId(),
    name,
    phone:         phone         || '',
    licenseNo:     licenseNo     || '',
    licenseExpiry: licenseExpiry || null,
    vehicleId:     vehicleId     || null,
    status,
    createdAt: new Date().toISOString(),
  };
  drivers.push(d);
  audit(`إضافة سائق: ${name}`, req.user.username);
  res.status(201).json(d);
});
app.put('/drivers/:id', supervisorUp, (req, res) => {
  const idx = drivers.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'السائق غير موجود' });
  drivers[idx] = { ...drivers[idx], ...req.body, id: drivers[idx].id, updatedAt: new Date().toISOString() };
  audit(`تعديل سائق: ${drivers[idx].name}`, req.user.username);
  res.json(drivers[idx]);
});
app.delete('/drivers/:id', supervisorUp, (req, res) => {
  const idx = drivers.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'السائق غير موجود' });
  const name = drivers[idx].name;
  drivers.splice(idx, 1);
  audit(`حذف سائق: ${name}`, req.user.username);
  res.json({ ok: true });
});

// ─── Maintenance ──────────────────────────────────────────────────────────────
app.get('/maintenance', authAll, (_req, res) => res.json(maintenanceJobs));
app.post('/maintenance', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const { vehicleId, type, description, scheduledDate, cost } = req.body || {};
  if (!vehicleId || !type) return res.status(400).json({ error: 'معرّف المركبة ونوع الصيانة مطلوبان' });
  const job = {
    id: newId(),
    vehicleId,
    type,
    description:   description   || '',
    scheduledDate: scheduledDate || null,
    cost:          cost          ?? null,
    status:        'pending',
    completedDate: null,
    createdAt:     new Date().toISOString(),
    createdBy:     req.user.username,
  };
  maintenanceJobs.push(job);
  audit(`إضافة مهمة صيانة: ${type}`, req.user.username);
  res.status(201).json(job);
});
app.put('/maintenance/:id', supervisorUp, (req, res) => {
  const idx = maintenanceJobs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'مهمة الصيانة غير موجودة' });
  maintenanceJobs[idx] = { ...maintenanceJobs[idx], ...req.body, id: maintenanceJobs[idx].id, updatedAt: new Date().toISOString() };
  audit(`تعديل مهمة صيانة: ${maintenanceJobs[idx].type}`, req.user.username);
  res.json(maintenanceJobs[idx]);
});
app.post('/maintenance/:id/complete', supervisorUp, (req, res) => {
  const idx = maintenanceJobs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'مهمة الصيانة غير موجودة' });
  maintenanceJobs[idx].status        = 'completed';
  maintenanceJobs[idx].completedDate = new Date().toISOString();
  if (req.body.cost !== undefined) maintenanceJobs[idx].cost = req.body.cost;
  audit(`إتمام مهمة صيانة: ${maintenanceJobs[idx].type}`, req.user.username);
  res.json(maintenanceJobs[idx]);
});
app.delete('/maintenance/:id', supervisorUp, (req, res) => {
  const idx = maintenanceJobs.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'مهمة الصيانة غير موجودة' });
  maintenanceJobs.splice(idx, 1);
  audit('حذف مهمة صيانة', req.user.username);
  res.json({ ok: true });
});

// ─── Appointments ─────────────────────────────────────────────────────────────
app.get('/appointments', authAll, (_req, res) => res.json(appointments));
app.post('/appointments', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const { vehicleId, driverId, type, scheduledAt, notes } = req.body || {};
  if (!vehicleId || !type || !scheduledAt)
    return res.status(400).json({ error: 'معرّف المركبة والنوع والموعد مطلوبة' });
  const appt = {
    id: newId(),
    vehicleId,
    driverId:    driverId || null,
    type,
    scheduledAt,
    notes:       notes || '',
    status:      'pending',
    createdAt:   new Date().toISOString(),
    createdBy:   req.user.username,
  };
  appointments.push(appt);
  audit(`إضافة موعد: ${type}`, req.user.username);
  res.status(201).json(appt);
});
app.put('/appointments/:id', supervisorUp, (req, res) => {
  const idx = appointments.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الموعد غير موجود' });
  appointments[idx] = { ...appointments[idx], ...req.body, id: appointments[idx].id, updatedAt: new Date().toISOString() };
  audit(`تعديل موعد: ${appointments[idx].type}`, req.user.username);
  res.json(appointments[idx]);
});
app.post('/appointments/:id/confirm', supervisorUp, (req, res) => {
  const idx = appointments.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الموعد غير موجود' });
  appointments[idx].status      = 'confirmed';
  appointments[idx].confirmedAt = new Date().toISOString();
  audit(`تأكيد موعد: ${appointments[idx].type}`, req.user.username);
  res.json(appointments[idx]);
});
app.post('/appointments/:id/cancel', supervisorUp, (req, res) => {
  const idx = appointments.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الموعد غير موجود' });
  appointments[idx].status     = 'cancelled';
  appointments[idx].cancelledAt = new Date().toISOString();
  audit(`إلغاء موعد: ${appointments[idx].type}`, req.user.username);
  res.json(appointments[idx]);
});
app.delete('/appointments/:id', supervisorUp, (req, res) => {
  const idx = appointments.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الموعد غير موجود' });
  appointments.splice(idx, 1);
  audit('حذف موعد', req.user.username);
  res.json({ ok: true });
});

// ─── Regions ──────────────────────────────────────────────────────────────────
app.get('/regions', authAll, (_req, res) => res.json(regions));
app.post('/regions', supervisorUp, (req, res) => {
  const { name, description, coordinates } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المنطقة مطلوب' });
  const r = {
    id: newId(),
    name,
    description:  description  || '',
    coordinates:  coordinates  || null,
    createdAt:    new Date().toISOString(),
    createdBy:    req.user.username,
  };
  regions.push(r);
  audit(`إضافة منطقة: ${name}`, req.user.username);
  res.status(201).json(r);
});
app.put('/regions/:id', supervisorUp, (req, res) => {
  const idx = regions.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المنطقة غير موجودة' });
  regions[idx] = { ...regions[idx], ...req.body, id: regions[idx].id, updatedAt: new Date().toISOString() };
  audit(`تعديل منطقة: ${regions[idx].name}`, req.user.username);
  res.json(regions[idx]);
});
app.delete('/regions/:id', supervisorUp, (req, res) => {
  const idx = regions.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المنطقة غير موجودة' });
  const name = regions[idx].name;
  regions.splice(idx, 1);
  audit(`حذف منطقة: ${name}`, req.user.username);
  res.json({ ok: true });
});

// ─── Reports ──────────────────────────────────────────────────────────────────
app.get('/reports', authAll, (_req, res) => res.json(reports));
app.post('/reports/generate', supervisorUp, (req, res) => {
  const { title, type } = req.body || {};
  if (!title || !type) return res.status(400).json({ error: 'عنوان التقرير ونوعه مطلوبان' });

  const data = (() => {
    switch (type) {
      case 'vehicles':    return { count: vehicles.length,      items: vehicles };
      case 'drivers':     return { count: drivers.length,       items: drivers };
      case 'maintenance': return { count: maintenanceJobs.length, pending: maintenanceJobs.filter(m => m.status !== 'completed').length, items: maintenanceJobs };
      case 'appointments':return { count: appointments.length,  items: appointments };
      default:            return { vehicles: vehicles.length, drivers: drivers.length, maintenance: maintenanceJobs.length, appointments: appointments.length };
    }
  })();

  const report = {
    id:        newId(),
    title,
    type,
    data,
    createdBy: req.user.username,
    createdAt: new Date().toISOString(),
  };
  reports.push(report);
  audit(`إنشاء تقرير: ${title}`, req.user.username);
  res.status(201).json(report);
});
app.get('/reports/analytics', authAll, (_req, res) => {
  res.json({
    summary: {
      vehicles:           vehicles.length,
      drivers:            drivers.length,
      maintenancePending: maintenanceJobs.filter(m => m.status !== 'completed').length,
      maintenanceDone:    maintenanceJobs.filter(m => m.status === 'completed').length,
      appointmentsPending:appointments.filter(a => a.status === 'pending').length,
      appointmentsConfirmed: appointments.filter(a => a.status === 'confirmed').length,
      regions:            regions.length,
    },
    vehiclesByStatus: {
      active:      vehicles.filter(v => v.status === 'active').length,
      maintenance: vehicles.filter(v => v.status === 'maintenance').length,
      inactive:    vehicles.filter(v => v.status === 'inactive').length,
    },
    driversByStatus: {
      active:   drivers.filter(d => d.status === 'active').length,
      inactive: drivers.filter(d => d.status !== 'active').length,
    },
    generatedAt: new Date().toISOString(),
  });
});

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
server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       🚀 TELAD FLEET BACKEND          ║');
  console.log(`║       Running on port ${PORT}             ║`);
  console.log('║       Domain: https://fna.sa          ║');
  console.log('║       API:    https://api.fna.sa      ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log(`  Admin login:  username=F  password=0241`);
  console.log(`  Health:       http://localhost:${PORT}/health`);
  console.log('');
});
