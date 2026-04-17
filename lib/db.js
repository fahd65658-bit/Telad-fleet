'use strict';
/**
 * TELAD FLEET – Persistent In-Memory Store with JSON file backend
 * Provides SQLite-like query interface with automatic file persistence.
 * Upgrade path: swap readStore/writeStore with actual SQLite when needed.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const DATA_FILE = path.join(DATA_DIR, 'fleet.json');
const TMP_FILE  = path.join(DATA_DIR, 'fleet.json.tmp');

const persistenceState = {
  loadedFromDisk: false,
  loadedAt: null,
  lastFlushAt: null,
  lastFlushError: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath = DATA_DIR) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ── Seed data ──────────────────────────────────────────────────────────────
function buildSeed() {
  const now = nowIso();
  return {
    users: [
      { id: 'u1', name: 'مدير النظام',   username: 'admin',       email: 'admin@fna.sa',      passwordHash: '$2a$10$YourHashHere', role: 'admin',      active: true, createdAt: now },
      { id: 'u2', name: 'أحمد المشرف',   username: 'supervisor1', email: 'sup@fna.sa',         passwordHash: '$2a$10$YourHashHere', role: 'supervisor', active: true, createdAt: now },
      { id: 'u3', name: 'سالم المشغّل',  username: 'operator1',   email: 'op@fna.sa',          passwordHash: '$2a$10$YourHashHere', role: 'operator',   active: true, createdAt: now },
    ],
    vehicles: [
      { id: 'v1', name: 'تويوتا لاندكروزر', plate: 'أ ب ج 1234', city: 'الرياض',   driverId: 'd1', driver: 'أحمد سالم',  status: 'active',      location: 'الرياض',   lat: 24.7136, lng: 46.6753, km: 45200, fuelLevel: 78, year: 2022, color: 'أبيض', brand: 'Toyota', model: 'Land Cruiser',
        insurance: { company: 'الراجحي تكافل',   policyNo: 'INS-001', expiry: '2026-12-01', status: 'active' },
        inspection: { status: 'ساري',  expiry: '2026-08-15', center: 'مركز فحص الرياض' },
        documents: [], createdAt: now },
      { id: 'v2', name: 'فورد F-150',        plate: 'د هـ و 5678', city: 'جدة',     driverId: 'd2', driver: 'سارة علي',   status: 'charging',    location: 'جدة',      lat: 21.4858, lng: 39.1925, km: 31500, fuelLevel: 45, year: 2023, color: 'أسود', brand: 'Ford',   model: 'F-150',
        insurance: { company: 'التعاونية للتأمين', policyNo: 'INS-002', expiry: '2026-09-20', status: 'active' },
        inspection: { status: 'ساري',  expiry: '2026-11-01', center: 'مركز فحص جدة' },
        documents: [], createdAt: now },
      { id: 'v3', name: 'شيفروليه سيلفرادو', plate: 'ز ح ط 9012', city: 'الدمام',  driverId: 'd3', driver: 'خالد حسن',   status: 'maintenance', location: 'الدمام',   lat: 26.4207, lng: 50.0888, km: 62100, fuelLevel: 20, year: 2021, color: 'رمادي', brand: 'Chevrolet', model: 'Silverado',
        insurance: { company: 'ملاذ للتأمين',    policyNo: 'INS-003', expiry: '2026-07-10', status: 'expiring' },
        inspection: { status: 'منتهي', expiry: '2026-03-01', center: 'مركز فحص الدمام' },
        documents: [], createdAt: now },
      { id: 'v4', name: 'تويوتا هايلوكس',   plate: 'ي ك ل 3456', city: 'المدينة', driverId: 'd4', driver: 'منى فهد',    status: 'active',      location: 'المدينة',  lat: 24.5247, lng: 39.5692, km: 28900, fuelLevel: 92, year: 2023, color: 'أبيض', brand: 'Toyota', model: 'Hilux',
        insurance: { company: 'بوبا العربية',    policyNo: 'INS-004', expiry: '2027-01-15', status: 'active' },
        inspection: { status: 'ساري',  expiry: '2026-12-20', center: 'مركز فحص المدينة' },
        documents: [], createdAt: now },
      { id: 'v5', name: 'نيسان باترول',      plate: 'م ن س 7890', city: 'مكة',     driverId: 'd5', driver: 'علي ناصر',   status: 'active',      location: 'مكة',      lat: 21.3891, lng: 39.8579, km: 19400, fuelLevel: 65, year: 2024, color: 'أزرق', brand: 'Nissan', model: 'Patrol',
        insurance: { company: 'الراجحي تكافل',   policyNo: 'INS-005', expiry: '2027-03-01', status: 'active' },
        inspection: { status: 'ساري',  expiry: '2027-01-10', center: 'مركز فحص مكة' },
        documents: [], createdAt: now },
      { id: 'v6', name: 'مرسيدس سبرينتر',   plate: 'ع غ ف 1122', city: 'أبها',    driverId: 'd6', driver: 'هند راشد',   status: 'charging',    location: 'أبها',     lat: 18.2164, lng: 42.5053, km: 54300, fuelLevel: 30, year: 2022, color: 'أبيض', brand: 'Mercedes', model: 'Sprinter',
        insurance: { company: 'بوبا العربية',    policyNo: 'INS-006', expiry: '2026-06-30', status: 'expiring' },
        inspection: { status: 'ساري',  expiry: '2026-09-05', center: 'مركز فحص أبها' },
        documents: [], createdAt: now },
      { id: 'v7', name: 'كيا سورينتو',       plate: 'ق ر س 3311', city: 'تبوك',    driverId: null, driver: 'فيصل عمر',   status: 'active',      location: 'تبوك',     lat: 28.3835, lng: 36.5662, km: 12700, fuelLevel: 88, year: 2024, color: 'أحمر', brand: 'Kia',    model: 'Sorento',
        insurance: { company: 'التعاونية للتأمين', policyNo: 'INS-007', expiry: '2027-02-20', status: 'active' },
        inspection: { status: 'ساري',  expiry: '2027-01-01', center: 'مركز فحص تبوك' },
        documents: [], createdAt: now },
      { id: 'v8', name: 'هيوندا توسون',      plate: 'ت ث ج 7744', city: 'القصيم',  driverId: null, driver: 'نورة سعد',   status: 'active',      location: 'القصيم',   lat: 26.3260, lng: 43.9750, km: 8900,  fuelLevel: 71, year: 2025, color: 'أخضر', brand: 'Hyundai', model: 'Tucson',
        insurance: { company: 'ملاذ للتأمين',    policyNo: 'INS-008', expiry: '2027-04-01', status: 'active' },
        inspection: { status: 'ساري',  expiry: '2027-03-15', center: 'مركز فحص القصيم' },
        documents: [], createdAt: now },
    ],
    drivers: [
      { id: 'd1', name: 'أحمد سالم',   phone: '0501234567', licenseNo: 'SA-101', licenseExpiry: '2027-06-01', nationalId: '1012345678', status: 'active', vehicleId: 'v1', createdAt: now },
      { id: 'd2', name: 'سارة علي',    phone: '0509876543', licenseNo: 'SA-102', licenseExpiry: '2026-12-31', nationalId: '1098765432', status: 'active', vehicleId: 'v2', createdAt: now },
      { id: 'd3', name: 'خالد حسن',   phone: '0505551234', licenseNo: 'SA-103', licenseExpiry: '2028-03-15', nationalId: '1056781234', status: 'active', vehicleId: 'v3', createdAt: now },
      { id: 'd4', name: 'منى فهد',    phone: '0502223344', licenseNo: 'SA-104', licenseExpiry: '2027-09-20', nationalId: '1023344556', status: 'active', vehicleId: 'v4', createdAt: now },
      { id: 'd5', name: 'علي ناصر',   phone: '0507778899', licenseNo: 'SA-105', licenseExpiry: '2026-08-10', nationalId: '1077889900', status: 'active', vehicleId: 'v5', createdAt: now },
      { id: 'd6', name: 'هند راشد',   phone: '0503334455', licenseNo: 'SA-106', licenseExpiry: '2027-04-30', nationalId: '1033445566', status: 'active', vehicleId: 'v6', createdAt: now },
    ],
    maintenance: [
      { id: 'm1', vehicleId: 'v3', type: 'تغيير زيت',    description: 'تغيير زيت المحرك الدوري', scheduledDate: '2026-04-20', cost: 350,  status: 'pending',   createdAt: now },
      { id: 'm2', vehicleId: 'v1', type: 'فحص إطارات',  description: 'ضخ وفحص الإطارات الأربع',  scheduledDate: '2026-04-22', cost: 200,  status: 'pending',   createdAt: now },
      { id: 'm3', vehicleId: 'v6', type: 'تبديل فلتر',  description: 'فلتر هواء وفلتر وقود',      scheduledDate: '2026-03-10', cost: 180,  status: 'completed', completedAt: '2026-03-10', createdAt: now },
      { id: 'm4', vehicleId: 'v2', type: 'صيانة شاملة', description: 'فحص كامل للمركبة',          scheduledDate: '2026-04-28', cost: 1200, status: 'pending',   createdAt: now },
    ],
    appointments: [
      { id: 'a1', vehicleId: 'v1', type: 'فحص دوري حكومي', scheduledAt: '2026-04-25T09:00', notes: 'تجديد استمارة المرور', status: 'pending',   createdAt: now },
      { id: 'a2', vehicleId: 'v2', type: 'صيانة دورية',    scheduledAt: '2026-04-28T11:00', notes: '',                     status: 'confirmed', createdAt: now },
      { id: 'a3', vehicleId: 'v5', type: 'تجديد رخصة',    scheduledAt: '2026-05-05T10:00', notes: 'إحضار الوثائق الأصلية', status: 'pending',   createdAt: now },
    ],
    regions: [
      { id: 'r1', name: 'منطقة الرياض',     description: 'العاصمة والمناطق المحيطة',      createdAt: now },
      { id: 'r2', name: 'منطقة جدة',        description: 'ميناء جدة والمناطق الغربية',   createdAt: now },
      { id: 'r3', name: 'المنطقة الشرقية',  description: 'الدمام والخبر والظهران',       createdAt: now },
      { id: 'r4', name: 'منطقة مكة',       description: 'مكة المكرمة والطائف وجدة',     createdAt: now },
      { id: 'r5', name: 'منطقة المدينة',   description: 'المدينة المنورة والمناطق المحيطة', createdAt: now },
    ],
    accidents: [],
    violations: [],
    financial: [
      { id: 'f1', type: 'fuel',        amount: 4250,  description: 'وقود الأسطول - مارس 2026',        vehicleId: null, date: '2026-03-31', receiptNo: 'REC-001', createdAt: now },
      { id: 'f2', type: 'maintenance', amount: 2100,  description: 'صيانة شاملة - تويوتا لاندكروزر', vehicleId: 'v1', date: '2026-03-15', receiptNo: 'REC-002', createdAt: now },
      { id: 'f3', type: 'salary',      amount: 18500, description: 'رواتب السائقين - مارس 2026',      vehicleId: null, date: '2026-03-31', receiptNo: 'REC-003', createdAt: now },
      { id: 'f4', type: 'fuel',        amount: 3800,  description: 'وقود الأسطول - أبريل 2026',       vehicleId: null, date: '2026-04-15', receiptNo: 'REC-004', createdAt: now },
    ],
    reports: [],
    devRequests: [],
    handovers: [
      { id: 'h1', vehicleId: 'v1', type: 'تسليم', employeeId: 'e1', employeeName: 'أحمد سالم', date: now, km: 45000, fuelLevel: 80, condition: 'جيد', notes: 'لا ملاحظات', aiReport: 'لم يتم اكتشاف أضرار جديدة', images: [], signedBy: 'أحمد سالم', createdAt: now },
      { id: 'h2', vehicleId: 'v1', type: 'استلام', employeeId: 'e1', employeeName: 'أحمد سالم', date: now, km: 45200, fuelLevel: 78, condition: 'جيد', notes: '', aiReport: 'لم يتم اكتشاف أضرار جديدة', images: [], signedBy: 'أحمد سالم', createdAt: now },
    ],
    employees: [
      { id: 'e1', name: 'أحمد سالم',  nationalId: '1012345678', phone: '0501234567', department: 'العمليات',     jobTitle: 'سائق',          email: 'ahmed@fna.sa',  status: 'active', vehicleId: 'v1', createdAt: now },
      { id: 'e2', name: 'سارة علي',   nationalId: '1098765432', phone: '0509876543', department: 'اللوجستيات',   jobTitle: 'سائقة',         email: 'sara@fna.sa',   status: 'active', vehicleId: 'v2', createdAt: now },
      { id: 'e3', name: 'خالد حسن',  nationalId: '1056781234', phone: '0505551234', department: 'الصيانة',      jobTitle: 'فني',           email: 'khalid@fna.sa', status: 'active', vehicleId: 'v3', createdAt: now },
      { id: 'e4', name: 'منى فهد',   nationalId: '1023344556', phone: '0502223344', department: 'العمليات',     jobTitle: 'سائقة',         email: 'mona@fna.sa',   status: 'active', vehicleId: 'v4', createdAt: now },
      { id: 'e5', name: 'علي ناصر',  nationalId: '1077889900', phone: '0507778899', department: 'الإدارة',      jobTitle: 'مشرف عمليات',  email: 'ali@fna.sa',    status: 'active', vehicleId: 'v5', createdAt: now },
      { id: 'e6', name: 'هند راشد',  nationalId: '1033445566', phone: '0503334455', department: 'اللوجستيات',   jobTitle: 'سائقة',         email: 'hind@fna.sa',   status: 'active', vehicleId: 'v6', createdAt: now },
    ],
    alerts: [
      { id: 'al1', message: 'المركبة TLD-204 بحاجة إلى فحص دوري خلال 24 ساعة.',     type: 'warning', createdAt: now },
      { id: 'al2', message: 'تم اكتمال صيانة المركبة مرسيدس سبرينتر بنجاح.',        type: 'success', createdAt: now },
      { id: 'al3', message: 'تنبيه: مستوى الوقود في شيفروليه سيلفرادو منخفض (20%).', type: 'danger',  createdAt: now },
      { id: 'al4', message: 'موعد تجديد رخصة المركبة نيسان باترول خلال 30 يوماً.',   type: 'warning', createdAt: now },
    ],
    logs: [
      { id: 'l1', action: 'تهيئة النظام وتحميل البيانات', user: 'system', ip: '127.0.0.1', time: now },
    ],
    gpsHistory: {},
  };
}

// ── Read / Write ───────────────────────────────────────────────────────────
let _cache = null;
let _dirty  = false;
let _saveTimer = null;

function readStore() {
  if (_cache) return _cache;
  ensureDir();
  if (fs.existsSync(DATA_FILE)) {
    try {
      _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      persistenceState.loadedFromDisk = true;
      persistenceState.loadedAt = nowIso();
      // Ensure all collections exist (backward compat)
      const seed = buildSeed();
      for (const key of Object.keys(seed)) {
        if (!(_cache[key])) _cache[key] = seed[key];
      }
      // Migrate: add insurance/inspection to old vehicles if missing
      for (const v of (_cache.vehicles || [])) {
        if (!v.insurance) v.insurance = { company: '', policyNo: '', expiry: '', status: 'unknown' };
        if (!v.inspection) v.inspection = { status: 'غير محدد', expiry: '', center: '' };
        if (!v.documents) v.documents = [];
      }
      return _cache;
    } catch { /* corrupt – regenerate */ }
  }
  _cache = buildSeed();
  persistenceState.loadedFromDisk = false;
  persistenceState.loadedAt = nowIso();
  writeStore(true);
  return _cache;
}

function writeStore(immediate = false) {
  _dirty = true;
  if (immediate) {
    _flush();
  } else {
    // Debounce: batch writes every 2 s
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_flush, 2000);
  }
}

function _flush() {
  if (!_dirty || !_cache) return;
  try {
    ensureDir();
    fs.writeFileSync(TMP_FILE, JSON.stringify(_cache, null, 2), 'utf8');
    fs.renameSync(TMP_FILE, DATA_FILE);
    _dirty = false;
    persistenceState.lastFlushAt = nowIso();
    persistenceState.lastFlushError = null;
  } catch (e) {
    persistenceState.lastFlushError = e.message;
    console.error('[DB] Write error:', e.message);
  }
}

// Flush on process exit
process.on('exit', _flush);
process.on('SIGTERM', () => { _flush(); process.exit(0); });
process.on('SIGINT',  () => { _flush(); process.exit(0); });

// ── Public API ─────────────────────────────────────────────────────────────
const db = {
  uid,
  nowIso,
  writeStore,
  get store() { return readStore(); },
  getPersistenceStatus() {
    return {
      mode: 'json-file',
      dataDir: DATA_DIR,
      dataFile: DATA_FILE,
      exists: fs.existsSync(DATA_FILE),
      loadedFromDisk: persistenceState.loadedFromDisk,
      loadedAt: persistenceState.loadedAt,
      pendingWrite: _dirty,
      lastFlushAt: persistenceState.lastFlushAt,
      lastFlushError: persistenceState.lastFlushError,
    };
  },

  // Generic CRUD helpers
  find(col, predicate) {
    return (readStore()[col] || []).filter(predicate);
  },
  findOne(col, predicate) {
    return (readStore()[col] || []).find(predicate) || null;
  },
  insert(col, item) {
    if (!item.id) item.id = uid();
    if (!item.createdAt) item.createdAt = nowIso();
    readStore()[col].push(item);
    writeStore();
    return item;
  },
  update(col, id, patch) {
    const list = readStore()[col];
    const idx  = list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch, updatedAt: nowIso() };
    writeStore();
    return list[idx];
  },
  remove(col, id) {
    const store = readStore();
    const before = store[col].length;
    store[col] = store[col].filter(x => x.id !== id);
    if (store[col].length < before) writeStore();
    return store[col].length < before;
  },
  pushAlert(message, type = 'info') {
    const store = readStore();
    store.alerts.unshift({ id: uid(), message, type, createdAt: nowIso() });
    store.alerts = store.alerts.slice(0, 20);
    writeStore();
  },
  addLog(action, user = 'system', ip = '') {
    const store = readStore();
    store.logs.push({ id: uid(), action, user, ip, time: nowIso() });
    store.logs = store.logs.slice(-500);
    writeStore();
  },
  updateGPS(vehicleId, lat, lng) {
    const store = readStore();
    const v = store.vehicles.find(x => x.id === vehicleId);
    if (!v) return;
    v.lat = lat; v.lng = lng; v.lastGps = nowIso();
    if (!store.gpsHistory[vehicleId]) store.gpsHistory[vehicleId] = [];
    store.gpsHistory[vehicleId].push({ lat, lng, t: nowIso() });
    store.gpsHistory[vehicleId] = store.gpsHistory[vehicleId].slice(-100);
    writeStore();
  },
};

module.exports = db;
