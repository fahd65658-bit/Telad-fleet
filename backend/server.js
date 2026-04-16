
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Production Backend
// Domain : fna.sa   |   API : https://api.fna.sa
// Version: 2.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const crypto    = require('crypto');
const express   = require('express');
const { pool }  = require('./db');
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

// محاولة تنفيذ استعلام - إذا فشل يرجع null
async function dbQuery(text, params) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    console.warn('[DB] استعلام فشل — الرجوع للذاكرة المؤقتة:', err.message);
    return null;
  }
}

// Dashboard summary
app.get('/dashboard', authAll, (_req, res) =>
  res.json({
    cities:    cities.length,
    projects:  projects.length,
    vehicles:  vehicles.length,
    employees: employees.length,
  })
);

// Cities
app.post('/cities', supervisorUp, async (req, res) => {
  const { name, region } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المدينة مطلوب' });
  const dbRes = await dbQuery(
    'INSERT INTO cities (name, region, created_by) VALUES ($1,$2,$3) RETURNING *',
    [name, region || null, req.user.username]
  );
  const c = dbRes ? dbRes.rows[0] : { id: newId(), name, region, created_by: req.user.username };
  if (!dbRes) cities.push(c);
  audit('إضافة مدينة', req.user.username);
  res.status(201).json(c);
});
app.get('/cities', authAll, async (_req, res) => {
  const dbRes = await dbQuery('SELECT * FROM cities ORDER BY created_at DESC');
  res.json(dbRes ? dbRes.rows : cities);
});

// Projects
app.post('/projects', supervisorUp, async (req, res) => {
  const { name, city_id, status, start_date, end_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المشروع مطلوب' });
  const dbRes = await dbQuery(
    'INSERT INTO projects (name, city_id, status, start_date, end_date, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [name, city_id || null, status || 'active', start_date || null, end_date || null, req.user.username]
  );
  const p = dbRes ? dbRes.rows[0] : { id: newId(), ...req.body };
  if (!dbRes) projects.push(p);
  audit('إضافة مشروع', req.user.username);
  res.status(201).json(p);
});
app.get('/projects', authAll, async (_req, res) => {
  const dbRes = await dbQuery('SELECT * FROM projects ORDER BY created_at DESC');
  res.json(dbRes ? dbRes.rows : projects);
});

// Vehicles
app.post('/vehicles', requireAuth(['admin', 'supervisor', 'operator']), async (req, res) => {
  const {
    name, plate, model, year, city, project_id, driver, status,
    inspection_status, inspection_expiry,
    insurance_status,   insurance_expiry,
  } = req.body || {};
  if (!plate) return res.status(400).json({ error: 'رقم اللوحة مطلوب' });
  const dbRes = await dbQuery(
    `INSERT INTO vehicles
       (name, plate, model, year, city, project_id, driver, status,
        inspection_status, inspection_expiry, insurance_status, insurance_expiry,
        created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      name || null, plate, model || null, year || null, city || null,
      project_id || null, driver || null, status || 'active',
      inspection_status || 'unknown', inspection_expiry || null,
      insurance_status  || 'unknown', insurance_expiry  || null,
      req.user.username,
    ]
  );
  const v = dbRes ? dbRes.rows[0] : { id: newId(), ...req.body };
  if (!dbRes) vehicles.push(v);
  audit('إضافة مركبة', req.user.username);
  res.status(201).json(v);
});

app.get('/vehicles', authAll, async (_req, res) => {
  const dbRes = await dbQuery('SELECT * FROM vehicles ORDER BY created_at DESC');
  res.json(dbRes ? dbRes.rows : vehicles);
});

// GET /vehicles/expiring — مركبات فحصها أو تأمينها ينتهي خلال 30 يوماً
// تاريخ 9999-12-31 يُستخدم كقيمة افتراضية للفرز عند غياب التاريخ (أكبر تاريخ ممكن)
app.get('/vehicles/expiring', authAll, async (_req, res) => {
  const dbRes = await dbQuery(
    `SELECT * FROM vehicles
     WHERE (inspection_expiry IS NOT NULL AND inspection_expiry <= CURRENT_DATE + INTERVAL '30 days' AND inspection_expiry >= CURRENT_DATE)
        OR (insurance_expiry  IS NOT NULL AND insurance_expiry  <= CURRENT_DATE + INTERVAL '30 days' AND insurance_expiry  >= CURRENT_DATE)
     ORDER BY LEAST(
       COALESCE(inspection_expiry, '9999-12-31'::date),
       COALESCE(insurance_expiry,  '9999-12-31'::date)
     )`
  );
  if (dbRes) return res.json(dbRes.rows);
  // fallback: filter in-memory
  const now  = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = vehicles.filter(v => {
    const ie = v.inspection_expiry ? new Date(v.inspection_expiry) : null;
    const ins = v.insurance_expiry  ? new Date(v.insurance_expiry)  : null;
    return (ie && ie >= now && ie <= soon) || (ins && ins >= now && ins <= soon);
  });
  res.json(expiring);
});

app.put('/vehicles/:id', supervisorUp, async (req, res) => {
  const id = req.params.id;
  const {
    name, plate, model, year, city, project_id, driver, status,
    inspection_status, inspection_expiry,
    insurance_status,   insurance_expiry,
  } = req.body || {};
  const dbRes = await dbQuery(
    `UPDATE vehicles SET
       name=$1, plate=$2, model=$3, year=$4, city=$5, project_id=$6, driver=$7, status=$8,
       inspection_status=$9,  inspection_expiry=$10,
       insurance_status=$11,  insurance_expiry=$12,
       updated_at=NOW()
     WHERE id=$13 RETURNING *`,
    [
      name || null, plate, model || null, year || null, city || null,
      project_id || null, driver || null, status || 'active',
      inspection_status || 'unknown', inspection_expiry || null,
      insurance_status  || 'unknown', insurance_expiry  || null,
      id,
    ]
  );
  if (dbRes) {
    if (dbRes.rows.length === 0) return res.status(404).json({ error: 'المركبة غير موجودة' });
    audit(`تعديل مركبة: ${dbRes.rows[0].plate}`, req.user.username);
    return res.json(dbRes.rows[0]);
  }
  // fallback in-memory
  const idx = vehicles.findIndex(v => String(v.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  vehicles[idx] = { ...vehicles[idx], ...req.body };
  audit(`تعديل مركبة: ${vehicles[idx].plate || vehicles[idx].name}`, req.user.username);
  res.json(vehicles[idx]);
});

app.delete('/vehicles/:id', supervisorUp, async (req, res) => {
  const id = req.params.id;
  const dbRes = await dbQuery('DELETE FROM vehicles WHERE id=$1 RETURNING plate, name', [id]);
  if (dbRes) {
    if (dbRes.rows.length === 0) return res.status(404).json({ error: 'المركبة غير موجودة' });
    audit(`حذف مركبة: ${dbRes.rows[0].plate || dbRes.rows[0].name}`, req.user.username);
    return res.json({ ok: true });
  }
  // fallback in-memory
  const idx = vehicles.findIndex(v => String(v.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  const plate = vehicles[idx].plate || vehicles[idx].name;
  vehicles.splice(idx, 1);
  audit(`حذف مركبة: ${plate}`, req.user.username);
  res.json({ ok: true });
});

// Employees
app.post('/employees', supervisorUp, async (req, res) => {
  const { name, role, phone, national_id, city, project_id, vehicle_id, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم الموظف مطلوب' });
  const dbRes = await dbQuery(
    `INSERT INTO employees (name, role, phone, national_id, city, project_id, vehicle_id, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name, role || null, phone || null, national_id || null, city || null,
     project_id || null, vehicle_id || null, status || 'active', req.user.username]
  );
  const e = dbRes ? dbRes.rows[0] : { id: newId(), ...req.body };
  if (!dbRes) employees.push(e);
  audit('إضافة موظف', req.user.username);
  res.status(201).json(e);
});
app.get('/employees', authAll, async (_req, res) => {
  const dbRes = await dbQuery('SELECT * FROM employees ORDER BY created_at DESC');
  res.json(dbRes ? dbRes.rows : employees);
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
