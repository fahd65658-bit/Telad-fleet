
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Production Backend
// Domain : fna.sa   |   API : https://api.fna.sa
// Version: 2.1.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
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
// ─── Skew Protection ─────────────────────────────────────────────────────────
// Set DEPLOY_ID at deploy time (e.g. git commit SHA) for a stable, per-deployment
// value.  Falls back to a random hex string so every cold start gets its own ID
// when DEPLOY_ID is not injected by CI/CD.
const DEPLOY_ID = process.env.DEPLOY_ID || crypto.randomBytes(8).toString('hex');

// Fail fast in production if JWT_SECRET is not set
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable must be set in production.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'telad-fleet-dev-only-not-for-production';
let defaultAdminPasswordHash = null;

function buildDefaultUsers() {
  if (!defaultAdminPasswordHash) {
    defaultAdminPasswordHash = bcrypt.hashSync('0241', 10);
  }
  return [
    {
      id: 1,
      name: 'مدير النظام',
      username: 'F',
      email: 'admin@fna.sa',
      passwordHash: defaultAdminPasswordHash,
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildDemoCollections() {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nextMonthDate = new Date(now);
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonth = nextMonthDate.toISOString().slice(0, 10);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 3).toISOString().slice(0, 10);

  return {
    users: buildDefaultUsers(),
    cities: [
      { id: 'city-riyadh', name: 'الرياض', createdAt: nowIso },
      { id: 'city-jeddah', name: 'جدة', createdAt: nowIso },
      { id: 'city-dammam', name: 'الدمام', createdAt: nowIso },
    ],
    projects: [
      { id: 'proj-north', name: 'مشروع النقل الشمالي', createdAt: nowIso },
      { id: 'proj-west', name: 'مشروع الدعم الغربي', createdAt: nowIso },
      { id: 'proj-east', name: 'مشروع التوزيع الشرقي', createdAt: nowIso },
    ],
    vehicles: [
      { id: 'veh-102', name: 'TLD-102', plate: 'TLD-102', city: 'الرياض', driver: 'أحمد سالم', status: 'active', model: 'Toyota Hilux', year: 2024, createdAt: nowIso },
      { id: 'veh-118', name: 'TLD-118', plate: 'TLD-118', city: 'جدة', driver: 'سارة علي', status: 'active', model: 'Ford Transit', year: 2023, createdAt: nowIso },
      { id: 'veh-204', name: 'TLD-204', plate: 'TLD-204', city: 'الدمام', driver: 'خالد حسن', status: 'maintenance', model: 'Isuzu NPR', year: 2022, createdAt: nowIso },
      { id: 'veh-221', name: 'TLD-221', plate: 'TLD-221', city: 'المدينة', driver: 'منى فهد', status: 'active', model: 'Hyundai H350', year: 2024, createdAt: nowIso },
    ],
    employees: [
      { id: 'emp-ops-1', name: 'محمد راشد', department: 'العمليات', createdAt: nowIso },
      { id: 'emp-ops-2', name: 'ليان فهد', department: 'الدعم', createdAt: nowIso },
      { id: 'emp-fin-1', name: 'عبدالله خالد', department: 'المالية', createdAt: nowIso },
      { id: 'emp-maint-1', name: 'ريم سعد', department: 'الصيانة', createdAt: nowIso },
    ],
    drivers: [
      { id: 'drv-1', name: 'أحمد سالم', phone: '0500000001', licenseNo: 'DL-1001', licenseExpiry: nextMonth, vehicleId: 'veh-102', status: 'active', createdAt: nowIso },
      { id: 'drv-2', name: 'سارة علي', phone: '0500000002', licenseNo: 'DL-1002', licenseExpiry: nextMonth, vehicleId: 'veh-118', status: 'active', createdAt: nowIso },
      { id: 'drv-3', name: 'خالد حسن', phone: '0500000003', licenseNo: 'DL-1003', licenseExpiry: nextMonth, vehicleId: 'veh-204', status: 'active', createdAt: nowIso },
      { id: 'drv-4', name: 'منى فهد', phone: '0500000004', licenseNo: 'DL-1004', licenseExpiry: nextMonth, vehicleId: 'veh-221', status: 'active', createdAt: nowIso },
    ],
    maintenanceJobs: [
      { id: 'mnt-1', vehicleId: 'veh-204', type: 'فحص دوري', description: 'فحص كامل لنظام الفرامل والزيوت', scheduledDate: today, cost: 1250, status: 'pending', createdAt: nowIso },
      { id: 'mnt-2', vehicleId: 'veh-118', type: 'تغيير إطارات', description: 'استبدال إطارين أماميين', scheduledDate: lastWeek, cost: 980, status: 'completed', createdAt: nowIso },
    ],
    appointments: [
      { id: 'appt-1', vehicleId: 'veh-102', type: 'تجديد استمارة', scheduledAt: nextWeek, notes: 'مراجعة فرع الرياض', status: 'pending', createdAt: nowIso },
      { id: 'appt-2', vehicleId: 'veh-221', type: 'فحص هيئة النقل', scheduledAt: nextWeek, notes: 'إحضار ملف المركبة', status: 'confirmed', createdAt: nowIso },
    ],
    regions: [
      { id: 'reg-central', name: 'المنطقة الوسطى', description: 'تغطية عمليات الرياض وما حولها', createdAt: nowIso },
      { id: 'reg-western', name: 'المنطقة الغربية', description: 'تشغيل جدة ومكة والمدينة', createdAt: nowIso },
    ],
    reports: [
      { id: 'rep-1', title: 'ملخص جاهزية الأسطول', type: 'تشغيلي', createdBy: 'system', createdAt: nowIso },
    ],
    notifications: [],
    auditLogs: [
      { id: 'audit-bootstrap', action: 'تهيئة بيانات تجريبية للنظام', user: 'system', time: nowIso },
    ],
    accidents: [
      { id: 'acc-1', vehicleId: 'veh-204', date: today, location: 'الدمام', description: 'احتكاك بسيط أثناء الوقوف', injuriesCount: 0, damageAmount: 1500, status: 'open', createdAt: nowIso },
    ],
    violations: [
      { id: 'vio-1', vehicleId: 'veh-102', date: today, type: 'سرعة', amount: 300, description: 'تجاوز السرعة المسموحة', status: 'unpaid', createdAt: nowIso },
      { id: 'vio-2', vehicleId: 'veh-118', date: lastWeek, type: 'موقف', amount: 150, description: 'وقوف في مكان ممنوع', status: 'paid', createdAt: nowIso },
    ],
    financialItems: [
      { id: 'fin-1', type: 'fuel', amount: 850, description: 'تعبئة وقود أسبوعية', vehicleId: 'veh-102', date: currentMonthDate, receiptNo: 'RCPT-1001', createdAt: nowIso },
      { id: 'fin-2', type: 'maintenance', amount: 1250, description: 'فحص وصيانة دورية', vehicleId: 'veh-204', date: currentMonthDate, receiptNo: 'RCPT-1002', createdAt: nowIso },
      { id: 'fin-3', type: 'salary', amount: 4200, description: 'بدل تشغيل السائقين', vehicleId: null, date: currentMonthDate, receiptNo: 'RCPT-1003', createdAt: nowIso },
    ],
    devRequests: [],
  };
}

let demoCollectionsCache = null;

function getDemoCollections() {
  if (!demoCollectionsCache) {
    demoCollectionsCache = buildDemoCollections();
  }
  return demoCollectionsCache;
}

function loadOrBootstrapCollection(name) {
  if (hasCollectionFile(name)) {
    return loadCollection(name);
  }
  const demoCollections = getDemoCollections();
  return demoCollections[name] ? structuredClone(demoCollections[name]) : [];
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE PERSISTENCE
// All in-memory collections are serialised to JSON files under DATA_DIR.
// This guarantees zero data loss on server restart / PM2 reload.
// DATA_DIR defaults to ./data/ (relative to this file) in development and
// can be overridden via the DATA_DIR environment variable in production so
// the volume can be mounted outside the app directory.
// ═══════════════════════════════════════════════════════════════════════════
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }

function dataFile(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function hasCollectionFile(name) {
  return fs.existsSync(dataFile(name));
}

/** Load a JSON array from disk; return empty array if file does not exist. */
function loadCollection(name) {
  try {
    const raw = fs.readFileSync(dataFile(name), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write a collection to disk atomically (write to .tmp then rename). */
function saveCollection(name, data) {
  const file = dataFile(name);
  const tmp  = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error(`[PERSIST] Failed to save ${name}:`, e.message);
  }
}

/** Persist all mutable collections to disk. Called on every mutation and on shutdown. */
function persistAll() {
  saveCollection('users',          users);
  saveCollection('cities',         cities);
  saveCollection('projects',       projects);
  saveCollection('vehicles',       vehicles);
  saveCollection('employees',      employees);
  saveCollection('drivers',        drivers);
  saveCollection('maintenanceJobs',maintenanceJobs);
  saveCollection('appointments',   appointments);
  saveCollection('regions',        regions);
  saveCollection('reports',        reports);
  saveCollection('auditLogs',      auditLogs);
  saveCollection('accidents',      accidents);
  saveCollection('violations',     violations);
  saveCollection('financialItems', financialItems);
  saveCollection('notifications',  notifications);
  saveCollection('devRequests',    devRequests);
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

// Allow any Vercel preview deployment (*.vercel.app) or GitHub Pages (*.github.io) in addition to the list above
function isAllowedOrigin(origin) {
  // No Origin header means same-origin or non-browser request (curl, server-to-server) — safe to allow
  if (!origin) return true;
  if (CORS_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.vercel.app')) return true;
    if (url.hostname.endsWith('.github.io')) return true;
  } catch (_) { /* ignore */ }
  return false;
}

// ─── App setup ───────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), methods: ['GET', 'POST'] },
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
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('CORS not allowed for: ' + origin));
  },
  credentials: true,
  exposedHeaders: ['X-Deploy-Id'],  // allow client JS to read the skew-protection header
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
let users = loadOrBootstrapCollection('users');

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

// ─── Skew Protection — stamp every response with the deploy ID ───────────────
// The client reads this header after every fetch() call.  If the ID changes
// (new deployment) the client shows a "please reload" banner.
app.use((_req, res, next) => {
  res.setHeader('X-Deploy-Id', DEPLOY_ID);
  next();
});

// ─── Auto-persist after every mutating request ───────────────────────────────
// Any POST / PUT / PATCH / DELETE that completes with 2xx triggers a full
// snapshot of all collections to disk, guaranteeing data survives restarts.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) persistAll();
    });
  }
  next();
});

// ─── Version endpoint (used by client on first load to prime the baseline ID) ─
app.get('/version', (_req, res) => {
  res.json({ deployId: DEPLOY_ID, version: '2.1.0' });
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'TELAD FLEET',
    domain: 'fna.sa',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    deployId: DEPLOY_ID,
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
// CRUD DATA  — loaded from JSON files on startup, persisted on every write
// Replace with PostgreSQL when scaling beyond a single process.
// ═══════════════════════════════════════════════════════════════════════════
let cities         = loadOrBootstrapCollection('cities');
let projects       = loadOrBootstrapCollection('projects');
let vehicles       = loadOrBootstrapCollection('vehicles');
let employees      = loadOrBootstrapCollection('employees');
let drivers        = loadOrBootstrapCollection('drivers');
let maintenanceJobs = loadOrBootstrapCollection('maintenanceJobs');
let appointments   = loadOrBootstrapCollection('appointments');
let regions        = loadOrBootstrapCollection('regions');
let reports        = loadOrBootstrapCollection('reports');
let notifications  = loadOrBootstrapCollection('notifications');
let auditLogs      = loadOrBootstrapCollection('auditLogs');
let accidents      = loadOrBootstrapCollection('accidents');
let violations     = loadOrBootstrapCollection('violations');
let financialItems = loadOrBootstrapCollection('financialItems');

let devRequests    = loadOrBootstrapCollection('devRequests');

function audit(action, username) {
  auditLogs.push({
    id:     newId(),
    action,
    user:   username,
    time:   new Date().toISOString(),
  });
  // Keep audit log from growing unbounded (keep last 10 000 entries)
  if (auditLogs.length > 10000) auditLogs.splice(0, auditLogs.length - 10000);
  saveCollection('auditLogs', auditLogs);
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
  saveCollection('notifications', notifications);
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

// ═══════════════════════════════════════════════════════════════════════════
// DEV-REQUESTS  — Admin AI development request panel
// Allows the superadmin to submit natural-language improvement requests.
// Each request is classified by AI (category, priority, complexity), stored
// locally, and — when GITHUB_TOKEN + GITHUB_REPO are configured — also
// opened as a GitHub Issue for fast repository-connected tracking.
// ═══════════════════════════════════════════════════════════════════════════

// ─── AI classifier ───────────────────────────────────────────────────────────
function classifyDevRequest(text) {
  const t = text.toLowerCase();

  // Category detection
  let category = 'عام';
  if (/واجهة|تصميم|صفحة|لون|شاشة|زر|قائمة|ui|ux|frontend/.test(t))       category = 'واجهة المستخدم';
  else if (/api|endpoint|خادم|backend|مسار|route|قاعدة بيانات|database/.test(t)) category = 'الخادم والواجهة البرمجية';
  else if (/أمان|security|تشفير|صلاحية|permission|token|jwt/.test(t))       category = 'الأمان';
  else if (/تقرير|report|إحصاء|analytics|مخطط|chart/.test(t))               category = 'التقارير والتحليلات';
  else if (/سائق|driver|مركبة|vehicle|أسطول|fleet/.test(t))                 category = 'إدارة الأسطول';
  else if (/ذكاء|ai|تنبيه|alert|توصية|recommendation/.test(t))              category = 'الذكاء الاصطناعي';
  else if (/إشعار|notification|تنبيه|push/.test(t))                         category = 'الإشعارات';
  else if (/خريطة|map|gps|تتبع|tracking/.test(t))                           category = 'الخرائط والتتبع';
  else if (/مالي|financial|تكلفة|cost|ميزانية|budget/.test(t))              category = 'المالية';

  // Priority detection
  let priority = 'متوسطة';
  if (/عاجل|فوري|حرج|critical|urgent|مهم جداً|أولوية عالية/.test(t))       priority = 'عالية';
  else if (/منخفض|بسيط|غير عاجل|وقت فراغ|low priority/.test(t))            priority = 'منخفضة';

  // Complexity estimate
  let complexity = 'متوسط';
  if (/بسيط|صغير|سريع|minor|quick|small/.test(t))                           complexity = 'بسيط';
  else if (/كبير|معقد|شامل|major|complex|large|هيكل/.test(t))               complexity = 'معقد';

  // Generate structured title from first sentence (≤ 80 chars)
  const firstSentence = text.split(/[.،\n]/)[0].trim();
  const title = firstSentence.length > 80 ? firstSentence.slice(0, 77) + '…' : firstSentence;

  return { title, category, priority, complexity };
}

// ─── Create GitHub Issue (fire-and-forget; never throws) ─────────────────────
/**
 * Opens a GitHub Issue via the REST API.
 * Requires GITHUB_TOKEN (Personal Access Token with repo:write or Issues:write)
 * and GITHUB_REPO ("owner/repo") to be set in the environment.
 *
 * @returns {object|null} GitHub API response object on success, or null on any
 *   error (missing credentials, network failure, API error).  Callers should
 *   check for truthiness before accessing response fields.
 */
async function createGitHubIssue(title, body, labels) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;   // e.g. "fahd65658-bit/Telad-fleet"
  if (!token || !repo) return null;

  try {
    const https = require('https');
    const payload = JSON.stringify({ title, body, labels });
    return await new Promise((resolve) => {
      const [owner, repoName] = repo.split('/');
      const options = {
        hostname: 'api.github.com',
        path:     `/repos/${owner}/${repoName}/issues`,
        method:   'POST',
        headers: {
          'Content-Type':    'application/json',
          'Authorization':   `Bearer ${token}`,
          'User-Agent':      'TELAD-FLEET-Bot/2.0',
          'Accept':          'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Length':  Buffer.byteLength(payload),
        },
      };
      const req = https.request(options, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.write(payload);
      req.end();
    });
  } catch {
    return null;
  }
}

// GET /dev-requests  — list all (admin only)
app.get('/dev-requests', adminOnly, (_req, res) => {
  res.json([...devRequests].reverse());
});

// POST /dev-requests  — submit a new request (admin only)
app.post('/dev-requests', adminOnly, async (req, res) => {
  const { request } = req.body || {};
  if (!request || !request.trim())
    return res.status(400).json({ error: 'نص الطلب مطلوب' });
  if (request.length > 2000)
    return res.status(400).json({ error: 'نص الطلب طويل جداً (الحد 2000 حرف)' });

  const ai    = classifyDevRequest(request.trim());
  const id    = newId();
  const createdAt = new Date().toISOString();

  // Build GitHub issue body
  const issueBody = [
    `## طلب تطوير — TELAD FLEET`,
    '',
    `**الوصف:**`,
    request.trim(),
    '',
    `---`,
    `| الحقل | القيمة |`,
    `|---|---|`,
    `| الفئة | ${ai.category} |`,
    `| الأولوية | ${ai.priority} |`,
    `| التعقيد | ${ai.complexity} |`,
    `| مُقدَّم بواسطة | ${req.user.username} |`,
    `| التاريخ | ${createdAt.slice(0, 10)} |`,
    '',
    `*أُنشئ تلقائياً من لوحة تحكم TELAD FLEET*`,
  ].join('\n');

  const labelMap = { 'عالية': 'priority:high', 'متوسطة': 'priority:medium', 'منخفضة': 'priority:low' };
  const ghIssue = await createGitHubIssue(
    `[تطوير] ${ai.title}`,
    issueBody,
    [labelMap[ai.priority] || 'priority:medium', 'dev-request'],
  );

  const record = {
    id,
    request:     request.trim(),
    title:       ai.title,
    category:    ai.category,
    priority:    ai.priority,
    complexity:  ai.complexity,
    status:      'مفتوح',
    githubIssue: ghIssue ? { number: ghIssue.number, url: ghIssue.html_url } : null,
    submittedBy: req.user.username,
    createdAt,
  };
  devRequests.push(record);
  audit(`طلب تطوير جديد: ${ai.title}`, req.user.username);
  res.status(201).json(record);
});

// PUT /dev-requests/:id/status  — update status (admin only)
app.put('/dev-requests/:id/status', adminOnly, (req, res) => {
  const record = devRequests.find(r => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'الطلب غير موجود' });
  const allowed = ['مفتوح', 'قيد التنفيذ', 'مكتمل', 'مرفوض'];
  const { status } = req.body || {};
  if (!allowed.includes(status))
    return res.status(400).json({ error: `الحالة غير صالحة. القيم المتاحة: ${allowed.join(', ')}` });
  record.status    = status;
  record.updatedAt = new Date().toISOString();
  audit(`تحديث حالة طلب التطوير: ${record.title} → ${status}`, req.user.username);
  res.json(record);
});

// DELETE /dev-requests/:id  — remove (admin only)
app.delete('/dev-requests/:id', adminOnly, (req, res) => {
  const idx = devRequests.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'الطلب غير موجود' });
  devRequests.splice(idx, 1);
  audit('حذف طلب تطوير', req.user.username);
  res.json({ ok: true });
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[TELAD FLEET ERROR]', err.message);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Flush all data to disk before the process exits so no records are lost on
// PM2 reload, Docker stop, or SIGTERM from the OS.
function gracefulShutdown(signal) {
  console.log(`\n[TELAD FLEET] Received ${signal} — saving data and shutting down…`);
  persistAll();
  server.close(() => {
    console.log('[TELAD FLEET] HTTP server closed. Goodbye.');
    process.exit(0);
  });
  // Force exit if server hasn't closed within 10 s
  setTimeout(() => { process.exit(1); }, 10000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────
function startServer(port = PORT) {
  return server.listen(port, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════╗');
    console.log('║       🚀 TELAD FLEET BACKEND v2.1     ║');
    console.log(`║       Running on port ${port}             ║`);
    console.log('║       Domain: https://fna.sa          ║');
    console.log('║       API:    https://api.fna.sa      ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('');
    console.log(`  Data dir:    ${DATA_DIR}`);
    console.log(`  Health:      http://localhost:${port}/health`);
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
