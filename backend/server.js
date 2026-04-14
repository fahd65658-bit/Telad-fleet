
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
let cities              = [];
let projects            = [];
let vehicles            = [];
let employees           = [];
let auditLogs           = [];
let conditionReports    = [];
let vehicleDamages      = [];
let petromingServices   = [];
let fuelLogs            = [];
let integrationCreds    = [];
let syncLogs            = [];
let maintenanceAlerts   = [];

function audit(action, username) {
  auditLogs.push({
    id:     newId(),
    action,
    user:   username,
    time:   new Date().toISOString(),
  });
}

// ─── AI Analysis helper (stub — wire real OpenAI API key via process.env.OPENAI_API_KEY) ──
function aiAnalyzeCondition(data) {
  const { mileage, fuelLevel, tiresStatus, oilStatus, overallCondition } = data;
  const issues = [];
  if (fuelLevel !== undefined && fuelLevel < 20) issues.push('مستوى الوقود منخفض — يُنصح بالتزود');
  if (tiresStatus === 'poor')  issues.push('حالة الإطارات تحتاج مراجعة');
  if (oilStatus   === 'poor')  issues.push('مستوى/نوعية الزيت يحتاج تغيير');
  const score = overallCondition === 'excellent' ? 95
    : overallCondition === 'good' ? 80
    : overallCondition === 'fair' ? 60 : 40;
  return {
    score,
    issues,
    recommendation: issues.length === 0
      ? 'المركبة بحالة جيدة — لا توجد إجراءات فورية مطلوبة'
      : `يوجد ${issues.length} ملاحظة تستوجب المتابعة`,
    generated_at: new Date().toISOString(),
    model: 'telad-fleet-ai-v2',
  };
}

// ─── Fuel trend analysis ──────────────────────────────────────────────────────
function aiFuelTrend(vehicleFuelLogs) {
  if (!vehicleFuelLogs.length) return null;
  const sorted  = [...vehicleFuelLogs].sort((a, b) => new Date(a.fillDate) - new Date(b.fillDate));
  const totalL  = sorted.reduce((s, l) => s + (l.liters || 0), 0);
  const totalSAR = sorted.reduce((s, l) => s + (l.totalCost || 0), 0);
  const avgL    = totalL / sorted.length;
  const last    = sorted[sorted.length - 1];
  const anomaly = last && last.liters > avgL * 1.5;
  return {
    total_liters:   +totalL.toFixed(2),
    total_cost_sar: +totalSAR.toFixed(2),
    average_fill_liters: +avgL.toFixed(2),
    fills_count:    sorted.length,
    anomaly_detected: anomaly,
    anomaly_note: anomaly ? 'آخر تعبئة أعلى من المعدل بنسبة 50%+ — يُنصح بالمراجعة' : null,
    generated_at: new Date().toISOString(),
  };
}

// ─── Oil change prediction helper ────────────────────────────────────────────
function aiOilPrediction(vehicleServices) {
  const oilChanges = vehicleServices
    .filter(s => s.serviceType === 'oil_change')
    .sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));
  if (!oilChanges.length) return null;
  const last = oilChanges[0];
  return {
    last_oil_change_date:    last.serviceDate,
    last_oil_change_mileage: last.mileageAtService,
    last_oil_change_cost:    last.cost,
    oil_type:                last.oilType || 'غير محدد',
    oil_brand:               last.oilBrand || 'غير محدد',
    next_service_mileage:    last.nextServiceMileage,
    next_service_date:       last.nextServiceDate,
    workshop:                last.workshopName,
    generated_at:            new Date().toISOString(),
  };
}

// Dashboard summary
app.get('/dashboard', authAll, (_req, res) =>
  res.json({
    cities:    cities.length,
    projects:  projects.length,
    vehicles:  vehicles.length,
    employees: employees.length,
    alerts:    maintenanceAlerts.filter(a => !a.resolved).length,
  })
);

// Cities
app.post('/cities', supervisorUp, (req, res) => {
  const c = { id: newId(), ...req.body };
  cities.push(c);
  audit('إضافة مدينة', req.user.username);
  res.status(201).json(c);
});
app.get('/cities', authAll, (_req, res) => res.json(cities));

// Projects
app.post('/projects', supervisorUp, (req, res) => {
  const p = { id: newId(), ...req.body };
  projects.push(p);
  audit('إضافة مشروع', req.user.username);
  res.status(201).json(p);
});
app.get('/projects', authAll, (_req, res) => res.json(projects));

// Vehicles
app.post('/vehicles', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const v = { id: newId(), ...req.body };
  vehicles.push(v);
  audit('إضافة مركبة', req.user.username);
  res.status(201).json(v);
});
app.get('/vehicles', authAll, (_req, res) => res.json(vehicles));
app.get('/vehicles/:id', authAll, (req, res) => {
  const v = vehicles.find(v => v.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'المركبة غير موجودة' });
  // Attach last Petromin and Al-Drees data
  const lastOil = aiOilPrediction(petromingServices.filter(s => s.vehicleId === req.params.id));
  const fuelTrend = aiFuelTrend(fuelLogs.filter(l => l.vehicleId === req.params.id));
  res.json({ ...v, petromin: lastOil, aldrees: fuelTrend });
});
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
app.get('/employees', authAll, (_req, res) => res.json(employees));

// Audit logs (admin only)
app.get('/logs', adminOnly, (_req, res) => res.json(auditLogs));

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE CONDITION REPORTS
// ═══════════════════════════════════════════════════════════════════════════

// POST /vehicle-condition  — create delivery or receipt report
app.post('/vehicle-condition', supervisorUp, (req, res) => {
  const {
    vehicleId, reportType, mileage, fuelLevel, tiresStatus,
    oilStatus, batteryStatus, glassStatus, lightsStatus,
    overallCondition, notes, damages = [],
  } = req.body || {};

  if (!vehicleId || !reportType) {
    return res.status(400).json({ error: 'vehicleId و reportType مطلوبان' });
  }
  if (!['delivery', 'receipt'].includes(reportType)) {
    return res.status(400).json({ error: 'reportType يجب أن يكون delivery أو receipt' });
  }

  const aiAnalysis = aiAnalyzeCondition({
    mileage, fuelLevel, tiresStatus, oilStatus, overallCondition,
  });

  const report = {
    id: newId(),
    vehicleId,
    reportType,
    mileage,
    fuelLevel,
    tiresStatus,
    oilStatus,
    batteryStatus,
    glassStatus,
    lightsStatus,
    overallCondition,
    notes,
    aiAnalysis,
    createdBy: req.user.username,
    createdAt: new Date().toISOString(),
  };
  conditionReports.push(report);

  const savedDamages = damages.map(d => {
    const dmg = {
      id:          newId(),
      reportId:    report.id,
      vehicleId,
      damageType:  d.damageType,
      severity:    d.severity || 'minor',
      location:    d.location,
      description: d.description,
      repairCost:  d.repairCost,
      repaired:    false,
      createdAt:   new Date().toISOString(),
    };
    vehicleDamages.push(dmg);
    return dmg;
  });

  // Auto-create maintenance alert for poor condition
  if (aiAnalysis.score < 60) {
    maintenanceAlerts.push({
      id:        newId(),
      vehicleId,
      alertType: 'condition',
      message:   `حالة المركبة تحتاج مراجعة — تقرير ${reportType === 'delivery' ? 'التسليم' : 'الاستلام'}`,
      severity:  aiAnalysis.score < 40 ? 'critical' : 'warning',
      resolved:  false,
      createdAt: new Date().toISOString(),
    });
  }

  audit(`تقرير حالة مركبة (${reportType}): ${vehicleId}`, req.user.username);
  res.status(201).json({ report, damages: savedDamages });
});

// GET /vehicle-condition/:vehicleId  — history for one vehicle
app.get('/vehicle-condition/:vehicleId', authAll, (req, res) => {
  const reports = conditionReports
    .filter(r => r.vehicleId === req.params.vehicleId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const damages = vehicleDamages.filter(d => d.vehicleId === req.params.vehicleId);
  res.json({ reports, damages });
});

// GET /vehicle-condition/report/:reportId  — single report detail
app.get('/vehicle-condition/report/:reportId', authAll, (req, res) => {
  const report = conditionReports.find(r => r.id === req.params.reportId);
  if (!report) return res.status(404).json({ error: 'التقرير غير موجود' });
  const damages = vehicleDamages.filter(d => d.reportId === req.params.reportId);
  res.json({ report, damages });
});

// ═══════════════════════════════════════════════════════════════════════════
// PETROMIN INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /petromin/services  — add service record
app.post('/petromin/services', supervisorUp, (req, res) => {
  const {
    vehicleId, serviceType, serviceDate, mileageAtService,
    nextServiceMileage, nextServiceDate, cost,
    oilType, oilBrand, workshopName, workshopCity,
    invoiceNumber, notes,
  } = req.body || {};

  if (!vehicleId || !serviceType || !serviceDate) {
    return res.status(400).json({ error: 'vehicleId و serviceType و serviceDate مطلوبة' });
  }

  const svc = {
    id: newId(),
    vehicleId,
    serviceType,
    serviceDate,
    mileageAtService,
    nextServiceMileage,
    nextServiceDate,
    cost,
    oilType,
    oilBrand,
    workshopName,
    workshopCity,
    invoiceNumber,
    notes,
    syncedFromApi: false,
    createdBy: req.user.username,
    createdAt: new Date().toISOString(),
  };
  petromingServices.push(svc);

  // Auto-alert if next service is within 500 km or 30 days
  if (nextServiceMileage && mileageAtService) {
    maintenanceAlerts.push({
      id:           newId(),
      vehicleId,
      alertType:    'oil_change',
      message:      `تغيير الزيت القادم عند ${nextServiceMileage} كم`,
      severity:     'info',
      dueMileage:   nextServiceMileage,
      dueDate:      nextServiceDate,
      resolved:     false,
      createdAt:    new Date().toISOString(),
    });
  }

  audit(`إضافة خدمة بترومين: ${serviceType} — مركبة ${vehicleId}`, req.user.username);
  res.status(201).json(svc);
});

// GET /petromin/services/:vehicleId  — list services for vehicle
app.get('/petromin/services/:vehicleId', authAll, (req, res) => {
  const services = petromingServices
    .filter(s => s.vehicleId === req.params.vehicleId)
    .sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));
  const prediction = aiOilPrediction(services);
  res.json({ services, prediction });
});

// GET /petromin/services  — all services (admin/supervisor)
app.get('/petromin/services', supervisorUp, (_req, res) => {
  res.json(petromingServices.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate)));
});

// POST /petromin/sync  — simulate API sync with Petromin portal
app.post('/petromin/sync', supervisorUp, (req, res) => {
  const { vehicleId, username, password } = req.body || {};
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId مطلوب' });

  // In production: call real Petromin API with credentials
  // Here we return a mock sync response
  const log = {
    id:            newId(),
    service:       'petromin',
    recordsSynced: 0,
    status:        'ok',
    message:       'تمت المزامنة مع بوابة بترومين بنجاح (وضع تجريبي)',
    syncedAt:      new Date().toISOString(),
  };
  syncLogs.push(log);
  audit(`مزامنة بترومين: مركبة ${vehicleId}`, req.user.username);
  res.json(log);
});

// ═══════════════════════════════════════════════════════════════════════════
// AL-DREES FUEL INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /aldrees/fuel  — add fuel log
app.post('/aldrees/fuel', supervisorUp, (req, res) => {
  const {
    vehicleId, fillDate, liters, costPerLiter, totalCost,
    mileage, fuelCardNumber, stationName, stationCity, driver, notes,
  } = req.body || {};

  if (!vehicleId || !liters) {
    return res.status(400).json({ error: 'vehicleId و liters مطلوبان' });
  }

  const computedTotal = totalCost || (liters * (costPerLiter || 0));

  const log = {
    id:             newId(),
    vehicleId,
    fillDate:       fillDate || new Date().toISOString().slice(0, 10),
    liters:         +liters,
    costPerLiter:   costPerLiter ? +costPerLiter : null,
    totalCost:      computedTotal ? +computedTotal : null,
    mileage,
    fuelCardNumber,
    stationName,
    stationCity,
    driver,
    notes,
    syncedFromApi:  false,
    createdBy:      req.user.username,
    createdAt:      new Date().toISOString(),
  };
  fuelLogs.push(log);

  audit(`إضافة سجل وقود الدريس: ${liters}L — مركبة ${vehicleId}`, req.user.username);
  res.status(201).json(log);
});

// GET /aldrees/fuel/:vehicleId  — fuel history + AI analysis for a vehicle
app.get('/aldrees/fuel/:vehicleId', authAll, (req, res) => {
  const logs = fuelLogs
    .filter(l => l.vehicleId === req.params.vehicleId)
    .sort((a, b) => new Date(b.fillDate) - new Date(a.fillDate));
  const trend = aiFuelTrend(logs);
  res.json({ logs, trend });
});

// GET /aldrees/fuel  — all fuel logs (admin/supervisor)
app.get('/aldrees/fuel', supervisorUp, (_req, res) => {
  res.json(fuelLogs.sort((a, b) => new Date(b.fillDate) - new Date(a.fillDate)));
});

// POST /aldrees/sync  — simulate API sync with Al-Drees portal
app.post('/aldrees/sync', supervisorUp, (req, res) => {
  const { vehicleId, cardNumber, password } = req.body || {};
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId مطلوب' });

  const log = {
    id:            newId(),
    service:       'aldrees',
    recordsSynced: 0,
    status:        'ok',
    message:       'تمت المزامنة مع بوابة الدريس بنجاح (وضع تجريبي)',
    syncedAt:      new Date().toISOString(),
  };
  syncLogs.push(log);
  audit(`مزامنة الدريس: مركبة ${vehicleId}`, req.user.username);
  res.json(log);
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION CREDENTIALS  (admin only)
// ═══════════════════════════════════════════════════════════════════════════

// POST /integrations/connect  — save/update connection credentials
app.post('/integrations/connect', adminOnly, (req, res) => {
  const { service, username, apiKey, accountNumber, cardNumber } = req.body || {};
  if (!service || !['petromin', 'aldrees'].includes(service)) {
    return res.status(400).json({ error: 'service يجب أن يكون petromin أو aldrees' });
  }
  const existing = integrationCreds.find(c => c.service === service);
  if (existing) {
    existing.username      = username || existing.username;
    existing.accountNumber = accountNumber || existing.accountNumber;
    existing.cardNumber    = cardNumber || existing.cardNumber;
    if (apiKey) existing.apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    existing.syncStatus  = 'idle';
    existing.updatedAt   = new Date().toISOString();
    audit(`تحديث بيانات ربط ${service}`, req.user.username);
    return res.json(existing);
  }
  const cred = {
    id:            newId(),
    service,
    username:      username || null,
    apiKeyHash:    apiKey ? crypto.createHash('sha256').update(apiKey).digest('hex') : null,
    accountNumber: accountNumber || null,
    cardNumber:    cardNumber || null,
    syncStatus:    'idle',
    lastSyncAt:    null,
    createdBy:     req.user.username,
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };
  integrationCreds.push(cred);
  audit(`ربط خدمة ${service}`, req.user.username);
  res.status(201).json(cred);
});

// GET /integrations/status  — get connection status for all services
app.get('/integrations/status', authAll, (_req, res) => {
  const petromin = integrationCreds.find(c => c.service === 'petromin');
  const aldrees  = integrationCreds.find(c => c.service === 'aldrees');
  res.json({
    petromin: petromin
      ? { connected: true, username: petromin.username, syncStatus: petromin.syncStatus, lastSyncAt: petromin.lastSyncAt }
      : { connected: false },
    aldrees: aldrees
      ? { connected: true, cardNumber: aldrees.cardNumber, syncStatus: aldrees.syncStatus, lastSyncAt: aldrees.lastSyncAt }
      : { connected: false },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE ALERTS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/alerts', authAll, (req, res) => {
  const vehicleId = req.query.vehicleId;
  const alerts = vehicleId
    ? maintenanceAlerts.filter(a => a.vehicleId === vehicleId)
    : maintenanceAlerts;
  res.json(alerts.filter(a => !a.resolved).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.put('/alerts/:id/resolve', supervisorUp, (req, res) => {
  const alert = maintenanceAlerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'التنبيه غير موجود' });
  alert.resolved   = true;
  alert.resolvedAt = new Date().toISOString();
  audit(`حل تنبيه: ${alert.alertType}`, req.user.username);
  res.json(alert);
});

// ═══════════════════════════════════════════════════════════════════════════
// SYNC LOGS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/sync/logs', supervisorUp, (_req, res) => {
  res.json(syncLogs.sort((a, b) => new Date(b.syncedAt) - new Date(a.syncedAt)));
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
