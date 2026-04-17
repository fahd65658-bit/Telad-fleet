
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
// AI INSIGHTS  (supervisor+)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/ai/predict', supervisorUp, (req, res) => {
  // Legacy endpoint — kept for backward compatibility
  res.json({ risk: 0, confidence: 100, status: 'OK', model: 'telad-fleet-ai-v2' });
});

app.get('/ai/insights', supervisorUp, (_req, res) => {
  const now         = new Date();
  const in30Days    = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alerts      = [];
  const recommendations = [];

  // License expiry alerts
  drivers.forEach(d => {
    if (d.licenseExpiry) {
      const exp = new Date(d.licenseExpiry);
      if (exp <= now) {
        alerts.push({ type: 'danger', message: `رخصة السائق ${d.name} منتهية الصلاحية منذ ${formatDaysAgo(exp, now)}` });
      } else if (exp <= in30Days) {
        alerts.push({ type: 'warning', message: `رخصة السائق ${d.name} ستنتهي خلال ${Math.ceil((exp - now) / 86400000)} يوم` });
      }
    }
  });

  // Pending maintenance alerts
  const pendingMaint = maintenanceJobs.filter(m => m.status === 'pending');
  if (pendingMaint.length > 0) {
    alerts.push({ type: 'warning', message: `يوجد ${pendingMaint.length} مهمة صيانة معلّقة` });
  }

  // Unpaid violations alerts
  const unpaidViolations = violations.filter(v => v.status === 'unpaid');
  if (unpaidViolations.length > 0) {
    const totalAmount = unpaidViolations.reduce((s, v) => s + (Number(v.amount) || 0), 0);
    alerts.push({ type: 'danger', message: `يوجد ${unpaidViolations.length} مخالفة غير مسددة بإجمالي ${totalAmount.toFixed(2)} ر.س` });
  }

  // Open accidents alerts
  const openAccidents = accidents.filter(a => a.status === 'open');
  if (openAccidents.length > 0) {
    alerts.push({ type: 'warning', message: `يوجد ${openAccidents.length} حادث مفتوح يحتاج إلى متابعة` });
  }

  // AI Recommendations
  const vehiclesInMaint = vehicles.filter(v => v.status === 'maintenance').length;
  const activeVehicles  = vehicles.filter(v => v.status === 'active').length;
  if (vehicles.length > 0 && vehiclesInMaint > vehicles.length * 0.3) {
    recommendations.push({ icon: '🔧', message: 'نسبة المركبات في الصيانة مرتفعة — يُنصح بمراجعة جدول الصيانة الوقائية' });
  }

  const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recentFuelCost = financialItems
    .filter(f => f.type === 'fuel' && f.date >= last30Start)
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);
  if (recentFuelCost > 5000) {
    recommendations.push({ icon: '⛽', message: `تكاليف الوقود الشهرية مرتفعة (${recentFuelCost.toFixed(2)} ر.س) — يُنصح بمراجعة استهلاك الوقود` });
  }

  if (violations.length > 5) {
    recommendations.push({ icon: '🚦', message: 'عدد المخالفات مرتفع — يُنصح بتعزيز برامج توعية السائقين بقواعد المرور' });
  }

  if (pendingMaint.length === 0 && unpaidViolations.length === 0 && openAccidents.length === 0) {
    recommendations.push({ icon: '✅', message: 'الأسطول في حالة ممتازة — استمر في الصيانة الوقائية المنتظمة' });
  }

  // Fleet health score (0-100)
  let score = 100;
  if (vehicles.length > 0) {
    const inactiveRatio = (vehicles.length - activeVehicles) / vehicles.length;
    score -= Math.round(inactiveRatio * 30);
  }
  if (maintenanceJobs.length > 0) {
    const pendingRatio = pendingMaint.length / maintenanceJobs.length;
    score -= Math.round(pendingRatio * 20);
  }
  score -= Math.min(unpaidViolations.length * 3, 20);
  score -= Math.min(openAccidents.length * 5, 20);
  score -= drivers.filter(d => d.licenseExpiry && new Date(d.licenseExpiry) <= now).length * 5;
  score  = Math.max(0, Math.min(100, score));

  // Trends (last 3 months maintenance cost)
  const trends = [];
  for (let i = 2; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('ar', { month: 'long', year: 'numeric' });
    const from  = d.toISOString().slice(0, 7);
    const cost  = maintenanceJobs
      .filter(m => m.completedDate && m.completedDate.slice(0, 7) === from && m.cost)
      .reduce((s, m) => s + (Number(m.cost) || 0), 0);
    trends.push({ month: label, maintenanceCost: +cost.toFixed(2) });
  }

  res.json({ alerts, recommendations, summary: { healthScore: score, totalVehicles: vehicles.length, activeVehicles, pendingMaintenance: pendingMaint.length, unpaidViolations: unpaidViolations.length, openAccidents: openAccidents.length }, trends });
});

// ─── AI helper ────────────────────────────────────────────────────────────────
function formatDaysAgo(past, now) {
  const days = Math.floor((now - past) / 86400000);
  return days === 0 ? 'اليوم' : `${days} يوم`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CHAT / QUERY  (supervisor+)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/ai/query', supervisorUp, (req, res) => {
  const q = (req.body?.question || '').toLowerCase();
  let answer, data;

  if (q.includes('مركب') || q.includes('vehicle')) {
    const active      = vehicles.filter(v => v.status === 'active').length;
    const inMaint     = vehicles.filter(v => v.status === 'maintenance').length;
    const inactive    = vehicles.filter(v => v.status === 'inactive').length;
    answer = `إجمالي المركبات: ${vehicles.length} — نشطة: ${active} — في الصيانة: ${inMaint} — غير نشطة: ${inactive}`;
    data   = { total: vehicles.length, active, inMaintenance: inMaint, inactive };
  } else if (q.includes('سائق') || q.includes('driver')) {
    const active   = drivers.filter(d => d.status === 'active').length;
    const expired  = drivers.filter(d => d.licenseExpiry && new Date(d.licenseExpiry) < new Date()).length;
    answer = `إجمالي السائقين: ${drivers.length} — نشطون: ${active} — رخصة منتهية: ${expired}`;
    data   = { total: drivers.length, active, expiredLicense: expired };
  } else if (q.includes('صيان') || q.includes('maintenance')) {
    const pending   = maintenanceJobs.filter(m => m.status === 'pending').length;
    const completed = maintenanceJobs.filter(m => m.status === 'completed').length;
    answer = `مهام الصيانة: ${maintenanceJobs.length} — معلّقة: ${pending} — مكتملة: ${completed}`;
    data   = { total: maintenanceJobs.length, pending, completed };
  } else if (q.includes('مخالف') || q.includes('violation')) {
    const unpaid  = violations.filter(v => v.status === 'unpaid').length;
    const paid    = violations.filter(v => v.status === 'paid').length;
    const total   = violations.reduce((s, v) => s + (Number(v.amount) || 0), 0);
    answer = `المخالفات: ${violations.length} — غير مسددة: ${unpaid} — مسددة: ${paid} — الإجمالي: ${total.toFixed(2)} ر.س`;
    data   = { total: violations.length, unpaid, paid, totalAmount: +total.toFixed(2) };
  } else if (q.includes('حادث') || q.includes('accident')) {
    const open   = accidents.filter(a => a.status === 'open').length;
    const closed = accidents.filter(a => a.status === 'closed').length;
    const damage = accidents.reduce((s, a) => s + (Number(a.damageAmount) || 0), 0);
    answer = `الحوادث: ${accidents.length} — مفتوحة: ${open} — مغلقة: ${closed} — إجمالي الأضرار: ${damage.toFixed(2)} ر.س`;
    data   = { total: accidents.length, open, closed, totalDamage: +damage.toFixed(2) };
  } else if (q.includes('مال') || q.includes('financial') || q.includes('مصروف')) {
    const total   = financialItems.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const byType  = {};
    financialItems.forEach(f => { byType[f.type] = (byType[f.type] || 0) + (Number(f.amount) || 0); });
    answer = `إجمالي المصروفات: ${total.toFixed(2)} ر.س — وقود: ${(byType.fuel || 0).toFixed(2)} — صيانة: ${(byType.maintenance || 0).toFixed(2)} — مخالفات: ${(byType.violation || 0).toFixed(2)}`;
    data   = { total: +total.toFixed(2), byType };
  } else if (q.includes('تنبيه') || q.includes('تحذير') || q.includes('alert')) {
    const expiredLicenses = drivers.filter(d => d.licenseExpiry && new Date(d.licenseExpiry) < new Date()).length;
    const unpaid = violations.filter(v => v.status === 'unpaid').length;
    const pendingMaint = maintenanceJobs.filter(m => m.status === 'pending').length;
    answer = `التنبيهات النشطة — رخص منتهية: ${expiredLicenses} — مخالفات غير مسددة: ${unpaid} — صيانة معلّقة: ${pendingMaint}`;
    data   = { expiredLicenses, unpaidViolations: unpaid, pendingMaintenance: pendingMaint };
  } else {
    answer = `ملخص الأسطول: ${vehicles.length} مركبة — ${drivers.length} سائق — ${maintenanceJobs.filter(m => m.status !== 'completed').length} صيانة معلّقة — ${violations.filter(v => v.status === 'unpaid').length} مخالفة غير مسددة — ${accidents.filter(a => a.status === 'open').length} حادث مفتوح`;
    data   = { vehicles: vehicles.length, drivers: drivers.length, pendingMaintenance: maintenanceJobs.filter(m => m.status !== 'completed').length, unpaidViolations: violations.filter(v => v.status === 'unpaid').length, openAccidents: accidents.filter(a => a.status === 'open').length };
  }

  res.json({ answer, data });
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
let accidents     = [];
let violations    = [];
let financialItems = [];

function audit(action, username) {
  auditLogs.push({
    id:     newId(),
    action,
    user:   username,
    time:   new Date().toISOString(),
  });
}

// ─── Notification helper ──────────────────────────────────────────────────────
function createNotification(userId, title, body, type = 'info') {
  notifications.push({
    id:        newId(),
    userId,
    title,
    body,
    type,
    read:      false,
    createdAt: new Date().toISOString(),
  });
}

// ─── Dashboard summary ────────────────────────────────────────────────────────
app.get('/dashboard', authAll, (_req, res) => {
  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const financialThisMonth = financialItems
    .filter(f => f.date >= monthStart.slice(0, 10))
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  res.json({
    cities:           cities.length,
    projects:         projects.length,
    vehicles:         vehicles.length,
    employees:        employees.length,
    drivers:          drivers.length,
    maintenance:      maintenanceJobs.filter(m => m.status !== 'completed').length,
    appointments:     appointments.filter(a => a.status === 'pending').length,
    regions:          regions.length,
    accidents:        accidents.length,
    violationsUnpaid: violations.filter(v => v.status === 'unpaid').length,
    financialMonth:   +financialThisMonth.toFixed(2),
  });
});

// ─── Cities ───────────────────────────────────────────────────────────────────
app.post('/cities', supervisorUp, (req, res) => {
  const c = { ...req.body, id: newId(), createdAt: new Date().toISOString() };
  cities.push(c);
  audit('إضافة مدينة', req.user.username);
  res.status(201).json(c);
});
app.get('/cities', authAll, (_req, res) => res.json(cities));

// ─── Projects ─────────────────────────────────────────────────────────────────
app.post('/projects', supervisorUp, (req, res) => {
  const p = { ...req.body, id: newId(), createdAt: new Date().toISOString() };
  projects.push(p);
  audit('إضافة مشروع', req.user.username);
  res.status(201).json(p);
});
app.get('/projects', authAll, (_req, res) => res.json(projects));

// ─── Vehicles ─────────────────────────────────────────────────────────────────
app.post('/vehicles', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const v = { ...req.body, id: newId(), status: req.body.status || 'active', createdAt: new Date().toISOString() };
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
  const { name, plate, city, driver, status, model, year } = req.body;
  const allowed = {};
  if (name   !== undefined) allowed.name   = name;
  if (plate  !== undefined) allowed.plate  = plate;
  if (city   !== undefined) allowed.city   = city;
  if (driver !== undefined) allowed.driver = driver;
  if (status !== undefined) allowed.status = status;
  if (model  !== undefined) allowed.model  = model;
  if (year   !== undefined) allowed.year   = year;
  vehicles[idx] = { ...vehicles[idx], ...allowed, id: vehicles[idx].id, updatedAt: new Date().toISOString() };
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
  const e = { ...req.body, id: newId(), createdAt: new Date().toISOString() };
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
  const { name, phone, licenseNo, licenseExpiry, vehicleId, status } = req.body;
  const allowed = {};
  if (name          !== undefined) allowed.name          = name;
  if (phone         !== undefined) allowed.phone         = phone;
  if (licenseNo     !== undefined) allowed.licenseNo     = licenseNo;
  if (licenseExpiry !== undefined) allowed.licenseExpiry = licenseExpiry;
  if (vehicleId     !== undefined) allowed.vehicleId     = vehicleId;
  if (status        !== undefined) allowed.status        = status;
  drivers[idx] = { ...drivers[idx], ...allowed, id: drivers[idx].id, updatedAt: new Date().toISOString() };
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
  const { vehicleId, type, description, scheduledDate, cost, status } = req.body;
  const allowed = {};
  if (vehicleId     !== undefined) allowed.vehicleId     = vehicleId;
  if (type          !== undefined) allowed.type          = type;
  if (description   !== undefined) allowed.description   = description;
  if (scheduledDate !== undefined) allowed.scheduledDate = scheduledDate;
  if (cost          !== undefined) allowed.cost          = cost;
  if (status        !== undefined) allowed.status        = status;
  maintenanceJobs[idx] = { ...maintenanceJobs[idx], ...allowed, id: maintenanceJobs[idx].id, updatedAt: new Date().toISOString() };
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
  const { vehicleId, driverId, type, scheduledAt, notes, status } = req.body;
  const allowed = {};
  if (vehicleId   !== undefined) allowed.vehicleId   = vehicleId;
  if (driverId    !== undefined) allowed.driverId    = driverId;
  if (type        !== undefined) allowed.type        = type;
  if (scheduledAt !== undefined) allowed.scheduledAt = scheduledAt;
  if (notes       !== undefined) allowed.notes       = notes;
  if (status      !== undefined) allowed.status      = status;
  appointments[idx] = { ...appointments[idx], ...allowed, id: appointments[idx].id, updatedAt: new Date().toISOString() };
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
  appointments[idx].status      = 'cancelled';
  appointments[idx].canceledAt  = new Date().toISOString();
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
  const { name, description, coordinates } = req.body;
  const allowed = {};
  if (name        !== undefined) allowed.name        = name;
  if (description !== undefined) allowed.description = description;
  if (coordinates !== undefined) allowed.coordinates = coordinates;
  regions[idx] = { ...regions[idx], ...allowed, id: regions[idx].id, updatedAt: new Date().toISOString() };
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
      case 'appointments': {
        const pending = appointments.filter(a => a.status === 'pending');
        return { count: appointments.length, pending: pending.length, items: appointments };
      }
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

// ═══════════════════════════════════════════════════════════════════════════
// ACCIDENTS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/accidents', authAll, (_req, res) => res.json(accidents));
app.post('/accidents', supervisorUp, (req, res) => {
  const { vehicleId, driverId, date, location, description, injuriesCount, damageAmount } = req.body || {};
  if (!vehicleId || !description) return res.status(400).json({ error: 'معرّف المركبة والوصف مطلوبان' });
  const acc = {
    id:           newId(),
    vehicleId,
    driverId:     driverId     || null,
    date:         date         || new Date().toISOString().slice(0, 10),
    location:     location     || '',
    description,
    injuriesCount: Number(injuriesCount) || 0,
    damageAmount:  Number(damageAmount)  || 0,
    status:       'open',
    createdAt:    new Date().toISOString(),
    createdBy:    req.user.username,
  };
  accidents.push(acc);
  audit(`تسجيل حادث: ${description.slice(0, 30)}`, req.user.username);
  res.status(201).json(acc);
});
app.put('/accidents/:id', supervisorUp, (req, res) => {
  const idx = accidents.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الحادث غير موجود' });
  const allowed = ['vehicleId','driverId','date','location','description','injuriesCount','damageAmount','status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) accidents[idx][k] = req.body[k]; });
  accidents[idx].updatedAt = new Date().toISOString();
  audit(`تعديل حادث: ${accidents[idx].id}`, req.user.username);
  res.json(accidents[idx]);
});
app.delete('/accidents/:id', supervisorUp, (req, res) => {
  const idx = accidents.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الحادث غير موجود' });
  accidents.splice(idx, 1);
  audit('حذف حادث', req.user.username);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/violations', authAll, (_req, res) => res.json(violations));
app.post('/violations', supervisorUp, (req, res) => {
  const { vehicleId, driverId, date, type, amount, description } = req.body || {};
  if (!vehicleId || !type || amount == null) return res.status(400).json({ error: 'معرّف المركبة والنوع والمبلغ مطلوبة' });
  const vio = {
    id:          newId(),
    vehicleId,
    driverId:    driverId || null,
    date:        date     || new Date().toISOString().slice(0, 10),
    type,
    amount:      Number(amount) || 0,
    description: description || '',
    status:      'unpaid',
    paidAt:      null,
    createdAt:   new Date().toISOString(),
    createdBy:   req.user.username,
  };
  violations.push(vio);
  audit(`تسجيل مخالفة: ${type}`, req.user.username);
  res.status(201).json(vio);
});
app.put('/violations/:id', supervisorUp, (req, res) => {
  const idx = violations.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المخالفة غير موجودة' });
  const allowed = ['vehicleId','driverId','date','type','amount','description','status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) violations[idx][k] = req.body[k]; });
  violations[idx].updatedAt = new Date().toISOString();
  audit(`تعديل مخالفة: ${violations[idx].type}`, req.user.username);
  res.json(violations[idx]);
});
app.post('/violations/:id/pay', supervisorUp, (req, res) => {
  const idx = violations.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المخالفة غير موجودة' });
  violations[idx].status = 'paid';
  violations[idx].paidAt = new Date().toISOString();
  audit(`تسديد مخالفة: ${violations[idx].type}`, req.user.username);
  res.json(violations[idx]);
});
app.delete('/violations/:id', supervisorUp, (req, res) => {
  const idx = violations.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المخالفة غير موجودة' });
  violations.splice(idx, 1);
  audit('حذف مخالفة', req.user.username);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL
// ═══════════════════════════════════════════════════════════════════════════
app.get('/financial', authAll, (_req, res) => res.json(financialItems));
app.post('/financial', supervisorUp, (req, res) => {
  const { type, amount, description, vehicleId, driverId, date, receiptNo } = req.body || {};
  if (!type || amount == null || !description) return res.status(400).json({ error: 'النوع والمبلغ والوصف مطلوبة' });
  const valid = ['fuel','maintenance','violation','salary','other'];
  if (!valid.includes(type)) return res.status(400).json({ error: 'نوع غير صالح' });
  const fin = {
    id:          newId(),
    type,
    amount:      Number(amount) || 0,
    description,
    vehicleId:   vehicleId  || null,
    driverId:    driverId   || null,
    date:        date       || new Date().toISOString().slice(0, 10),
    receiptNo:   receiptNo  || '',
    createdAt:   new Date().toISOString(),
    createdBy:   req.user.username,
  };
  financialItems.push(fin);
  audit(`إضافة معاملة مالية: ${type} ${amount} ر.س`, req.user.username);
  res.status(201).json(fin);
});
app.put('/financial/:id', supervisorUp, (req, res) => {
  const idx = financialItems.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المعاملة غير موجودة' });
  const allowed = ['type','amount','description','vehicleId','driverId','date','receiptNo'];
  allowed.forEach(k => { if (req.body[k] !== undefined) financialItems[idx][k] = req.body[k]; });
  financialItems[idx].updatedAt = new Date().toISOString();
  audit(`تعديل معاملة مالية: ${financialItems[idx].id}`, req.user.username);
  res.json(financialItems[idx]);
});
app.delete('/financial/:id', supervisorUp, (req, res) => {
  const idx = financialItems.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'المعاملة غير موجودة' });
  financialItems.splice(idx, 1);
  audit('حذف معاملة مالية', req.user.username);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/notifications', authAll, (req, res) => {
  res.json(notifications.filter(n => n.userId === req.user.id));
});
app.post('/notifications/read-all', authAll, (req, res) => {
  notifications.filter(n => n.userId === req.user.id).forEach(n => { n.read = true; });
  res.json({ ok: true });
});
app.post('/notifications/read/:id', authAll, (req, res) => {
  const n = notifications.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!n) return res.status(404).json({ error: 'الإشعار غير موجود' });
  n.read = true;
  res.json(n);
});

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
