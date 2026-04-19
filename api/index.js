'use strict';

const fs = require('fs');
const crypto = require('crypto');
const pathModule = require('path');
const jwt = require('jsonwebtoken');
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
const JWT_SECRET = process.env.JWT_SECRET || AUTH_FALLBACK_SECRET || FALLBACK_TOKEN_SECRET;
const QUICK_ACCESS_SESSION_TTL_MS = Number(process.env.QUICK_ACCESS_SESSION_TTL_MS || (8 * 60 * 60 * 1000));
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
const quickAccessSessions = globalThis.__TELAD_FLEET_QUICK_ACCESS_SESSIONS || (globalThis.__TELAD_FLEET_QUICK_ACCESS_SESSIONS = new Map());

function nowIso() { return new Date().toISOString(); }

function normalizeNationalId(value) {
  return String(value || '').trim().replace(/\D/g, '');
}

function normalizePlate(value) {
  return String(value || '').trim().replace(/[\s\-]/g, '').toUpperCase();
}

function generateFallbackNationalId(existingEmployees = []) {
  const used = new Set((existingEmployees || []).map(e => normalizeNationalId(e.nationalId)));
  let candidate = '';
  do {
    candidate = String(crypto.randomInt(1000000000, 9999999999));
  } while (used.has(candidate));
  return candidate;
}

function ensureStateStructure() {
  if (!Array.isArray(state.cities)) state.cities = [];
  if (!Array.isArray(state.projects)) state.projects = [];
  if (!Array.isArray(state.employees)) state.employees = [];
  if (!Array.isArray(state.handovers)) state.handovers = [];
  if (!Array.isArray(state.formsApproved)) state.formsApproved = [];
  if (!Array.isArray(state.approvedForms)) state.approvedForms = [];
  if (!state.formsApproved.length && state.approvedForms.length) state.formsApproved = state.approvedForms;
  if (!state.approvedForms.length && state.formsApproved.length) state.approvedForms = state.formsApproved;
  if (state.approvedForms !== state.formsApproved) state.approvedForms = state.formsApproved;
  if (!Array.isArray(state.maintenanceCards)) state.maintenanceCards = [];
  if (!Array.isArray(state.maintenance)) state.maintenance = [];
  if (!Array.isArray(state.appointments)) state.appointments = [];

  if (state.cities.length === 0) {
    const cityNames = [...new Set((state.vehicles || []).map(v => String(v.city || '').trim()).filter(Boolean))];
    state.cities = cityNames.map((name, idx) => ({ id: `c${idx + 1}`, name, createdAt: nowIso() }));
  }
  const citiesByNormName = new Map(state.cities.map(c => [String(c.name || '').trim().toLowerCase(), c]));

  if (state.projects.length === 0) {
    const baseCityId = state.cities[0]?.id || null;
    state.projects = [
      { id: 'p1', name: 'مشروع الرياض الرئيسي', cityId: baseCityId, createdAt: nowIso() },
      { id: 'p2', name: 'مشروع المنطقة الغربية', cityId: state.cities[1]?.id || baseCityId, createdAt: nowIso() },
      { id: 'p3', name: 'مشروع المنطقة الشرقية', cityId: state.cities[2]?.id || baseCityId, createdAt: nowIso() },
    ];
  }
  const projectsById = new Map(state.projects.map(p => [p.id, p]));

  for (const project of state.projects) {
    if (!project.cityId || !projectsById.has(project.id)) {
      project.cityId = state.cities[0]?.id || null;
    }
  }

  for (const vehicle of state.vehicles) {
    vehicle.plate = String(vehicle.plate || '').trim();
    vehicle.plateNormalized = normalizePlate(vehicle.plate);
    if (!vehicle.insurance) vehicle.insurance = { company: '', policyNo: '', expiry: '', status: 'غير محدد' };
    if (!vehicle.inspection) vehicle.inspection = { status: 'غير محدد', expiry: '', center: '' };
    if (!vehicle.notes) vehicle.notes = '';
    if (!vehicle.driverNotes) vehicle.driverNotes = '';
    if (!Array.isArray(vehicle.quickAccessAttachments)) vehicle.quickAccessAttachments = [];

    if (!vehicle.cityId) {
      const city = citiesByNormName.get(String(vehicle.city || '').trim().toLowerCase());
      if (city) vehicle.cityId = city.id;
    }
    const projectExists = vehicle.projectId && projectsById.has(vehicle.projectId);
    if (!projectExists) {
      const projectInCity = state.projects.find(p => p.cityId === vehicle.cityId);
      vehicle.projectId = projectInCity?.id || state.projects[0]?.id || null;
    }
  }

  if (state.employees.length === 0) {
    const seeded = [];
    for (const v of state.vehicles.slice(0, 6)) {
      const assignedDriver = (state.drivers || []).find(d => (v.driverId && d.id === v.driverId) || d.name === v.driver);
      const nat = normalizeNationalId(assignedDriver?.nationalId || '');
      seeded.push({
        id: uid(),
        name: v.driver || `موظف ${v.id}`,
        nationalId: nat || generateFallbackNationalId([...state.employees, ...seeded]),
        phone: '',
        department: 'العمليات',
        jobTitle: 'مستخدم مركبة',
        vehicleId: v.id,
        cityId: v.cityId || null,
        projectId: v.projectId || null,
        status: 'active',
        createdAt: nowIso(),
      });
    }
    state.employees = seeded;
  }

  for (const emp of state.employees) {
    emp.nationalId = normalizeNationalId(emp.nationalId);
    if (emp.vehicleId) {
      const v = state.vehicles.find(x => x.id === emp.vehicleId);
      if (v) {
        if (!emp.cityId) emp.cityId = v.cityId || null;
        if (!emp.projectId) emp.projectId = v.projectId || null;
      }
    }
    if (!emp.cityId) emp.cityId = state.cities[0]?.id || null;
    if (!emp.projectId) {
      const project = state.projects.find(p => p.cityId === emp.cityId) || state.projects[0];
      emp.projectId = project?.id || null;
    }
  }
}

function findVehicleByPlate(plate) {
  const plateNormalized = normalizePlate(plate);
  return state.vehicles.find(v => normalizePlate(v.plate || v.plateNormalized) === plateNormalized) || null;
}

function findEmployeeByNationalId(nationalId) {
  const normalized = normalizeNationalId(nationalId);
  return (state.employees || []).find(e => normalizeNationalId(e.nationalId) === normalized) || null;
}

function isVehiclePlateUnique(plate, excludeVehicleId = null) {
  const normalized = normalizePlate(plate);
  return !state.vehicles.some(v => v.id !== excludeVehicleId && normalizePlate(v.plate || v.plateNormalized) === normalized);
}

function isEmployeeUnique(nationalId, excludeEmployeeId = null) {
  const normalized = normalizeNationalId(nationalId);
  if (!normalized) return false;
  return !(state.employees || []).some(e => e.id !== excludeEmployeeId && normalizeNationalId(e.nationalId) === normalized);
}

function isProjectInCity(projectId, cityId) {
  const project = (state.projects || []).find(p => p.id === projectId);
  if (!project) return false;
  return !cityId || project.cityId === cityId;
}

function latestMaintenanceForVehicle(vehicleId) {
  const rows = (state.maintenance || []).filter(m => m.vehicleId === vehicleId);
  rows.sort((a, b) => new Date(b.completedAt || b.scheduledDate || b.createdAt || 0) - new Date(a.completedAt || a.scheduledDate || a.createdAt || 0));
  return rows[0] || null;
}

function buildQuickVehicleProfile(vehicle, employee) {
  return {
    vehicleUserName: employee?.name || vehicle.driver || '—',
    vehiclePlate: vehicle.plate || '—',
    insuranceStatus: vehicle.insurance?.status || 'غير محدد',
    inspectionStatus: vehicle.inspection?.status || 'غير محدد',
    vehicleStatus: vehicle.status || 'غير محدد',
    hasGeneralNotes: Boolean(String(vehicle.notes || '').trim()),
    hasDriverNotes: Boolean(String(vehicle.driverNotes || '').trim()),
    latestMaintenance: latestMaintenanceForVehicle(vehicle.id),
  };
}

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

function requireQuickAuth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'غير مصرح' });
    return;
  }
  try {
    const d = jwt.verify(h.slice(7), JWT_SECRET);
    if (d.role !== 'quick') {
      sendJson(res, 403, { error: 'صلاحية غير كافية' });
      return;
    }
    req.quickVehicleId = d.vehicleId;
    req.quickEmployeeId = d.employeeId;
    next();
  } catch {
    sendJson(res, 401, { error: 'انتهت صلاحية الجلسة' });
  }
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
    cities:            (state.cities || []).length,
    projects:          (state.projects || []).length,
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
  ensureStateStructure();
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

  if (method === 'POST' && path === '/auth/quick-access') {
    const body = await readBody(req);
    const nationalId = normalizeNationalId(body.nationalId);
    const plate = String(body.plate || '').trim();
    if (!nationalId || !plate) return sendJson(res, 400, { error: 'رقم الهوية ورقم اللوحة مطلوبان' });

    const employee = findEmployeeByNationalId(nationalId);
    if (!employee) return sendJson(res, 403, { error: 'لا يوجد موظف مطابق في النظام' });

    const vehicle = findVehicleByPlate(plate);
    if (!vehicle) return sendJson(res, 403, { error: 'لا يوجد ملف مركبة مطابق' });

    const isLinked = employee.vehicleId === vehicle.id || String(vehicle.driver || '').trim() === String(employee.name || '').trim();
    if (!isLinked) {
      return sendJson(res, 403, { error: 'الدخول السريع متاح فقط لمستلم المركبة الحالي' });
    }

    const quickToken = jwt.sign(
      { role: 'quick', vehicleId: vehicle.id, employeeId: employee.id },
      JWT_SECRET,
      { expiresIn: '24h' },
    );
    addLog(`دخول سريع للمركبة ${vehicle.plate}`, employee.name || employee.id);

    return sendJson(res, 200, { token: quickToken });
  }

  if (method === 'POST' && path === '/auth/quick-logout') {
    return sendJson(res, 200, { ok: true });
  }

  if (path.startsWith('/quick-access/')) {
    return requireQuickAuth(req, res, async () => {
      const employee = (state.employees || []).find(e => e.id === req.quickEmployeeId);
      const vehicle = (state.vehicles || []).find(v => v.id === req.quickVehicleId);
      if (!employee || !vehicle) return sendJson(res, 404, { error: 'بيانات المركبة أو الموظف غير موجودة' });

      if (method === 'GET' && path === '/quick-access/vehicle-profile') {
        return sendJson(res, 200, {
          employee: { name: employee.name, nationalId: employee.nationalId },
          vehicle: buildQuickVehicleProfile(vehicle, employee),
        });
      }

      if (method === 'POST' && path === '/quick-access/monthly-appointment') {
        const body = await readBody(req);
        const appointment = {
          id: uid(),
          vehicleId: vehicle.id,
          type: 'موعد صيانة شهري',
          scheduledAt: body.scheduledAt || new Date().toISOString().slice(0, 10),
          notes: body.notes || '',
          status: 'pending',
          source: 'quick-access',
          createdByEmployeeId: employee.id,
          createdAt: nowIso(),
        };
        state.appointments.push(appointment);
        addLog(`حجز موعد صيانة شهري ${vehicle.plate}`, employee.name || employee.id);
        return sendJson(res, 201, appointment);
      }

      if (method === 'POST' && path === '/quick-access/attachments') {
        const body = await readBody(req);
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length === 0) return sendJson(res, 400, { error: 'يجب إرسال مرفق واحد على الأقل' });
        if (!Array.isArray(vehicle.quickAccessAttachments)) vehicle.quickAccessAttachments = [];
        if (!Array.isArray(vehicle.attachments)) vehicle.attachments = [];
        const accepted = files
          .filter(f => f && f.type && f.data)
          .map(f => ({
            id: uid(),
            type: String(f.type),
            name: String(f.name || `${f.type}.jpg`),
            data: f.data,
            uploadedBy: employee.id,
            uploadedAt: nowIso(),
          }));
        if (accepted.length === 0) return sendJson(res, 400, { error: 'لا توجد مرفقات بصيغة صحيحة' });
        vehicle.quickAccessAttachments.push(...accepted);
        vehicle.attachments.push(...accepted);
        addLog(`رفع ${accepted.length} مرفقات للمركبة ${vehicle.plate}`, employee.name || employee.id);
        return sendJson(res, 201, { uploaded: accepted.length });
      }

      if (method === 'GET' && path === '/quick-access/latest-maintenance') {
        return sendJson(res, 200, { latestMaintenance: latestMaintenanceForVehicle(vehicle.id) });
      }
    });
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

  {
    const pprofile = matchPath('/vehicles/:id/profile', path);
    if (pprofile && method === 'GET') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const vehicle = state.vehicles.find(v => v.id === pprofile.id);
      if (!vehicle) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
      const employee = (state.employees || []).find(e => e.vehicleId === vehicle.id) || null;
      const maintenance = (state.maintenance || []).filter(m => m.vehicleId === vehicle.id);
      const maintenanceCards = (state.maintenanceCards || []).filter(c => c.vehicleId === vehicle.id);
      const appointments = (state.appointments || []).filter(a => a.vehicleId === vehicle.id);
      const accidents = (state.accidents || []).filter(a => a.vehicleId === vehicle.id);
      const violations = (state.violations || []).filter(v => v.vehicleId === vehicle.id);
      const handovers = (state.handovers || []).filter(h => h.vehicleId === vehicle.id);
      return sendJson(res, 200, {
        vehicle,
        employee,
        maintenance,
        maintenanceCards,
        appointments,
        accidents,
        violations,
        handovers,
      });
    }
  }

  {
    const pmCards = matchPath('/vehicles/:id/maintenance-cards', path);
    if (pmCards && method === 'GET') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const vehicle = state.vehicles.find(v => v.id === pmCards.id);
      if (!vehicle) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
      return sendJson(res, 200, (state.maintenanceCards || []).filter(c => c.vehicleId === vehicle.id));
    }
    if (pmCards && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor', 'operator'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const vehicle = state.vehicles.find(v => v.id === pmCards.id);
      if (!vehicle) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
      const body = await readBody(req);
      if (!String(body.maintenanceType || '').trim()) return sendJson(res, 400, { error: 'maintenanceType مطلوب' });
      const card = {
        id: uid(),
        vehicleId: vehicle.id,
        plate: vehicle.plate || '',
        driverName: body.driverName || vehicle.driver || '',
        date: body.date || new Date().toISOString().slice(0, 10),
        maintenanceType: String(body.maintenanceType || '').trim(),
        details: body.details || '',
        amount: Number(body.amount) || 0,
        workshop: body.workshop || '',
        status: body.status || 'مكتمل',
        notes: body.notes || '',
        createdAt: nowIso(),
      };
      state.maintenanceCards.push(card);
      return sendJson(res, 201, card);
    }
  }

  {
    const pmCard = matchPath('/vehicles/:id/maintenance-cards/:cardId', path);
    if (pmCard && method === 'PUT') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor', 'operator'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const vehicle = state.vehicles.find(v => v.id === pmCard.id);
      if (!vehicle) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
      const card = (state.maintenanceCards || []).find(c => c.id === pmCard.cardId && c.vehicleId === vehicle.id);
      if (!card) return sendJson(res, 404, { error: 'كرت الصيانة غير موجود' });
      const body = await readBody(req);
      Object.assign(card, pickAllowedFields(body, ['driverName', 'date', 'maintenanceType', 'details', 'amount', 'workshop', 'status', 'notes']));
      card.plate = vehicle.plate || card.plate || '';
      if (!String(card.maintenanceType || '').trim()) return sendJson(res, 400, { error: 'maintenanceType مطلوب' });
      card.amount = Number(card.amount) || 0;
      card.updatedAt = nowIso();
      return sendJson(res, 200, card);
    }
    if (pmCard && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const before = (state.maintenanceCards || []).length;
      state.maintenanceCards = (state.maintenanceCards || []).filter(c => !(c.id === pmCard.cardId && c.vehicleId === pmCard.id));
      if (state.maintenanceCards.length === before) return sendJson(res, 404, { error: 'كرت الصيانة غير موجود' });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'POST' && path === '/vehicles') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin','supervisor','operator'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    if (!body.name || !body.plate) return sendJson(res, 400, { error: 'اسم المركبة ورقم اللوحة مطلوبان' });
    if (!isVehiclePlateUnique(body.plate)) return sendJson(res, 409, { error: 'رقم اللوحة مسجل مسبقاً' });
    if (body.projectId && !isProjectInCity(body.projectId, body.cityId || null)) {
      return sendJson(res, 400, { error: 'المشروع المحدد غير مرتبط بالمدينة المحددة' });
    }
    const city = (state.cities || []).find(c => c.id === body.cityId) || null;
    const v = {
      id: uid(),
      name: body.name,
      plate: String(body.plate).trim(),
      plateNormalized: normalizePlate(body.plate),
      city: city?.name || body.city || '',
      cityId: body.cityId || null,
      projectId: body.projectId || null,
      driver: body.driver || '',
      driverId: body.driverId || null,
      status: 'active',
      location: city?.name || body.city || '',
      lat: null,
      lng: null,
      insurance: body.insurance || { company: '', policyNo: '', expiry: '', status: 'غير محدد' },
      inspection: body.inspection || { status: 'غير محدد', expiry: '', center: '' },
      notes: body.notes || '',
      driverNotes: body.driverNotes || '',
      quickAccessAttachments: [],
    };
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
      if (body.plate && !isVehiclePlateUnique(body.plate, v.id)) return sendJson(res, 409, { error: 'رقم اللوحة مستخدم مسبقاً' });
      const nextCityId = body.cityId || v.cityId || null;
      const nextProjectId = body.projectId || v.projectId || null;
      if (nextProjectId && !isProjectInCity(nextProjectId, nextCityId)) {
        return sendJson(res, 400, { error: 'المشروع المحدد غير مرتبط بالمدينة المحددة' });
      }
      const updates = pickAllowedFields(body, [
        'name', 'plate', 'city', 'driver', 'status', 'location',
        'lat', 'lng', 'gpsUpdatedAt', 'type', 'brand', 'model', 'year',
        'vin', 'color', 'odometer', 'fuelType', 'fuelLevel',
        'lastServiceAt', 'nextServiceAt', 'insurance', 'inspection', 'notes', 'driverNotes',
        'cityId', 'projectId', 'driverId',
      ]);
      if (updates.plate) updates.plateNormalized = normalizePlate(updates.plate);
      if (updates.cityId) {
        const city = (state.cities || []).find(c => c.id === updates.cityId);
        if (city) updates.city = city.name;
      }
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
    const nationalId = normalizeNationalId(body.nationalId);
    if (!nationalId) return sendJson(res, 400, { error: 'رقم الهوية مطلوب لمنع التكرار' });
    if (!isEmployeeUnique(nationalId)) return sendJson(res, 409, { error: 'رقم الهوية مسجل مسبقاً' });
    if (body.vehicleId && !state.vehicles.some(v => v.id === body.vehicleId)) {
      return sendJson(res, 400, { error: 'المركبة المرتبطة غير موجودة' });
    }
    const targetVehicle = body.vehicleId ? state.vehicles.find(v => v.id === body.vehicleId) : null;
    const cityId = body.cityId || targetVehicle?.cityId || null;
    const projectId = body.projectId || targetVehicle?.projectId || null;
    if (projectId && !isProjectInCity(projectId, cityId)) {
      return sendJson(res, 400, { error: 'المشروع المحدد غير مرتبط بالمدينة المحددة' });
    }
    const emp = {
      id: uid(),
      ...body,
      nationalId,
      cityId,
      projectId,
      status: body.status || 'active',
      createdAt: nowIso(),
    };
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
      if (method === 'GET') {
        const vehicle = emp.vehicleId ? state.vehicles.find(v => v.id === emp.vehicleId) || null : null;
        const handovers = (state.handovers || []).filter(h => h.employeeId === emp.id || h.employeeName === emp.name);
        const violations = (state.violations || []).filter(v => v.employeeId === emp.id);
        const accidents = (state.accidents || []).filter(a => a.employeeId === emp.id);
        return sendJson(res, 200, { employee: emp, vehicle, handovers, violations, accidents });
      }
      if (method === 'PUT') {
        if (!['admin','supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
        const body = await readBody(req);
        const normalizedNationalId = body.nationalId !== undefined ? normalizeNationalId(body.nationalId) : emp.nationalId;
        if (!isEmployeeUnique(normalizedNationalId, emp.id)) {
          return sendJson(res, 409, { error: 'رقم الهوية مسجل مسبقاً لموظف آخر' });
        }
        if (body.vehicleId && !state.vehicles.some(v => v.id === body.vehicleId)) {
          return sendJson(res, 400, { error: 'المركبة المرتبطة غير موجودة' });
        }
        const updates = pickAllowedFields(body, [
          'name', 'phone', 'email', 'status', 'department', 'jobTitle',
          'position', 'vehicleId', 'licenseNo', 'nationalId', 'iqamaNo',
          'hireDate', 'notes', 'cityId', 'projectId',
        ]);
        if (updates.nationalId !== undefined) updates.nationalId = normalizedNationalId;
        const nextVehicle = (updates.vehicleId || emp.vehicleId) ? state.vehicles.find(v => v.id === (updates.vehicleId || emp.vehicleId)) : null;
        const nextCityId = updates.cityId || nextVehicle?.cityId || emp.cityId || null;
        const nextProjectId = updates.projectId || nextVehicle?.projectId || emp.projectId || null;
        if (nextProjectId && !isProjectInCity(nextProjectId, nextCityId)) {
          return sendJson(res, 400, { error: 'المشروع المحدد غير مرتبط بالمدينة المحددة' });
        }
        if (updates.cityId === undefined && nextCityId) updates.cityId = nextCityId;
        if (updates.projectId === undefined && nextProjectId) updates.projectId = nextProjectId;
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

  // ── CITIES ────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/cities') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.cities || []);
  }

  if (method === 'POST' && path === '/cities') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'اسم المدينة مطلوب' });
    if ((state.cities || []).some(c => String(c.name || '').trim().toLowerCase() === name.toLowerCase())) {
      return sendJson(res, 409, { error: 'المدينة موجودة مسبقاً' });
    }
    const city = { id: uid(), name, createdAt: nowIso() };
    state.cities.push(city);
    addLog(`إضافة مدينة ${city.name}`, cu.username);
    return sendJson(res, 201, city);
  }

  {
    const pmCity = matchPath('/cities/:id', path);
    if (pmCity && method === 'PUT') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const city = (state.cities || []).find(c => c.id === pmCity.id);
      if (!city) return sendJson(res, 404, { error: 'المدينة غير موجودة' });
      const body = await readBody(req);
      const nextName = String(body.name || '').trim();
      if (!nextName) return sendJson(res, 400, { error: 'اسم المدينة مطلوب' });
      city.name = nextName;
      return sendJson(res, 200, city);
    }
    if (pmCity && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const city = (state.cities || []).find(c => c.id === pmCity.id);
      if (!city) return sendJson(res, 404, { error: 'المدينة غير موجودة' });
      state.cities = (state.cities || []).filter(c => c.id !== pmCity.id);
      state.projects = (state.projects || []).filter(p => p.cityId !== pmCity.id);
      for (const vehicle of (state.vehicles || [])) {
        if (vehicle.cityId === pmCity.id) vehicle.cityId = null;
      }
      for (const emp of (state.employees || [])) {
        if (emp.cityId === pmCity.id) emp.cityId = null;
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── PROJECTS ──────────────────────────────────────────────────────
  if (method === 'GET' && path === '/projects') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.projects || []);
  }

  if (method === 'POST' && path === '/projects') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name || !body.cityId) return sendJson(res, 400, { error: 'اسم المشروع والمدينة مطلوبان' });
    if (!(state.cities || []).some(c => c.id === body.cityId)) return sendJson(res, 400, { error: 'المدينة غير موجودة' });
    if ((state.projects || []).some(p => String(p.name || '').trim().toLowerCase() === name.toLowerCase() && p.cityId === body.cityId)) {
      return sendJson(res, 409, { error: 'المشروع موجود مسبقاً داخل نفس المدينة' });
    }
    const project = { id: uid(), name, cityId: body.cityId, createdAt: nowIso() };
    state.projects.push(project);
    addLog(`إضافة مشروع ${project.name}`, cu.username);
    return sendJson(res, 201, project);
  }

  {
    const pmProject = matchPath('/projects/:id', path);
    if (pmProject && method === 'PUT') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const project = (state.projects || []).find(p => p.id === pmProject.id);
      if (!project) return sendJson(res, 404, { error: 'المشروع غير موجود' });
      const body = await readBody(req);
      if (body.cityId && !(state.cities || []).some(c => c.id === body.cityId)) return sendJson(res, 400, { error: 'المدينة غير موجودة' });
      if (body.name) project.name = String(body.name).trim();
      if (body.cityId) project.cityId = body.cityId;
      return sendJson(res, 200, project);
    }
    if (pmProject && method === 'DELETE') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
      const project = (state.projects || []).find(p => p.id === pmProject.id);
      if (!project) return sendJson(res, 404, { error: 'المشروع غير موجود' });
      state.projects = (state.projects || []).filter(p => p.id !== pmProject.id);
      for (const vehicle of (state.vehicles || [])) {
        if (vehicle.projectId === pmProject.id) vehicle.projectId = null;
      }
      for (const emp of (state.employees || [])) {
        if (emp.projectId === pmProject.id) emp.projectId = null;
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  {
    const pfleet = matchPath('/projects/:id/fleet', path);
    if (pfleet && method === 'GET') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const project = (state.projects || []).find(p => p.id === pfleet.id);
      if (!project) return sendJson(res, 404, { error: 'المشروع غير موجود' });
      const city = (state.cities || []).find(c => c.id === project.cityId) || null;
      const vehicles = (state.vehicles || [])
        .filter(v => v.projectId === project.id)
        .map(v => {
          const assignedEmployee = (state.employees || []).find(e => e.vehicleId === v.id) || null;
          return {
            id: v.id,
            plate: v.plate,
            name: v.name,
            status: v.status,
            cityId: v.cityId,
            projectId: v.projectId,
            assignedUser: assignedEmployee ? {
              id: assignedEmployee.id,
              name: assignedEmployee.name,
              nationalId: assignedEmployee.nationalId,
            } : null,
          };
        });
      return sendJson(res, 200, { project, city, vehicles });
    }
  }

  // ── TRANSFERS ─────────────────────────────────────────────────────
  if (method === 'POST' && path === '/transfers/vehicle') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    const vehicle = (state.vehicles || []).find(v => v.id === body.vehicleId);
    if (!vehicle) return sendJson(res, 404, { error: 'المركبة غير موجودة' });
    const nextCityId = body.toCityId || vehicle.cityId;
    const nextProjectId = body.toProjectId || vehicle.projectId;
    if (nextCityId && !(state.cities || []).some(c => c.id === nextCityId)) return sendJson(res, 400, { error: 'المدينة غير موجودة' });
    if (nextProjectId && !isProjectInCity(nextProjectId, nextCityId)) return sendJson(res, 400, { error: 'المشروع غير مرتبط بالمدينة الجديدة' });
    vehicle.cityId = nextCityId || null;
    vehicle.projectId = nextProjectId || null;
    const city = (state.cities || []).find(c => c.id === vehicle.cityId);
    if (city) {
      vehicle.city = city.name;
      vehicle.location = city.name;
    }
    for (const emp of (state.employees || []).filter(e => e.vehicleId === vehicle.id)) {
      emp.cityId = vehicle.cityId;
      emp.projectId = vehicle.projectId;
    }
    addLog(`نقل مركبة ${vehicle.plate}`, cu.username);
    return sendJson(res, 200, vehicle);
  }

  if (method === 'POST' && path === '/transfers/employee') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    if (!['admin', 'supervisor'].includes(cu.role)) return sendJson(res, 403, { error: 'صلاحيات غير كافية' });
    const body = await readBody(req);
    const employee = (state.employees || []).find(e => e.id === body.employeeId);
    if (!employee) return sendJson(res, 404, { error: 'الموظف غير موجود' });
    const nextCityId = body.toCityId || employee.cityId;
    const nextProjectId = body.toProjectId || employee.projectId;
    if (nextCityId && !(state.cities || []).some(c => c.id === nextCityId)) return sendJson(res, 400, { error: 'المدينة غير موجودة' });
    if (nextProjectId && !isProjectInCity(nextProjectId, nextCityId)) return sendJson(res, 400, { error: 'المشروع غير مرتبط بالمدينة الجديدة' });
    employee.cityId = nextCityId || null;
    employee.projectId = nextProjectId || null;
    addLog(`نقل موظف ${employee.name}`, cu.username);
    return sendJson(res, 200, employee);
  }

  // ── APPROVED FORMS ────────────────────────────────────────────────
  if (method === 'GET' && path === '/forms/approved') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    return sendJson(res, 200, state.formsApproved || []);
  }

  if (method === 'POST' && path === '/forms/approved') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const body = await readBody(req);
    const title = String(body.title || '').trim();
    if (!title) return sendJson(res, 400, { error: 'عنوان النموذج مطلوب' });
    const form = {
      id: uid(),
      title,
      type: body.type || 'delivery_receipt',
      status: body.status || 'approved',
      employeeId: body.employeeId || null,
      vehicleId: body.vehicleId || null,
      payload: body.payload || {},
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      createdBy: cu.username,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (form.employeeId) {
      const emp = (state.employees || []).find(e => e.id === form.employeeId);
      if (!emp) return sendJson(res, 400, { error: 'الموظف المحدد غير موجود' });
    }
    if (form.vehicleId) {
      const veh = (state.vehicles || []).find(v => v.id === form.vehicleId);
      if (!veh) return sendJson(res, 400, { error: 'المركبة المحددة غير موجودة' });
    }
    state.formsApproved.push(form);
    addLog(`إضافة نموذج معتمد ${form.title}`, cu.username);
    return sendJson(res, 201, form);
  }

  {
    const pform = matchPath('/forms/approved/:id/work', path);
    if (pform && method === 'POST') {
      const cu = currentUser(req);
      if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
      const form = (state.formsApproved || []).find(f => f.id === pform.id);
      if (!form) return sendJson(res, 404, { error: 'النموذج غير موجود' });
      const body = await readBody(req);
      form.payload = { ...(form.payload || {}), ...(body.payload || {}) };
      if (Array.isArray(body.attachments) && body.attachments.length) {
        form.attachments = [...(form.attachments || []), ...body.attachments];
      }
      form.updatedAt = nowIso();
      form.lastWorkedBy = cu.username;
      return sendJson(res, 200, form);
    }
  }

  if (method === 'GET' && path === '/forms/autofill') {
    const cu = currentUser(req);
    if (!cu) return sendJson(res, 401, { error: 'غير مصرح' });
    const employeeId = url.searchParams.get('employeeId') || '';
    const vehicleId = url.searchParams.get('vehicleId') || '';
    const employee = employeeId ? (state.employees || []).find(e => e.id === employeeId) || null : null;
    const vehicle = vehicleId ? (state.vehicles || []).find(v => v.id === vehicleId) || null : null;
    let resolvedVehicle = vehicle;
    if (!resolvedVehicle && employee?.vehicleId) {
      resolvedVehicle = (state.vehicles || []).find(v => v.id === employee.vehicleId) || null;
    }
    let resolvedEmployee = employee;
    if (!resolvedEmployee && resolvedVehicle) {
      resolvedEmployee = (state.employees || []).find(e => e.vehicleId === resolvedVehicle.id) || null;
    }
    return sendJson(res, 200, {
      employee: resolvedEmployee ? {
        id: resolvedEmployee.id,
        name: resolvedEmployee.name,
        nationalId: resolvedEmployee.nationalId,
        phone: resolvedEmployee.phone || '',
        department: resolvedEmployee.department || '',
      } : null,
      vehicle: resolvedVehicle ? {
        id: resolvedVehicle.id,
        name: resolvedVehicle.name,
        plate: resolvedVehicle.plate,
        status: resolvedVehicle.status,
        cityId: resolvedVehicle.cityId || null,
        projectId: resolvedVehicle.projectId || null,
      } : null,
    });
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
