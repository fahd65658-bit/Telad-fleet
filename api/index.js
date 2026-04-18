'use strict';

const fs = require('fs');
const crypto = require('crypto');
const pathModule = require('path');
const { isWithdrawalOperation } = require('../lib/financial');

let generateFleetAnswer;
try { generateFleetAnswer = require('../lib/ai-chat').generateFleetAnswer; } catch { generateFleetAnswer = null; }

let authModule;
try { authModule = require('../lib/auth'); } catch { authModule = null; }

let analyzeVehicleDamage, formatReportText;
try { ({ analyzeVehicleDamage, formatReportText } = require('../lib/ai-vision')); } catch {}

const BASE_DIR = pathModule.join(__dirname, '..');
const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@fna.sa';
const HAS_ADMIN_PASSWORD = Boolean(process.env.ADMIN_PASSWORD);
const RUNTIME_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || `dev-${crypto.randomBytes(12).toString('base64url')}`;
const ADMIN_PASSWORD_VALUE = RUNTIME_ADMIN_PASSWORD;
const DEPLOY_ID = process.env.DEPLOY_ID || String(Date.now());
const GPS_API_KEY = process.env.GPS_API_KEY || '';
const AUTH_FALLBACK_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || '';
const FALLBACK_TOKEN_SECRET = AUTH_FALLBACK_SECRET || (!IS_PROD ? crypto.randomBytes(32).toString('base64url') : '');
const STATIC_FILE_CACHE = new Map();
const MAX_STATIC_CACHE_ENTRIES = 32;
const STATIC_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
let loggedDevAdminPassword = false;
let loggedFallbackAuthWarning = false;
let loggedGpsKeyDevWarning = false;

if (IS_PROD && !HAS_ADMIN_PASSWORD) {
  throw new Error('[CONFIG] ADMIN_PASSWORD is required in production.');
}
if (IS_PROD && !authModule && !FALLBACK_TOKEN_SECRET) {
  throw new Error('[CONFIG] lib/auth is unavailable and AUTH_SECRET (or JWT_SECRET) is required in production.');
}

const STATUS_LABELS = {
  active: 'نشطة',
  charging: 'شحن',
  maintenance: 'صيانة',
};

const CITY_POOL = ['الرياض', 'جدة', 'الدمام', 'المدينة', 'مكة', 'أبها'];

function uid() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

function seedState() {
  const now = new Date().toISOString();
  return {
    users: [
      { id: '1', name: 'مدير النظام', username: DEFAULT_ADMIN_USERNAME, email: DEFAULT_ADMIN_EMAIL,
        password: ADMIN_PASSWORD_VALUE, role: 'admin', active: true, createdAt: now, token: null },
      { id: '2', name: 'أحمد المشرف', username: 'supervisor1', email: 'supervisor@fna.sa',
        password: 'sup2024', role: 'supervisor', active: true, createdAt: now, token: null },
    ],
    vehicles: [
      { id: '1', name: 'تويوتا لاندكروزر', plate: 'أ ب ج 1234', city: 'الرياض', driver: 'أحمد سالم', status: 'active', location: 'الرياض', lat: 24.7136, lng: 46.6753 },
      { id: '2', name: 'فورد F-150', plate: 'د هـ و 5678', city: 'جدة', driver: 'سارة علي', status: 'charging', location: 'جدة', lat: 21.4858, lng: 39.1925 },
      { id: '3', name: 'شيفروليه سيلفرادو', plate: 'ز ح ط 9012', city: 'الدمام', driver: 'خالد حسن', status: 'maintenance', location: 'الدمام', lat: 26.4207, lng: 50.0888 },
      { id: '4', name: 'تويوتا هايلوكس', plate: 'ي ك ل 3456', city: 'المدينة', driver: 'منى فهد', status: 'active', location: 'المدينة', lat: 24.5247, lng: 39.5692 },
      { id: '5', name: 'نيسان باترول', plate: 'م ن س 7890', city: 'مكة', driver: 'علي ناصر', status: 'active', location: 'مكة', lat: 21.3891, lng: 39.8579 },
      { id: '6', name: 'مرسيدس سبرينتر', plate: 'ع غ ف 1122', city: 'أبها', driver: 'هند راشد', status: 'charging', location: 'أبها', lat: 18.2164, lng: 42.5053 },
    ],
    drivers: [
      { id: '1', name: 'أحمد سالم', phone: '0501234567', licenseNo: 'SA-101', licenseExpiry: '2026-06-01', status: 'active', createdAt: now },
      { id: '2', name: 'سارة علي', phone: '0509876543', licenseNo: 'SA-102', licenseExpiry: '2025-12-31', status: 'active', createdAt: now },
      { id: '3', name: 'خالد حسن', phone: '0505551234', licenseNo: 'SA-103', licenseExpiry: '2027-03-15', status: 'active', createdAt: now },
      { id: '4', name: 'منى فهد', phone: '0502223344', licenseNo: 'SA-104', licenseExpiry: '2026-09-20', status: 'active', createdAt: now },
    ],
    maintenance: [
      { id: '1', vehicleId: '3', type: 'تغيير زيت', description: 'تغيير زيت المحرك الدوري', scheduledDate: '2026-04-20', cost: 350, status: 'pending', createdAt: now },
      { id: '2', vehicleId: '1', type: 'فحص إطارات', description: 'ضخ وتبديل إطارات', scheduledDate: '2026-04-22', cost: 200, status: 'pending', createdAt: now },
    ],
    appointments: [
      { id: '1', vehicleId: '1', type: 'فحص دوري حكومي', scheduledAt: '2026-04-25T09:00', notes: 'تجديد استمارة', status: 'pending', createdAt: now },
      { id: '2', vehicleId: '2', type: 'صيانة دورية', scheduledAt: '2026-04-28T11:00', notes: '', status: 'confirmed', createdAt: now },
    ],
    regions: [
      { id: '1', name: 'منطقة الرياض', description: 'العاصمة والمناطق المحيطة', createdAt: now },
      { id: '2', name: 'منطقة جدة', description: 'ميناء جدة والمناطق الغربية', createdAt: now },
      { id: '3', name: 'المنطقة الشرقية', description: 'الدمام والخبر والظهران', createdAt: now },
    ],
    accidents: [],
    violations: [],
    financial: [
      { id: '1', type: 'fuel', amount: 850, description: 'وقود أسطول مارس', vehicleId: null, date: '2026-03-31', receiptNo: 'REC-001', createdAt: now },
      { id: '2', type: 'maintenance', amount: 2100, description: 'صيانة شاملة المركبة TLD-102', vehicleId: '1', date: '2026-03-15', receiptNo: 'REC-002', createdAt: now },
    ],
    reports: [],
    devRequests: [],
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

function nowIso() { return new Date().toISOString(); }

function applyCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Deploy-Id', DEPLOY_ID);
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

function resolveContentType(filePath, contentType) {
  if (contentType) return contentType;
  return STATIC_MIME_TYPES[pathModule.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function sendFile(res, fileName, contentType) {
  const filePath = pathModule.join(BASE_DIR, fileName);
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return sendJson(res, 404, { error: 'File not found', file: fileName });
    const cached = STATIC_FILE_CACHE.get(filePath);
    const mime = resolveContentType(filePath, contentType);
    let data;
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      data = cached.data;
    } else {
      data = await fs.promises.readFile(filePath);
      if (STATIC_FILE_CACHE.size >= MAX_STATIC_CACHE_ENTRIES) {
        const firstKey = STATIC_FILE_CACHE.keys().next().value;
        if (firstKey) STATIC_FILE_CACHE.delete(firstKey);
      }
      STATIC_FILE_CACHE.set(filePath, { mtimeMs: stat.mtimeMs, data });
    }
    res.statusCode = 200;
    applyCommonHeaders(res);
    res.setHeader('Content-Type', mime);
    return res.end(data);
  } catch (error) {
    if (error && error.code === 'ENOENT') return sendJson(res, 404, { error: 'File not found', file: fileName });
    return sendJson(res, 500, { error: 'File read error', file: fileName });
  }
}

function issueFallbackToken(user) {
  const payloadPart = Buffer.from(JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    issuedAt: Date.now(),
  })).toString('base64url');
  const signaturePart = crypto
    .createHmac('sha256', FALLBACK_TOKEN_SECRET)
    .update(payloadPart)
    .digest('base64url');
  return `${payloadPart}.${signaturePart}`;
}

function verifyFallbackToken(token) {
  const [payloadPart, signaturePart] = String(token || '').split('.');
  if (!payloadPart || !signaturePart || !FALLBACK_TOKEN_SECRET) return null;
  const expected = crypto
    .createHmac('sha256', FALLBACK_TOKEN_SECRET)
    .update(payloadPart)
    .digest('base64url');
  const signatureBuf = Buffer.from(signaturePart);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) return null;
  try {
    return JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function pickAllowedFields(source, allowedFields) {
  const updates = {};
  if (!source || typeof source !== 'object') return updates;
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) updates[field] = source[field];
  }
  return updates;
}

function warnDevConfig() {
  if (!IS_PROD && !HAS_ADMIN_PASSWORD && !loggedDevAdminPassword) {
    loggedDevAdminPassword = true;
    console.warn('[SECURITY] ADMIN_PASSWORD is not set. A random temporary admin password was generated for development mode.');
  }
  if (!IS_PROD && !authModule && !AUTH_FALLBACK_SECRET && !loggedFallbackAuthWarning) {
    loggedFallbackAuthWarning = true;
    console.warn('[SECURITY] AUTH_SECRET/JWT_SECRET is not set. Using ephemeral token signing key (dev-only, tokens reset on restart).');
  }
}

function sanitizeUser(user) {
  return { id: user.id, name: user.name, username: user.username, email: user.email,
    role: user.role, active: user.active, createdAt: user.createdAt };
}

function normalizeRequest(urlString) {
  const url = new URL(urlString, 'https://fna.sa');
  let path = url.pathname;
  // Strip /api prefix (Vercel rewrites /api/* → this function)
  if (path === '/healthz' || path === '/api/health' || path === '/health') path = '/health';
  else if (path === '/api' || path === '/api/') path = '/';
  else if (path.startsWith('/api/')) path = path.slice(4) || '/';
  // Ensure leading slash
  if (!path.startsWith('/')) path = '/' + path;
  return { url, path };
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

function currentUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  if (authModule) {
    try {
      const payload = authModule.verifyAccess(token);
      const user = state.users.find(u => u.id === payload.id && u.active);
      return user ? sanitizeUser(user) : null;
    } catch { return null; }
  }
  const payload = verifyFallbackToken(token);
  if (!payload) return null;
  const user = state.users.find(e => e.id === payload.id && e.token === token && e.active);
  return user ? sanitizeUser(user) : null;
}

function findRawUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  if (authModule) {
    try {
      const payload = authModule.verifyAccess(token);
      return state.users.find(u => u.id === payload.id && u.active) || null;
    } catch { return null; }
  }
  const payload = verifyFallbackToken(token);
  if (!payload) return null;
  return state.users.find(e => e.id === payload.id && e.token === token && e.active) || null;
}

function issueToken(user) {
  let token = null;
  if (authModule && typeof authModule.issueTokens === 'function') {
    const issued = authModule.issueTokens(user);
    if (issued && typeof issued.accessToken === 'string' && issued.accessToken) token = issued.accessToken;
  }
  if (!token) token = issueFallbackToken(user);
  user.token = token;
  return token;
}

function addLog(action, user = 'system') {
  state.logs.push({ id: uid(), action, user, time: nowIso() });
  state.logs = state.logs.slice(-200);
}

function fleetVehicles() {
  return state.vehicles.map(v => ({ ...v, statusLabel: STATUS_LABELS[v.status] || v.status }));
}

function refreshState() {
  const statuses = Object.keys(STATUS_LABELS);
  const v = state.vehicles[Math.floor(Math.random() * state.vehicles.length)];
  if (!v) return;
  v.status = statuses[Math.floor(Math.random() * statuses.length)];
  v.location = CITY_POOL[Math.floor(Math.random() * CITY_POOL.length)];
  v.city = v.location;
  state.alerts.unshift(`تم تحديث حالة ${v.name} إلى ${STATUS_LABELS[v.status]} في ${v.location}`);
  state.alerts = state.alerts.slice(0, 12);
  addLog(`تحديث مباشر للمركبة ${v.name}`, 'system');
}

function buildDashboardSummary() {
  const openAccidents    = state.accidents.filter(a => a.status === 'open').length;
  const unpaidViolations = state.violations.filter(v => v.status === 'unpaid').length;
  const pendingMaint     = state.maintenance.filter(m => m.status === 'pending').length;
  const pendingAppts     = state.appointments.filter(a => a.status === 'pending').length;
  const thisMonth        = new Date().toISOString().slice(0, 7);
  const today            = new Date().toISOString().slice(0, 10);
  const financialMonth   = state.financial
    .filter(f => f.date && f.date.startsWith(thisMonth))
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const activeVehicles   = state.vehicles.filter(v => v.status === 'active').length;
  const handovers        = state.handovers || [];
  const employees        = state.employees || [];

  return {
    vehicles:          state.vehicles.length,
    activeVehicles,
    drivers:           state.drivers.length,
    employees:         employees.length || new Set(state.vehicles.map(v => v.driver)).size,
    maintenance:       pendingMaint,
    appointments:      pendingAppts,
    cities:            new Set(state.vehicles.map(v => v.city)).size,
    projects:          3,
    regions:           state.regions.length,
    accidents:         openAccidents,
    violationsUnpaid:  unpaidViolations,
    financialMonth:    financialMonth.toFixed(2),
    alerts:            state.alerts.length,
    handoversToday:    handovers.filter(h => h.date && h.date.slice(0, 10) === today).length,
    insuranceExpiring: state.vehicles.filter(v => v.insurance?.status === 'expiring').length,
    inspectionExpired: state.vehicles.filter(v => v.inspection?.status === 'منتهي').length,
    efficiency:        Math.round(activeVehicles / Math.max(state.vehicles.length, 1) * 100),
  };
}

function buildFleetPayload(refresh = false) {
  if (refresh) refreshState();
  const vehicles = fleetVehicles();
  const active      = vehicles.filter(v => v.status === 'active').length;
  const charging    = vehicles.filter(v => v.status === 'charging').length;
  const maintenance = vehicles.filter(v => v.status === 'maintenance').length;
  return {
    project: 'Telad Fleet', status: 'running', port: 3000, database: 'serverless-memory',
    updatedAt: nowIso(),
    stats: [
      { label: 'إجمالي المركبات', value: vehicles.length },
      { label: 'نشطة الآن',       value: active },
      { label: 'قيد الشحن',       value: charging },
      { label: 'تحتاج صيانة',     value: maintenance },
    ],
    vehicles: vehicles.map(({ name, driver, status, statusLabel, location }) => ({ name, driver, status, statusLabel, location })),
    alerts: state.alerts.slice(0, 6),
  };
}

function buildAiInsights() {
  const vehicles = fleetVehicles();
  const active   = vehicles.filter(v => v.status === 'active').length;
  const maint    = vehicles.filter(v => v.status === 'maintenance').length;
  const healthScore = Math.round((active / Math.max(vehicles.length, 1)) * 100);
  const pendingMaint    = state.maintenance.filter(m => m.status === 'pending').length;
  const unpaidViol      = state.violations.filter(v => v.status === 'unpaid').length;
  const openAccidents   = state.accidents.filter(a => a.status === 'open').length;

  const alerts = [];
  if (maint > 0) alerts.push({ type: 'danger', message: `${maint} مركبة في الصيانة — تحتاج متابعة فورية` });
  if (pendingMaint > 2) alerts.push({ type: 'warning', message: `${pendingMaint} مهمة صيانة معلّقة — يُنصح بالجدولة` });
  if (unpaidViol > 0) alerts.push({ type: 'warning', message: `${unpaidViol} مخالفة غير مسددة — تأثير على التسجيل` });
  if (openAccidents > 0) alerts.push({ type: 'danger', message: `${openAccidents} حادث مفتوح — يحتاج معالجة` });

  const recommendations = [];
  if (healthScore < 80) recommendations.push({ icon: '🔧', message: 'زيادة جدولة الصيانة الوقائية لتحسين صحة الأسطول' });
  recommendations.push({ icon: '📊', message: 'مراجعة تقارير الاستهلاك الشهري وتحليل التكاليف' });
  recommendations.push({ icon: '🗺️', message: 'تحسين توزيع المركبات بين المناطق لتقليل وقت التنقل' });

  return {
    summary: { healthScore, activeVehicles: active, totalVehicles: vehicles.length,
      pendingMaintenance: pendingMaint, unpaidViolations: unpaidViol, openAccidents },
    alerts, recommendations,
  };
}

function buildAiQueryFallback(question) {
  const q = String(question || '').toLowerCase();
  const vehicles = fleetVehicles();
  const active = vehicles.filter(v => v.status === 'active').length;
  const charging = vehicles.filter(v => v.status === 'charging').length;
  const maintenance = vehicles.filter(v => v.status === 'maintenance').length;
  if (q.includes('مركب') || q.includes('نشط') || q.includes('حالة')) {
    return { answer: `إجمالي المركبات ${vehicles.length} — النشطة ${active} — قيد الشحن ${charging} — في الصيانة ${maintenance}.`, data: { total: vehicles.length, active, charging, maintenance } };
  }
  if (q.includes('سائق') || q.includes('driver')) {
    return { answer: `لدى الأسطول ${state.drivers.length} سائق مسجّل.`, data: { total: state.drivers.length } };
  }
  if (q.includes('مخالف') || q.includes('violation')) {
    const unpaid = state.violations.filter(v => v.status === 'unpaid').length;
    return { answer: `إجمالي المخالفات ${state.violations.length}، منها ${unpaid} غير مسددة.`, data: { total: state.violations.length, unpaid } };
  }
  if (q.includes('صيانة') || q.includes('maintenance')) {
    const pending = state.maintenance.filter(m => m.status === 'pending').length;
    return { answer: `إجمالي مهام الصيانة ${state.maintenance.length}، منها ${pending} معلّقة.`, data: { total: state.maintenance.length, pending } };
  }
  if (q.includes('تنبيه') || q.includes('alert')) {
    return { answer: state.alerts.length ? `يوجد ${state.alerts.length} تنبيهًا، وأحدثها: ${state.alerts[0]}` : 'لا توجد تنبيهات حاليًا.', data: { totalAlerts: state.alerts.length } };
  }
  const insights = buildAiInsights();
  return { answer: `ملخص الأسطول: ${vehicles.length} مركبة — صحة الأسطول ${insights.summary.healthScore}% — ${active} نشطة — ${maintenance} في الصيانة.`, data: insights.summary };
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

// ─── ROUTE MATCHER ──────────────────────────────────────────────────────────

function matchPath(pattern, path) {
  // pattern like '/vehicles/:id' or '/maintenance/:id/complete'
  const parts   = pattern.split('/');
  const segments = path.split('/');
  if (parts.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
    } else if (parts[i] !== segments[i]) {
      return null;
    }
  }
  return params;
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  warnDevConfig();
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  const { url, path } = normalizeRequest(req.url || '/');
  const method = req.method;

  // ── Static files ──────────────────────────────────────────────────
  if (method === 'GET') {
    if (path === '/' || path === '/index.html') return sendFile(res, 'frontend/index.html', 'text/html; charset=utf-8');
    if (path === '/styles.css')  return sendFile(res, 'styles.css', 'text/css; charset=utf-8');
    if (path === '/app.js')      return sendFile(res, 'app.js', 'application/javascript; charset=utf-8');
    if (path.startsWith('/css/') || path.startsWith('/js/') || path.startsWith('/vendor/') || path.startsWith('/assets/')) {
      const mime = resolveContentType(path, null);
      return sendFile(res, 'frontend' + path, mime);
    }
    if (path === '/manifest.json') return sendFile(res, 'frontend/manifest.json', 'application/json; charset=utf-8');
  }

  // ── Health / version ──────────────────────────────────────────────
  if (method === 'GET' && path === '/health')  return sendJson(res, 200, { status: 'ok', service: 'telad-fleet', time: nowIso() });
  if (method === 'GET' && path === '/status')  return sendJson(res, 200, { project: 'Telad Fleet', status: 'running', message: 'Fleet dashboard backend is connected' });
  if (method === 'GET' && path === '/version') return sendJson(res, 200, { version: '3.0.0', deployId: DEPLOY_ID });

  // ── Fleet / dashboard ────────────────────────────────────────────
  if (method === 'GET' && (path === '/fleet' || path === '/dashboard/fleet')) {
    return sendJson(res, 200, buildFleetPayload(url.searchParams.get('refresh') === '1'));
  }
  if (method === 'GET' && path === '/alerts') return sendJson(res, 200, { alerts: state.alerts.slice(0, 6) });
  if (method === 'GET' && path === '/dashboard') return sendJson(res, 200, buildDashboardSummary());

  // ── AUTH ──────────────────────────────────────────────────────────
  if (method === 'POST' && path === '/auth/login') {
    const body = await readBody(req);
    const user = state.users.find(u => u.username === body.username && u.password === body.password && u.active);
    if (!user) return sendJson(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    const token = issueToken(user);
    addLog('تسجيل دخول', user.username);
    return sendJson(res, 200, { token, accessToken: token, user: sanitizeUser(user) });
  }

  if (method === 'GET' && path === '/auth/me') {
    const user = currentUser(req);
    if (!user) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, user);
  }

  if (method === 'POST' && path === '/auth/logout') {
    const raw = findRawUser(req);
    if (raw) { raw.token = null; addLog('تسجيل خروج', raw.username); }
    return sendJson(res, 200, { ok: true });
  }

  // Refresh token endpoint
  if (method === 'POST' && path === '/auth/refresh') {
    if (!authModule) return sendJson(res, 501, { error: 'Refresh tokens not available' });
    const body = await readBody(req);
    const rt = (req.headers.cookie || '').match(/telad_rt=([^;]+)/)?.[1] || body?.refreshToken;
    if (!rt) return sendJson(res, 401, { error: 'لا يوجد Refresh Token' });
    try {
      const payload = authModule.verifyRefresh(rt);
      const user = state.users.find(u => u.id === payload.id && u.active);
      if (!user) return sendJson(res, 401, { error: 'المستخدم غير موجود' });
      const tokens = authModule.issueTokens(user);
      return sendJson(res, 200, { accessToken: tokens.accessToken, token: tokens.accessToken });
    } catch { return sendJson(res, 401, { error: 'Refresh Token منتهٍ أو غير صالح' }); }
  }

  // ── USERS (admin) ─────────────────────────────────────────────────
  if (path === '/auth/users' || path.startsWith('/auth/users/')) {
    const user = findRawUser(req);
    if (!user) return sendJson(res, 401, { error: 'غير مصرح' });

    if (method === 'GET' && path === '/auth/users') {
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      return sendJson(res, 200, state.users.map(sanitizeUser));
    }

    if (method === 'POST' && path === '/auth/users') {
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const body = await readBody(req);
      if (!body.username || !body.password || !body.name) return sendJson(res, 400, { error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
      if (state.users.find(u => u.username === body.username)) return sendJson(res, 409, { error: 'اسم المستخدم موجود مسبقاً' });
      const newUser = { id: uid(), name: body.name, username: body.username, email: body.email || '', password: body.password, role: body.role || 'viewer', active: true, createdAt: nowIso(), token: null };
      state.users.push(newUser);
      addLog(`إضافة مستخدم ${newUser.username}`, user.username);
      return sendJson(res, 201, sanitizeUser(newUser));
    }

    const pm = matchPath('/auth/users/:id', path);
    if (pm) {
      const target = state.users.find(u => u.id === pm.id);
      if (!target) return sendJson(res, 404, { error: 'المستخدم غير موجود' });

      if (method === 'PUT') {
        if (user.role !== 'admin') return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
        const body = await readBody(req);
        if (body.active !== undefined) target.active = Boolean(body.active);
        if (body.role) target.role = body.role;
        if (body.name) target.name = body.name;
        addLog(`تعديل مستخدم ${target.username}`, user.username);
        return sendJson(res, 200, sanitizeUser(target));
      }

      if (method === 'DELETE') {
        if (user.role !== 'admin') return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
        if (target.id === '1') return sendJson(res, 403, { error: 'لا يمكن حذف المدير الرئيسي' });
        state.users = state.users.filter(u => u.id !== pm.id);
        addLog(`حذف مستخدم ${target.username}`, user.username);
        return sendJson(res, 200, { ok: true });
      }
    }
  }

  // ── VEHICLES ──────────────────────────────────────────────────────
  if (method === 'GET' && path === '/vehicles') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, fleetVehicles());
  }

  if (method === 'POST' && path === '/vehicles') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin','supervisor','operator'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    if (!body.name || !body.plate) return sendJson(res, 400, { error: 'اسم المركبة ورقم اللوحة مطلوبان' });
    const v = { id: uid(), name: body.name, plate: body.plate, city: body.city || '', driver: body.driver || '', status: 'active', location: body.city || '', lat: null, lng: null };
    state.vehicles.push(v);
    addLog(`إضافة مركبة ${v.name}`, cu.username);
    return sendJson(res, 201, v);
  }

  {
    const pm = matchPath('/vehicles/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin','supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      state.vehicles = state.vehicles.filter(v => v.id !== pm.id);
      addLog(`حذف مركبة ${pm.id}`, cu.username);
      return sendJson(res, 200, { ok: true });
    }
    if (pm && method === 'PUT') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const v = state.vehicles.find(x => x.id === pm.id);
      if (!v) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
      const body = await readBody(req);
      const updates = pickAllowedFields(body, [
        'name', 'plate', 'city', 'driver', 'status', 'location',
        'lat', 'lng', 'gpsUpdatedAt', 'type', 'brand', 'model', 'year',
        'vin', 'color', 'odometer', 'fuelType', 'fuelLevel',
        'lastServiceAt', 'nextServiceAt', 'insurance', 'inspection', 'notes',
      ]);
      Object.assign(v, updates);
      addLog(`تعديل مركبة ${v.name}`, cu.username);
      return sendJson(res, 200, v);
    }
  }

  // ── DRIVERS ───────────────────────────────────────────────────────
  if (method === 'GET' && path === '/drivers') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.drivers);
  }

  if (method === 'POST' && path === '/drivers') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin','supervisor','operator'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    if (!body.name) return sendJson(res, 400, { error: 'اسم السائق مطلوب' });
    const d = { id: uid(), name: body.name, phone: body.phone || '', licenseNo: body.licenseNo || '', licenseExpiry: body.licenseExpiry || null, status: 'active', createdAt: nowIso() };
    state.drivers.push(d);
    addLog(`إضافة سائق ${d.name}`, cu.username);
    return sendJson(res, 201, d);
  }

  {
    const pm = matchPath('/drivers/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.drivers = state.drivers.filter(d => d.id !== pm.id);
      addLog(`حذف سائق ${pm.id}`, cu.username);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── MAINTENANCE ───────────────────────────────────────────────────
  if (method === 'GET' && path === '/maintenance') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.maintenance);
  }

  if (method === 'POST' && path === '/maintenance') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin','supervisor','operator'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    if (!body.vehicleId || !body.type) return sendJson(res, 400, { error: 'معرّف المركبة والنوع مطلوبان' });
    const m = { id: uid(), vehicleId: body.vehicleId, type: body.type, description: body.description || '', scheduledDate: body.scheduledDate || null, cost: body.cost !== undefined ? Number(body.cost) : null, status: 'pending', createdAt: nowIso() };
    state.maintenance.push(m);
    addLog(`إضافة صيانة لمركبة ${m.vehicleId}`, cu.username);
    return sendJson(res, 201, m);
  }

  {
    const pmc = matchPath('/maintenance/:id/complete', path);
    if (pmc && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const m = state.maintenance.find(x => x.id === pmc.id);
      if (!m) return sendJson(res, 404, { error: 'مهمة الصيانة غير موجودة' });
      m.status = 'completed'; m.completedAt = nowIso();
      addLog(`إتمام صيانة ${m.id}`, cu.username);
      return sendJson(res, 200, m);
    }
    const pm = matchPath('/maintenance/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.maintenance = state.maintenance.filter(x => x.id !== pm.id);
      addLog(`حذف صيانة ${pm.id}`, cu.username);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── APPOINTMENTS ──────────────────────────────────────────────────
  if (method === 'GET' && path === '/appointments') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.appointments);
  }

  if (method === 'POST' && path === '/appointments') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    if (!body.vehicleId || !body.type || !body.scheduledAt) return sendJson(res, 400, { error: 'معرّف المركبة والنوع والموعد مطلوبة' });
    const a = { id: uid(), vehicleId: body.vehicleId, type: body.type, scheduledAt: body.scheduledAt, notes: body.notes || '', status: 'pending', createdAt: nowIso() };
    state.appointments.push(a);
    addLog(`إضافة موعد لمركبة ${a.vehicleId}`, cu.username);
    return sendJson(res, 201, a);
  }

  {
    const pmc = matchPath('/appointments/:id/confirm', path);
    if (pmc && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const a = state.appointments.find(x => x.id === pmc.id);
      if (!a) return sendJson(res, 404, { error: 'الموعد غير موجود' });
      a.status = 'confirmed';
      addLog(`تأكيد موعد ${a.id}`, cu.username);
      return sendJson(res, 200, a);
    }
    const pcancel = matchPath('/appointments/:id/cancel', path);
    if (pcancel && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const a = state.appointments.find(x => x.id === pcancel.id);
      if (!a) return sendJson(res, 404, { error: 'الموعد غير موجود' });
      a.status = 'cancelled';
      addLog(`إلغاء موعد ${a.id}`, cu.username);
      return sendJson(res, 200, a);
    }
    const pm = matchPath('/appointments/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.appointments = state.appointments.filter(x => x.id !== pm.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── REGIONS ───────────────────────────────────────────────────────
  if (method === 'GET' && path === '/regions') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.regions);
  }

  if (method === 'POST' && path === '/regions') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    if (!body.name) return sendJson(res, 400, { error: 'اسم المنطقة مطلوب' });
    const r = { id: uid(), name: body.name, description: body.description || '', createdAt: nowIso() };
    state.regions.push(r);
    addLog(`إضافة منطقة ${r.name}`, cu.username);
    return sendJson(res, 201, r);
  }

  {
    const pm = matchPath('/regions/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.regions = state.regions.filter(r => r.id !== pm.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── ACCIDENTS ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/accidents') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.accidents);
  }

  if (method === 'POST' && path === '/accidents') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    if (!body.vehicleId || !body.description) return sendJson(res, 400, { error: 'معرّف المركبة والوصف مطلوبان' });
    const a = { id: uid(), vehicleId: body.vehicleId, date: body.date || nowIso().slice(0,10), location: body.location || '', description: body.description, injuriesCount: Number(body.injuriesCount) || 0, damageAmount: Number(body.damageAmount) || 0, status: 'open', createdAt: nowIso() };
    state.accidents.push(a);
    addLog(`تسجيل حادث لمركبة ${a.vehicleId}`, cu.username);
    return sendJson(res, 201, a);
  }

  {
    const pm = matchPath('/accidents/:id', path);
    if (pm) {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const a = state.accidents.find(x => x.id === pm.id);
      if (!a) return sendJson(res, 404, { error: 'الحادث غير موجود' });
      if (method === 'PUT') {
        const body = await readBody(req);
        if (body.status) a.status = body.status;
        addLog(`تحديث حادث ${a.id}`, cu.username);
        return sendJson(res, 200, a);
      }
      if (method === 'DELETE') {
        state.accidents = state.accidents.filter(x => x.id !== pm.id);
        addLog(`حذف حادث ${pm.id}`, cu.username);
        return sendJson(res, 200, { ok: true });
      }
    }
  }

  // ── VIOLATIONS ────────────────────────────────────────────────────
  if (method === 'GET' && path === '/violations') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.violations);
  }

  if (method === 'POST' && path === '/violations') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    if (!body.vehicleId || !body.type || !body.amount) return sendJson(res, 400, { error: 'معرّف المركبة والنوع والمبلغ مطلوبة' });
    const v = { id: uid(), vehicleId: body.vehicleId, date: body.date || nowIso().slice(0,10), type: body.type, amount: Number(body.amount), description: body.description || '', status: 'unpaid', createdAt: nowIso() };
    state.violations.push(v);
    addLog(`تسجيل مخالفة لمركبة ${v.vehicleId}`, cu.username);
    return sendJson(res, 201, v);
  }

  {
    const pmpay = matchPath('/violations/:id/pay', path);
    if (pmpay && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const v = state.violations.find(x => x.id === pmpay.id);
      if (!v) return sendJson(res, 404, { error: 'المخالفة غير موجودة' });
      v.status = 'paid'; v.paidAt = nowIso();
      addLog(`تسديد مخالفة ${v.id}`, cu.username);
      return sendJson(res, 200, v);
    }
    const pm = matchPath('/violations/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.violations = state.violations.filter(x => x.id !== pm.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── FINANCIAL ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/financial') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.financial);
  }

  if (method === 'GET' && path === '/financial/withdrawals') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.financial.filter(isWithdrawalOperation));
  }

  if (method === 'POST' && path === '/financial') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    if (!body.amount || !body.description || !body.date) return sendJson(res, 400, { error: 'المبلغ والوصف والتاريخ مطلوبة' });
    const f = { id: uid(), type: body.type || 'other', amount: Number(body.amount), description: body.description, vehicleId: body.vehicleId || null, date: body.date, receiptNo: body.receiptNo || '', createdAt: nowIso() };
    state.financial.push(f);
    addLog(`إضافة معاملة مالية ${f.description}`, cu.username);
    return sendJson(res, 201, f);
  }

  {
    const pm = matchPath('/financial/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.financial = state.financial.filter(x => x.id !== pm.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── REPORTS ───────────────────────────────────────────────────────
  if (method === 'GET' && path === '/reports') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.reports);
  }

  if (method === 'POST' && path === '/reports/generate') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    const r = { id: uid(), title: body.title || 'تقرير جديد', type: body.type || 'summary', createdBy: cu.username, createdAt: nowIso() };
    state.reports.push(r);
    addLog(`إنشاء تقرير: ${r.title}`, cu.username);
    return sendJson(res, 201, r);
  }

  if (method === 'GET' && path === '/reports/analytics') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, {
      summary: {
        vehicles: state.vehicles.length,
        drivers:  state.drivers.length,
        maintenancePending: state.maintenance.filter(m => m.status === 'pending').length,
        maintenanceDone:    state.maintenance.filter(m => m.status === 'completed').length,
        appointmentsPending: state.appointments.filter(a => a.status === 'pending').length,
        regions: state.regions.length,
      },
    });
  }

  // ── LOGS ──────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/logs') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.logs.slice().reverse());
  }

  // ── AI ────────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/ai/insights') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, buildAiInsights());
  }

  if (method === 'GET' && path === '/ai/predict') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, { risk: 18.4, confidence: 96.2, status: 'OK', model: 'telad-fleet-edge' });
  }

  if (method === 'POST' && path === '/ai/query') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin','supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    const fallback = buildAiQueryFallback(body.question);
    if (generateFleetAnswer) {
      const snapshot = {
        vehicles: fleetVehicles().map(({ name, driver, status, statusLabel, location }) => ({ name, driver, status, statusLabel, location })),
        alerts: state.alerts.slice(0, 6),
        summary: buildDashboardSummary(),
      };
      const result = await generateFleetAnswer({ question: body.question, snapshot, fallbackResult: fallback });
      return sendJson(res, 200, result);
    }
    return sendJson(res, 200, fallback);
  }

  // ── DEV REQUESTS ──────────────────────────────────────────────────
  if (method === 'GET' && path === '/dev-requests') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.devRequests.slice().reverse());
  }

  if (method === 'POST' && path === '/dev-requests') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    if (!body.request) return sendJson(res, 400, { error: 'نص الطلب مطلوب' });
    const text = String(body.request);
    // Simple AI-like classification
    const categories = ['واجهة المستخدم','قاعدة البيانات','التقارير','التكاملات','الأداء','الأمان','ميزة جديدة'];
    const priorities = ['عالية','متوسطة','منخفضة'];
    const complexities = ['بسيط','متوسط','معقد'];
    const category   = text.includes('شاشة') || text.includes('واجهة') ? 'واجهة المستخدم' : categories[Math.floor(Math.random() * categories.length)];
    const priority   = text.includes('عاجل') || text.includes('مهم') ? 'عالية' : priorities[1];
    const complexity = text.length > 200 ? 'معقد' : text.length > 80 ? 'متوسط' : 'بسيط';
    const words = text.split(/\s+/).slice(0, 8).join(' ');
    const title = words.length > 3 ? words : 'طلب تطوير جديد';
    const dr = { id: uid(), request: text, title, category, priority, complexity, status: 'مفتوح', githubIssue: null, createdAt: nowIso(), createdBy: cu.username };
    state.devRequests.push(dr);
    addLog(`طلب تطوير: ${title}`, cu.username);
    return sendJson(res, 201, dr);
  }

  {
    const pmstatus = matchPath('/dev-requests/:id/status', path);
    if (pmstatus && method === 'PUT') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const dr = state.devRequests.find(x => x.id === pmstatus.id);
      if (!dr) return sendJson(res, 404, { error: 'الطلب غير موجود' });
      const body = await readBody(req);
      if (body.status) dr.status = body.status;
      addLog(`تحديث طلب تطوير ${dr.id} إلى ${dr.status}`, cu.username);
      return sendJson(res, 200, dr);
    }
    const pm = matchPath('/dev-requests/:id', path);
    if (pm && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      state.devRequests = state.devRequests.filter(x => x.id !== pm.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── HANDOVERS ──────────────────────────────────────────────────────
  if (method === 'GET' && path === '/handovers') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.handovers || []);
  }
  {
    const pmv = matchPath('/vehicles/:id/handovers', path);
    if (pmv && method === 'GET') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      return sendJson(res, 200, (state.handovers || []).filter(h => h.vehicleId === pmv.id));
    }
    const pmh = matchPath('/vehicles/:id/handover', path);
    if (pmh && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const v = state.vehicles.find(x => x.id === pmh.id);
      if (!v) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
      const body = await readBody(req);
      if (!state.handovers) state.handovers = [];
      let aiReport = '';
      if (analyzeVehicleDamage) {
        try { aiReport = formatReportText(await analyzeVehicleDamage(body.images || [], v, body.type || 'استلام')); } catch {}
      }
      const h = {
        id: uid(), vehicleId: v.id, vehiclePlate: v.plate, vehicleName: v.name,
        type: body.type || 'استلام', employeeId: body.employeeId || '', employeeName: body.employeeName || cu.name,
        date: nowIso(), km: Number(body.km) || 0, fuelLevel: Number(body.fuelLevel) || 0,
        condition: body.condition || 'جيد', notes: body.notes || '', images: body.images || [],
        aiReport, createdAt: nowIso(),
      };
      state.handovers.push(h);
      addLog(`${h.type}: ${v.name} ← ${h.employeeName}`, cu.username);
      return sendJson(res, 201, h);
    }
    const pmhd = matchPath('/handovers/:id', path);
    if (pmhd && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin','supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      state.handovers = (state.handovers || []).filter(x => x.id !== pmhd.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── EMPLOYEES ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/employees') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.employees || []);
  }
  if (method === 'POST' && path === '/employees') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin','supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    if (!state.employees) state.employees = [];
    const emp = { id: uid(), ...body, status: body.status || 'active', createdAt: nowIso() };
    state.employees.push(emp);
    addLog(`إضافة موظف: ${emp.name || emp.id}`, cu.username);
    return sendJson(res, 201, emp);
  }
  {
    const pme = matchPath('/employees/:id', path);
    if (pme) {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const emp = (state.employees || []).find(e => e.id === pme.id);
      if (!emp) return sendJson(res, 404, { error: 'الموظف غير موجود' });
      if (method === 'GET') return sendJson(res, 200, emp);
      if (method === 'PUT') {
        if (!['admin','supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
        const body = await readBody(req);
        const updates = pickAllowedFields(body, [
          'name', 'phone', 'email', 'status', 'department', 'jobTitle',
          'position', 'vehicleId', 'licenseNo', 'nationalId', 'iqamaNo',
          'hireDate', 'notes',
        ]);
        Object.assign(emp, updates);
        return sendJson(res, 200, emp);
      }
      if (method === 'DELETE') {
        if (cu.role !== 'admin') return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
        state.employees = state.employees.filter(e => e.id !== pme.id);
        return sendJson(res, 200, { ok: true });
      }
    }
  }

  // ── GPS POSITIONS (REST, no WebSocket on Vercel) ───────────────────
  if (method === 'GET' && path === '/gps/positions') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const positions = state.vehicles.map(v => ({ vehicleId: v.id, plate: v.plate, name: v.name, lat: v.lat, lng: v.lng, status: v.status, t: v.gpsUpdatedAt || null }));
    return sendJson(res, 200, positions);
  }

  if (method === 'POST' && path === '/gps/push') {
    const body = await readBody(req);
    // Simple API-key or token auth for GPS devices
    const key = req.headers['x-gps-key'] || body.key;
    if (GPS_API_KEY) {
      if (key !== GPS_API_KEY) return sendJson(res, 401, { error: 'مفتاح GPS غير صالح' });
    } else if (IS_PROD) {
      return sendJson(res, 500, { error: 'GPS_API_KEY غير مضبوط في بيئة الإنتاج' });
    } else if (!loggedGpsKeyDevWarning) {
      loggedGpsKeyDevWarning = true;
      console.warn('[SECURITY] GPS_API_KEY is not set. /gps/push is allowed only for development mode.');
    }
    const { vehicleId, lat, lng } = body;
    if (!vehicleId || lat == null || lng == null) return sendJson(res, 400, { error: 'vehicleId, lat, lng مطلوبة' });
    const v = state.vehicles.find(x => x.id === vehicleId);
    if (v) { v.lat = parseFloat(lat); v.lng = parseFloat(lng); v.gpsUpdatedAt = nowIso(); }
    return sendJson(res, 200, { ok: true, vehicleId, lat, lng });
  }

  return sendJson(res, 404, { error: 'Route not found', path });
};
