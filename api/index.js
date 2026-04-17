'use strict';

const crypto = require('crypto');
const fs = require('fs');
const pathModule = require('path');

const BASE_DIR = pathModule.join(__dirname, '..');
const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'F';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@fna.sa';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PROD ? crypto.randomBytes(24).toString('hex') : '0241');

if (IS_PROD && !process.env.ADMIN_PASSWORD) {
  console.warn('[WARN] ADMIN_PASSWORD is not set in production; default admin login is disabled until you set it.');
}

const STATUS_LABELS = {
  active: 'نشطة',
  charging: 'شحن',
  maintenance: 'صيانة',
};

const CITY_POOL = ['الرياض', 'جدة', 'الدمام', 'المدينة', 'مكة', 'أبها'];

function seedState() {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: '1',
        name: 'مدير النظام',
        username: DEFAULT_ADMIN_USERNAME,
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        role: 'admin',
        active: true,
        createdAt: now,
        token: null,
      },
    ],
    vehicles: [
      { id: '1', name: 'TLD-102', plate: 'TLD-102', city: 'الرياض', driver: 'أحمد سالم', status: 'active', location: 'الرياض' },
      { id: '2', name: 'TLD-118', plate: 'TLD-118', city: 'جدة', driver: 'سارة علي', status: 'charging', location: 'جدة' },
      { id: '3', name: 'TLD-204', plate: 'TLD-204', city: 'الدمام', driver: 'خالد حسن', status: 'maintenance', location: 'الدمام' },
      { id: '4', name: 'TLD-221', plate: 'TLD-221', city: 'المدينة', driver: 'منى فهد', status: 'active', location: 'المدينة' },
    ],
    alerts: [
      'المركبة TLD-204 بحاجة إلى فحص دوري خلال 24 ساعة.',
      'تم اكتمال شحن المركبة TLD-118 بنسبة 82٪.',
      'تم إرسال تحديث مسار جديد إلى السائقين النشطين.',
    ],
    logs: [
      { id: '1', action: 'تهيئة النظام', user: 'system', time: now },
    ],
  };
}

const state = globalThis.__TELAD_FLEET_STATE || (globalThis.__TELAD_FLEET_STATE = seedState());

function nowIso() {
  return new Date().toISOString();
}

function applyCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  applyCommonHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(body);
}

function sendFile(res, fileName, contentType) {
  const filePath = pathModule.join(BASE_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'File not found', file: fileName });
  }

  res.statusCode = 200;
  applyCommonHeaders(res);
  res.setHeader('Content-Type', contentType);
  res.end(fs.readFileSync(filePath));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  };
}

function normalizeRequest(urlString) {
  const url = new URL(urlString, 'https://fna.sa');
  let path = url.pathname;

  if (path === '/healthz' || path === '/api/health') {
    path = '/health';
  } else if (path === '/api') {
    path = '/';
  } else if (path.startsWith('/api/')) {
    path = path.slice(4) || '/';
  }

  return { url, path };
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice(7);
}

function currentUser(req) {
  const token = tokenFromRequest(req);
  if (!token) {
    return null;
  }
  const user = state.users.find((entry) => entry.token === token && entry.active);
  return user ? sanitizeUser(user) : null;
}

function findRawUser(req) {
  const token = tokenFromRequest(req);
  if (!token) {
    return null;
  }
  return state.users.find((entry) => entry.token === token && entry.active) || null;
}

function issueToken(user) {
  const token = Buffer.from(JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    issuedAt: Date.now(),
  })).toString('base64url');
  user.token = token;
  return token;
}

function addLog(action, user = 'system') {
  state.logs.push({
    id: String(Date.now()) + Math.random().toString(16).slice(2),
    action,
    user,
    time: nowIso(),
  });
  state.logs = state.logs.slice(-50);
}

function fleetVehicles() {
  return state.vehicles.map((vehicle) => ({
    ...vehicle,
    statusLabel: STATUS_LABELS[vehicle.status] || vehicle.status,
  }));
}

function refreshState() {
  const statuses = Object.keys(STATUS_LABELS);
  const vehicle = state.vehicles[Math.floor(Math.random() * state.vehicles.length)];
  if (!vehicle) {
    return;
  }

  vehicle.status = statuses[Math.floor(Math.random() * statuses.length)];
  vehicle.location = CITY_POOL[Math.floor(Math.random() * CITY_POOL.length)];
  vehicle.city = vehicle.location;

  const alert = `تم تحديث حالة ${vehicle.name} إلى ${STATUS_LABELS[vehicle.status]} في ${vehicle.location}`;
  state.alerts.unshift(alert);
  state.alerts = state.alerts.slice(0, 12);
  addLog(`تحديث مباشر للمركبة ${vehicle.name}`, 'system');
}

function buildFleetPayload(refresh = false) {
  if (refresh) {
    refreshState();
  }

  const vehicles = fleetVehicles();
  const activeCount = vehicles.filter((item) => item.status === 'active').length;
  const chargingCount = vehicles.filter((item) => item.status === 'charging').length;
  const maintenanceCount = vehicles.filter((item) => item.status === 'maintenance').length;

  return {
    project: 'Telad Fleet',
    status: 'running',
    port: 443,
    database: 'serverless-memory',
    updatedAt: nowIso(),
    stats: [
      { label: 'إجمالي المركبات', value: vehicles.length },
      { label: 'نشطة الآن', value: activeCount },
      { label: 'قيد الشحن', value: chargingCount },
      { label: 'تحتاج صيانة', value: maintenanceCount },
    ],
    vehicles: vehicles.map(({ name, driver, status, statusLabel, location }) => ({
      name,
      driver,
      status,
      statusLabel,
      location,
    })),
    alerts: state.alerts.slice(0, 6),
  };
}

function buildDashboardSummary() {
  return {
    cities: new Set(state.vehicles.map((item) => item.city)).size,
    projects: 3,
    vehicles: state.vehicles.length,
    employees: new Set(state.vehicles.map((item) => item.driver)).size,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  const { url, path } = normalizeRequest(req.url || '/');

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    return sendFile(res, 'index.html', 'text/html; charset=utf-8');
  }

  if (req.method === 'GET' && path === '/styles.css') {
    return sendFile(res, 'styles.css', 'text/css; charset=utf-8');
  }

  if (req.method === 'GET' && path === '/app.js') {
    return sendFile(res, 'app.js', 'application/javascript; charset=utf-8');
  }

  if (req.method === 'GET' && path === '/status') {
    return sendJson(res, 200, {
      project: 'Telad Fleet',
      status: 'running',
      port: 443,
      message: 'Fleet dashboard backend is connected',
    });
  }

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'telad-fleet',
      domain: 'fna.sa',
      time: nowIso(),
    });
  }

  if (req.method === 'GET' && path === '/fleet') {
    return sendJson(res, 200, buildFleetPayload(url.searchParams.get('refresh') === '1'));
  }

  if (req.method === 'GET' && path === '/alerts') {
    return sendJson(res, 200, { alerts: state.alerts.slice(0, 6) });
  }

  if (req.method === 'GET' && path === '/dashboard') {
    return sendJson(res, 200, buildDashboardSummary());
  }

  if (req.method === 'GET' && path === '/vehicles') {
    return sendJson(res, 200, fleetVehicles());
  }

  if (req.method === 'POST' && path === '/auth/login') {
    const body = await readBody(req);
    const user = state.users.find((entry) => entry.username === body.username && entry.password === body.password && entry.active);

    if (!user) {
      return sendJson(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = issueToken(user);
    addLog('تسجيل دخول', user.username);
    return sendJson(res, 200, { token, user: sanitizeUser(user) });
  }

  if (req.method === 'GET' && path === '/auth/me') {
    const user = currentUser(req);
    if (!user) {
      return sendJson(res, 401, { error: 'غير مصرح — يرجى تسجيل الدخول' });
    }
    return sendJson(res, 200, user);
  }

  if (req.method === 'GET' && path === '/auth/users') {
    const user = findRawUser(req);
    if (!user) {
      return sendJson(res, 401, { error: 'غير مصرح — يرجى تسجيل الدخول' });
    }
    if (user.role !== 'admin') {
      return sendJson(res, 403, { error: 'لا تملك الصلاحية الكافية لهذا الإجراء' });
    }
    return sendJson(res, 200, state.users.map(sanitizeUser));
  }

  if (req.method === 'GET' && path === '/logs') {
    const user = currentUser(req);
    if (!user) {
      return sendJson(res, 401, { error: 'غير مصرح — يرجى تسجيل الدخول' });
    }
    return sendJson(res, 200, state.logs.slice().reverse());
  }

  if (req.method === 'GET' && path === '/ai/predict') {
    const user = currentUser(req);
    if (!user) {
      return sendJson(res, 401, { error: 'غير مصرح — يرجى تسجيل الدخول' });
    }
    return sendJson(res, 200, {
      risk: 18.4,
      confidence: 96.2,
      status: 'OK',
      model: 'telad-fleet-edge',
    });
  }

  return sendJson(res, 404, { error: 'Route not found', path });
};
