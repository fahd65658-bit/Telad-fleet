
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

app.use(express.json({ limit: '10mb' }));

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

let vehicleConditionReports = [];
let vehicleDamages          = [];
let vehiclePhotosHistory     = [];

function audit(action, username) {
  auditLogs.push({
    id:     newId(),
    action,
    user:   username,
    time:   new Date().toISOString(),
  });
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
// AI IMAGE ANALYSIS  (OpenAI gpt-4o-mini vision)
// ═══════════════════════════════════════════════════════════════════════════
async function analyzeImagesWithAI(photos, context = '') {
  const MOCK = {
    mock: true,
    overallCondition: 'good',
    conditionScore: 85,
    summary: 'تحليل تجريبي — لم يتم تكوين مفتاح OpenAI API',
    damages: [],
    recommendations: ['قم بتكوين OPENAI_API_KEY للحصول على تحليل حقيقي بالذكاء الاصطناعي'],
    estimatedRepairCost: 0,
  };

  const key = process.env.OPENAI_API_KEY;
  if (!key) return MOCK;

  try {
    const imageMessages = photos.slice(0, 4).map(photo => ({
      type: 'image_url',
      image_url: {
        url: photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`,
        detail: 'low',
      },
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `حلل حالة المركبة في هذه الصور${context ? ' - ' + context : ''}. أجب بـ JSON فقط بهذا الشكل:
{"overallCondition":"good|fair|poor","conditionScore":0,"summary":"وصف موجز","damages":[{"type":"نوع","location":"موقع","severity":"low|medium|high","estimatedCost":0}],"recommendations":["توصية"],"estimatedRepairCost":0}`,
              },
              ...imageMessages,
            ],
          },
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) return MOCK;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return MOCK;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return MOCK;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE CONDITION REPORTS
// ═══════════════════════════════════════════════════════════════════════════
const vcAuth = requireAuth(['admin', 'supervisor', 'operator']);

// POST /vehicle-condition/delivery
app.post('/vehicle-condition/delivery', vcAuth, async (req, res) => {
  const {
    vehiclePlate, employeeName, driverName, mileage, fuelLevel,
    tireCondition, oilLevel, batteryCondition, glassCondition,
    lightsCondition, mirrorsCondition, notes, photos = [],
  } = req.body || {};

  if (!vehiclePlate) return res.status(400).json({ error: 'رقم اللوحة مطلوب' });

  const report = {
    id:               newId(),
    type:             'delivery',
    vehiclePlate,
    employeeName:     employeeName     || '',
    driverName:       driverName       || '',
    mileage:          mileage          || 0,
    fuelLevel:        fuelLevel        || 0,
    tireCondition:    tireCondition    || '',
    oilLevel:         oilLevel         || '',
    batteryCondition: batteryCondition || '',
    glassCondition:   glassCondition   || '',
    lightsCondition:  lightsCondition  || '',
    mirrorsCondition: mirrorsCondition || '',
    notes:            notes            || '',
    aiAnalysis:       null,
    status:           'pending_analysis',
    createdBy:        req.user.username,
    createdAt:        new Date().toISOString(),
  };

  photos.forEach(p => {
    vehiclePhotosHistory.push({
      id:          newId(),
      vehiclePlate,
      reportId:    report.id,
      photoData:   p.data,
      direction:   p.direction || '',
      type:        'delivery',
      aiData:      null,
      createdAt:   new Date().toISOString(),
    });
  });

  // Limit to 4 photos: OpenAI vision API max images per request to control cost and token usage
  const photoData = photos.slice(0, 4).map(p => p.data).filter(Boolean);
  if (photoData.length) {
    report.aiAnalysis = await analyzeImagesWithAI(photoData, `تسليم مركبة ${vehiclePlate}`);
    report.status = 'analyzed';
  } else {
    report.status = 'completed';
  }

  vehicleConditionReports.push(report);
  audit(`تقرير تسليم مركبة: ${vehiclePlate}`, req.user.username);
  res.status(201).json(report);
});

// POST /vehicle-condition/receipt
app.post('/vehicle-condition/receipt', vcAuth, async (req, res) => {
  const {
    vehiclePlate, employeeName, driverName, finalMileage,
    daysUsed, currentCondition, notes, photos = [],
  } = req.body || {};

  if (!vehiclePlate) return res.status(400).json({ error: 'رقم اللوحة مطلوب' });

  const report = {
    id:               newId(),
    type:             'receipt',
    vehiclePlate,
    employeeName:     employeeName     || '',
    driverName:       driverName       || '',
    finalMileage:     finalMileage     || 0,
    daysUsed:         daysUsed         || 0,
    currentCondition: currentCondition || '',
    notes:            notes            || '',
    aiAnalysis:       null,
    status:           'pending_analysis',
    createdBy:        req.user.username,
    createdAt:        new Date().toISOString(),
  };

  photos.forEach(p => {
    vehiclePhotosHistory.push({
      id:          newId(),
      vehiclePlate,
      reportId:    report.id,
      photoData:   p.data,
      direction:   p.direction || '',
      type:        'receipt',
      aiData:      null,
      createdAt:   new Date().toISOString(),
    });
  });

  const photoData = photos.slice(0, 4).map(p => p.data).filter(Boolean);
  if (photoData.length) {
    report.aiAnalysis = await analyzeImagesWithAI(photoData, `استلام مركبة ${vehiclePlate}`);
    report.status = 'analyzed';
  } else {
    report.status = 'completed';
  }

  vehicleConditionReports.push(report);
  audit(`تقرير استلام مركبة: ${vehiclePlate}`, req.user.username);
  res.status(201).json(report);
});

// POST /vehicle-condition/analyze-images
app.post('/vehicle-condition/analyze-images', vcAuth, async (req, res) => {
  const { photos = [], context = '', reportId } = req.body || {};
  if (!photos.length) return res.status(400).json({ error: 'لا توجد صور للتحليل' });

  const photoData = photos.slice(0, 4)
    .map(p => (typeof p === 'string' ? p : p.data))
    .filter(Boolean);

  const analysis = await analyzeImagesWithAI(photoData, context);

  if (reportId) {
    const report = vehicleConditionReports.find(r => r.id === reportId);
    if (report) { report.aiAnalysis = analysis; report.status = 'analyzed'; }
  }

  res.json({ analysis });
});

// POST /vehicle-condition/compare
app.post('/vehicle-condition/compare', vcAuth, async (req, res) => {
  const { vehiclePlate, photos = [] } = req.body || {};
  if (!vehiclePlate) return res.status(400).json({ error: 'رقم اللوحة مطلوب' });

  const lastDelivery = [...vehicleConditionReports]
    .reverse()
    .find(r => r.vehiclePlate === vehiclePlate && r.type === 'delivery');

  const photoData = photos.slice(0, 4)
    .map(p => (typeof p === 'string' ? p : p.data))
    .filter(Boolean);

  const analysis = await analyzeImagesWithAI(
    photoData, `مقارنة حالة مركبة ${vehiclePlate}`
  );

  res.json({
    lastDelivery:    lastDelivery || null,
    currentAnalysis: analysis,
    hasComparison:   !!lastDelivery,
  });
});

// GET /vehicle-condition/reports
app.get('/vehicle-condition/reports', vcAuth, (_req, res) => {
  res.json(vehicleConditionReports);
});

// GET /vehicle-condition/:vehicleId/history
app.get('/vehicle-condition/:vehicleId/history', authAll, (req, res) => {
  const key = req.params.vehicleId;
  res.json(vehicleConditionReports.filter(
    r => r.vehiclePlate === key || r.id === key
  ));
});

// GET /vehicle-condition/:reportId/damages
app.get('/vehicle-condition/:reportId/damages', authAll, (req, res) => {
  res.json(vehicleDamages.filter(d => d.reportId === req.params.reportId));
});

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
