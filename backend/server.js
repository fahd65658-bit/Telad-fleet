// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Production Backend
// Domain : fna.sa   |   API : https://api.fna.sa
// Version: 2.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const crypto     = require('crypto');
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { Server } = require('socket.io');

const logger     = require('./utils/logger');
const { JWT_SECRET_FALLBACK } = require('./utils/constants');
const { requireAuth }                  = require('./middleware/auth');
const { notFound, globalErrorHandler } = require('./middleware/errorHandler');
const { loginLimiter, apiLimiter }     = require('./middleware/rateLimit');
const cache      = require('./services/cache');
const emailSvc   = require('./services/email');
const { predictRisk } = require('./services/ai');

const vehicleRoutes     = require('./routes/vehicles');
const userRoutes        = require('./routes/users');
const maintenanceRoutes = require('./routes/maintenance');
const reportRoutes      = require('./routes/reports');
const gpsRoutes         = require('./routes/gps');

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT    = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && !process.env.JWT_SECRET) {
  logger.error('[FATAL] JWT_SECRET environment variable must be set in production.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_FALLBACK;

const CORS_ORIGINS = [
  'https://fna.sa',
  'https://www.fna.sa',
  'https://fleet.fna.sa',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5500',
  'null',
];

// ─── App setup ───────────────────────────────────────────────────────────────
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

// ─── Shared in-memory state (app.locals) ─────────────────────────────────────
function newId() { return crypto.randomUUID(); }

app.locals.auditLogs = [];
app.locals.cities    = [];
app.locals.projects  = [];
app.locals.employees = [];

function audit(action, username) {
  app.locals.auditLogs.push({ id: newId(), action, user: username, time: new Date().toISOString() });
}

app.locals.users = [
  {
    id:           1,
    name:         'مدير النظام',
    username:     'F',
    email:        'admin@fna.sa',
    passwordHash: bcrypt.hashSync('0241', 10),
    role:         'admin',
    active:       true,
    createdAt:    new Date().toISOString(),
  },
];

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  socket.on('gps', data => io.emit('gps-stream', data));
  socket.on('disconnect', () => {});
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status:    'ok',
  system:    'TELAD FLEET',
  domain:    'fna.sa',
  timestamp: new Date().toISOString(),
  version:   '2.0.0',
}));

// ─── Auth routes ─────────────────────────────────────────────────────────────
app.post('/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

  const user = app.locals.users.find(u => u.username === username && u.active);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

  const payload = { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  audit('تسجيل دخول', user.username);
  res.json({ token, user: payload });
});

app.get('/auth/me', requireAuth(), (req, res) => res.json(req.user));

// ─── City / Project / Employee routes (simple) ───────────────────────────────
const supervisorUp = requireAuth(['admin', 'supervisor']);
const authAll      = requireAuth();

app.post('/cities', supervisorUp, (req, res) => {
  const c = { id: newId(), ...req.body };
  app.locals.cities.push(c);
  audit('إضافة مدينة', req.user.username);
  res.status(201).json(c);
});
app.get('/cities', authAll, (_req, res) => res.json(app.locals.cities));

app.post('/projects', supervisorUp, (req, res) => {
  const p = { id: newId(), ...req.body };
  app.locals.projects.push(p);
  audit('إضافة مشروع', req.user.username);
  res.status(201).json(p);
});
app.get('/projects', authAll, (_req, res) => res.json(app.locals.projects));

app.post('/employees', supervisorUp, (req, res) => {
  const e = { id: newId(), ...req.body };
  app.locals.employees.push(e);
  audit('إضافة موظف', req.user.username);
  res.status(201).json(e);
});
app.get('/employees', authAll, (_req, res) => res.json(app.locals.employees));

// ─── AI predict ──────────────────────────────────────────────────────────────
app.get('/ai/predict', requireAuth(['admin', 'supervisor']), async (req, res) => {
  const result = await predictRisk(req.query.vehicleId);
  res.json(result);
});

// ─── Modular routes ──────────────────────────────────────────────────────────
app.use('/vehicles',    vehicleRoutes(app.locals.auditLogs));
app.use('/auth/users',  userRoutes());
app.use('/maintenance', maintenanceRoutes());
app.use('/',            reportRoutes());
app.use('/gps',         gpsRoutes(io));

// ─── 404 + error handler ─────────────────────────────────────────────────────
app.use(notFound);
app.use(globalErrorHandler);

// ─── Optional services ───────────────────────────────────────────────────────
cache.connect().catch(() => {});
emailSvc.init();

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  logger.info('');
  logger.info('╔═══════════════════════════════════════╗');
  logger.info('║       🚀 TELAD FLEET BACKEND          ║');
  logger.info(`║       Running on port ${PORT}             ║`);
  logger.info('║       Domain: https://fna.sa          ║');
  logger.info('║       API:    https://api.fna.sa      ║');
  logger.info('╚═══════════════════════════════════════╝');
  logger.info('');
  logger.info('  Admin login:  username=F  password=0241');
  logger.info(`  Health:       http://localhost:${PORT}/health`);
  logger.info('');
});
