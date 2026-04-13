
const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const app  = express();
const http = require('http').createServer(app);
const io   = require('socket.io')(http, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'telad-fleet-fna-sa-2025';
const PORT       = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════
// USERS  (in-memory — replace with DB in production)
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
    createdAt: new Date().toISOString()
  }
];

// ─── Role permissions ────────────────────────────────────────────────────────
// admin      → full access + user management
// supervisor → fleet ops (no user management)
// operator   → vehicles + maintenance
// viewer     → read-only dashboard / map
const ROLE_LEVELS = { admin: 4, supervisor: 3, operator: 2, viewer: 1 };
const VALID_ROLES = Object.keys(ROLE_LEVELS);

// ─── Auth middleware ─────────────────────────────────────────────────────────
function requireAuth(roles = []) {
  return (req, res, next) => {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'غير مصرح – يرجى تسجيل الدخول' });
    const token = header.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'لا تملك الصلاحية الكافية لهذا الإجراء' });
      }
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
    }
  };
}

const adminOnly = requireAuth(['admin']);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /auth/login
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });

  const user = users.find(u => u.username === username && u.active);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });

  const payload = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: payload });
});

// GET /auth/me  — verify token + return current user
app.get('/auth/me', requireAuth(), (req, res) => res.json(req.user));

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT  (admin only)
// ═══════════════════════════════════════════════════════════════════════════

// GET /auth/users
app.get('/auth/users', adminOnly, (req, res) => {
  res.json(users.map(({ passwordHash: _, ...u }) => u));
});

// POST /auth/users
app.post('/auth/users', adminOnly, (req, res) => {
  const { name, username, email = '', password, role } = req.body || {};
  if (!name || !username || !password || !role)
    return res.status(400).json({ error: 'الحقول المطلوبة: الاسم، اسم المستخدم، كلمة المرور، الدور' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'الدور غير صالح. الأدوار المتاحة: admin, supervisor, operator, viewer' });
  if (users.find(u => u.username === username))
    return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });

  const user = {
    id: Date.now(),
    name, username, email,
    passwordHash: bcrypt.hashSync(password, 10),
    role, active: true,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  const { passwordHash: _, ...safe } = user;
  res.status(201).json(safe);
});

// PUT /auth/users/:id
app.put('/auth/users/:id', adminOnly, (req, res) => {
  const id  = Number(req.params.id);
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });

  // Protect the original super-admin from demotion or deactivation
  if (id === 1) {
    if (req.body.role   && req.body.role   !== 'admin') return res.status(400).json({ error: 'لا يمكن تغيير دور المدير الرئيسي' });
    if (req.body.active === false)                       return res.status(400).json({ error: 'لا يمكن تعطيل المدير الرئيسي' });
  }

  const { name, email, role, active, password } = req.body;
  if (name     !== undefined) users[idx].name   = name;
  if (email    !== undefined) users[idx].email  = email;
  if (role     !== undefined && VALID_ROLES.includes(role)) users[idx].role   = role;
  if (active   !== undefined) users[idx].active = Boolean(active);
  if (password)               users[idx].passwordHash = bcrypt.hashSync(password, 10);

  const { passwordHash: _, ...safe } = users[idx];
  res.json(safe);
});

// DELETE /auth/users/:id
app.delete('/auth/users/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === 1) return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي للنظام' });
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'المستخدم غير موجود' });
  users.splice(idx, 1);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// GPS / SOCKET.IO
// ═══════════════════════════════════════════════════════════════════════════
io.on('connection', socket => {
  socket.on('gps', data => io.emit('gps-stream', data));
});

app.post('/gps', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  io.emit('gps-stream', req.body);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI PREDICT  (supervisor+)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/ai/predict', requireAuth(['admin', 'supervisor']), (req, res) => {
  res.json({ risk: +(Math.random() * 100).toFixed(1), status: 'OK' });
});

// ═══════════════════════════════════════════════════════════════════════════
// CRUD DATA  (in-memory)
// ═══════════════════════════════════════════════════════════════════════════
let cities = [], projects = [], vehicles = [], employees = [], auditLogs = [];

function audit(action, username) {
  auditLogs.push({ id: Date.now(), action, user: username, time: new Date().toISOString() });
}

// Dashboard summary
app.get('/dashboard', requireAuth(), (_req, res) =>
  res.json({ cities: cities.length, projects: projects.length, vehicles: vehicles.length, employees: employees.length })
);

// Cities
app.post('/cities', requireAuth(['admin', 'supervisor']), (req, res) => {
  const c = { id: Date.now(), ...req.body };
  cities.push(c); audit('إضافة مدينة', req.user.username); res.status(201).json(c);
});
app.get('/cities', requireAuth(), (_req, res) => res.json(cities));

// Projects
app.post('/projects', requireAuth(['admin', 'supervisor']), (req, res) => {
  const p = { id: Date.now(), ...req.body };
  projects.push(p); audit('إضافة مشروع', req.user.username); res.status(201).json(p);
});
app.get('/projects', requireAuth(), (_req, res) => res.json(projects));

// Vehicles
app.post('/vehicles', requireAuth(['admin', 'supervisor', 'operator']), (req, res) => {
  const v = { id: Date.now(), ...req.body };
  vehicles.push(v); audit('إضافة مركبة', req.user.username); res.status(201).json(v);
});
app.get('/vehicles', requireAuth(), (_req, res) => res.json(vehicles));
app.delete('/vehicles/:id', requireAuth(['admin', 'supervisor']), (req, res) => {
  const id = Number(req.params.id);
  const idx = vehicles.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'المركبة غير موجودة' });
  vehicles.splice(idx, 1);
  audit('حذف مركبة', req.user.username);
  res.json({ ok: true });
});

// Employees
app.post('/employees', requireAuth(['admin', 'supervisor']), (req, res) => {
  const e = { id: Date.now(), ...req.body };
  employees.push(e); audit('إضافة موظف', req.user.username); res.status(201).json(e);
});
app.get('/employees', requireAuth(), (_req, res) => res.json(employees));

// Audit logs (admin only)
app.get('/logs', adminOnly, (_req, res) => res.json(auditLogs));

// ═══════════════════════════════════════════════════════════════════════════
http.listen(PORT, () =>
  console.log(`🚀 TELAD FLEET Backend – running on port ${PORT}  |  fna.sa`)
);
