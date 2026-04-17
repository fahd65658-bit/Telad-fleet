'use strict';
/**
 * TELAD FLEET – Production Express Server
 * Features: JWT Auth · bcrypt passwords · Socket.IO real-time GPS
 *           Helmet security · Rate limiting · Full REST API
 *           Automatic periodic data simulation · JSON persistence
 */

require('dotenv').config();
const http           = require('http');
const path           = require('path');
const express        = require('express');
const helmet         = require('helmet');
const cors           = require('cors');
const cookieParser   = require('cookie-parser');
const rateLimit      = require('express-rate-limit');
const jwt            = require('jsonwebtoken');
const bcrypt         = require('bcryptjs');
const { Server }     = require('socket.io');
const db             = require('./lib/db');
const authModule     = require('./lib/auth');
const gps            = require('./lib/gps');
const { analyzeVehicleDamage, formatReportText } = require('./lib/ai-vision');

// ── Config ─────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET     = process.env.JWT_SECRET || 'telad-fleet-super-secret-jwt-2024!';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const ADMIN_PASS     = process.env.ADMIN_PASSWORD || 'telad2024';
const DEPLOY_ID      = Date.now().toString();
const FRONTEND_DIR   = path.join(__dirname, 'frontend');

// ── bcrypt bootstrap ───────────────────────────────────────────────────────
async function ensurePasswords() {
  const store = db.store;
  for (const u of store.users) {
    if (!u.passwordHash || u.passwordHash.startsWith('$2a$10$YourHash')) {
      const raw = u.username === 'admin' ? ADMIN_PASS : (u.username + '2024');
      u.passwordHash = await bcrypt.hash(raw, 10);
    }
  }
  db.writeStore(true);
}

// ── Express app ────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true }));
app.use(express.json({ limit: '10mb' }));  // 10 MB for base64 vehicle photos
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use((_req, res, next) => { res.setHeader('X-Powered-By','TELAD-FLEET/3.1'); res.setHeader('X-Deploy-Id', DEPLOY_ID); next(); });

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15*60_000, max: 20, message: { error: 'محاولات كثيرة – حاول بعد 15 دقيقة' } }));

// ── JWT middleware ─────────────────────────────────────────────────────────
const ROLES = { admin: 4, supervisor: 3, operator: 2, viewer: 1 };

function auth(minRole = 'viewer') {
  return (req, res, next) => {
    const hdr   = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      if ((ROLES[req.user.role]||0) < (ROLES[minRole]||0))
        return res.status(403).json({ error: 'صلاحية غير كافية' });
      next();
    } catch { res.status(401).json({ error: 'جلسة منتهية – سجّل دخولك مجدداً' }); }
  };
}

// ── Request logger ─────────────────────────────────────────────────────────
app.use('/api/', (req, _res, next) => {
  db.addLog(`${req.method} ${req.path}`, req.user?.username || 'anon', req.ip);
  next();
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  const user = db.findOne('users', u => u.username === username);
  if (!user || !user.active) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const tokens = authModule.issueTokens(user);
  authModule.setRefreshCookie(res, tokens.refreshToken);
  db.addLog(`تسجيل دخول: ${username}`, username, req.ip);
  res.json({ token: tokens.accessToken, accessToken: tokens.accessToken, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

// ── Refresh Token endpoint ──
app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = authModule.getRefreshFromCookie(req) || req.body?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'لا يوجد Refresh Token' });
  try {
    const payload = authModule.verifyRefresh(refreshToken);
    const user = db.findOne('users', u => u.id === payload.id);
    if (!user || !user.active) return res.status(401).json({ error: 'المستخدم غير موجود أو غير نشط' });
    const tokens = authModule.issueTokens(user);
    authModule.setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken });
  } catch { res.status(401).json({ error: 'Refresh Token منتهي أو غير صالح' }); }
});

app.post('/api/auth/logout', auth(), (req, res) => {
  authModule.clearRefreshCookie(res);
  db.addLog(`تسجيل خروج: ${req.user.username}`, req.user.username, req.ip);
  res.json({ message: 'تم تسجيل الخروج' });
});

app.get('/api/auth/me', auth(), (req, res) => {
  const user = db.findOne('users', u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { passwordHash: _, ...safe } = user;
  res.json(safe);
});

app.get('/api/auth/users', auth('admin'), (_req, res) => {
  res.json(db.store.users.map(({ passwordHash: _, ...u }) => u));
});

app.post('/api/auth/users', auth('admin'), async (req, res) => {
  const { username, password, name, email, role } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'حقول مطلوبة ناقصة' });
  if (db.findOne('users', u => u.username === username)) return res.status(409).json({ error: 'اسم المستخدم موجود مسبقاً' });
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = db.insert('users', { username, passwordHash, name, email: email||'', role, active: true });
  const { passwordHash: _, ...safe } = newUser;
  res.status(201).json(safe);
});

app.put('/api/auth/users/:id', auth('admin'), async (req, res) => {
  const patch = { ...req.body };
  if (patch.password) { patch.passwordHash = await bcrypt.hash(patch.password, 10); delete patch.password; }
  const updated = db.update('users', req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { passwordHash: _, ...safe } = updated;
  res.json(safe);
});

app.delete('/api/auth/users/:id', auth('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الحالي' });
  const ok = db.remove('users', req.params.id);
  ok ? res.json({ message: 'تم الحذف' }) : res.status(404).json({ error: 'المستخدم غير موجود' });
});

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/dashboard', auth(), (_req, res) => {
  const s = db.store;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
  const today = new Date().toISOString().slice(0,10);
  res.json({
    vehicles:          s.vehicles.length,
    activeVehicles:    s.vehicles.filter(v=>v.status==='active').length,
    drivers:           s.drivers.length,
    employees:         s.employees.length,
    maintenance:       s.maintenance.filter(m=>m.status==='pending').length,
    appointments:      s.appointments.filter(a=>a.status==='pending').length,
    cities:            [...new Set(s.vehicles.map(v=>v.city))].length,
    projects:          3,
    regions:           s.regions.length,
    accidents:         s.accidents.filter(a=>a.status!=='closed').length,
    violationsUnpaid:  s.violations.filter(v=>v.status==='unpaid').length,
    financialMonth:    s.financial.filter(f=>f.date>=monthStart).reduce((a,f)=>a+Number(f.amount||0),0).toFixed(2),
    alerts:            s.alerts.length,
    handoversToday:    s.handovers.filter(h=>h.date&&h.date.slice(0,10)===today).length,
    insuranceExpiring: s.vehicles.filter(v=>v.insurance?.status==='expiring').length,
    inspectionExpired: s.vehicles.filter(v=>v.inspection?.status==='منتهي').length,
    efficiency:        Math.round(s.vehicles.filter(v=>v.status==='active').length/Math.max(s.vehicles.length,1)*100),
  });
});

// ══════════════════════════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/vehicles',             auth(), (_req, res) => res.json(db.store.vehicles));
app.get('/api/vehicles/:id',         auth(), (req, res) => { const v=db.findOne('vehicles',x=>x.id===req.params.id); v?res.json(v):res.status(404).json({error:'المركبة غير موجودة'}); });
app.post('/api/vehicles',            auth('operator'), (req, res) => { const v=db.insert('vehicles',{...req.body,status:req.body.status||'active'}); db.pushAlert(`تم إضافة مركبة: ${v.name}`,'success'); io.emit('vehicles:new',v); res.status(201).json(v); });
app.put('/api/vehicles/:id',         auth('operator'), (req, res) => { const v=db.update('vehicles',req.params.id,req.body); if(!v)return res.status(404).json({error:'المركبة غير موجودة'}); io.emit('vehicles:update',v); res.json(v); });
app.delete('/api/vehicles/:id',      auth('supervisor'), (req, res) => { const ok=db.remove('vehicles',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'المركبة غير موجودة'}); });
app.post('/api/vehicles/:id/gps',    auth('operator'), (req, res) => { const {lat,lng}=req.body; if(!lat||!lng)return res.status(400).json({error:'lat و lng مطلوبان'}); db.updateGPS(req.params.id,parseFloat(lat),parseFloat(lng)); const v=db.findOne('vehicles',x=>x.id===req.params.id); io.emit('gps:update',{vehicleId:req.params.id,lat:v.lat,lng:v.lng,t:db.nowIso()}); res.json({ok:true}); });
app.get('/api/vehicles/:id/gps/history', auth(), (req, res) => res.json(db.store.gpsHistory[req.params.id]||[]));

// ══════════════════════════════════════════════════════════════════════════
// DRIVERS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/drivers',        auth(), (_req, res) => res.json(db.store.drivers));
app.get('/api/drivers/:id',    auth(), (req, res) => { const d=db.findOne('drivers',x=>x.id===req.params.id); d?res.json(d):res.status(404).json({error:'السائق غير موجود'}); });
app.post('/api/drivers',       auth('operator'), (req, res) => { const d=db.insert('drivers',{...req.body,status:req.body.status||'active'}); db.pushAlert(`تم إضافة سائق: ${d.name}`,'success'); res.status(201).json(d); });
app.put('/api/drivers/:id',    auth('operator'), (req, res) => { const d=db.update('drivers',req.params.id,req.body); d?res.json(d):res.status(404).json({error:'السائق غير موجود'}); });
app.delete('/api/drivers/:id', auth('supervisor'), (req, res) => { const ok=db.remove('drivers',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'السائق غير موجود'}); });

// ══════════════════════════════════════════════════════════════════════════
// MAINTENANCE
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/maintenance',                 auth(), (_req, res) => res.json(db.store.maintenance));
app.post('/api/maintenance',                auth('operator'), (req, res) => { const m=db.insert('maintenance',{...req.body,status:'pending'}); db.pushAlert(`طلب صيانة: ${m.type}`,'info'); io.emit('maintenance:new',m); res.status(201).json(m); });
app.put('/api/maintenance/:id',             auth('operator'), (req, res) => { const m=db.update('maintenance',req.params.id,req.body); m?res.json(m):res.status(404).json({error:'السجل غير موجود'}); });
app.post('/api/maintenance/:id/complete',   auth('supervisor'), (req, res) => { const m=db.update('maintenance',req.params.id,{status:'completed',completedAt:db.nowIso()}); if(!m)return res.status(404).json({error:'السجل غير موجود'}); db.pushAlert(`اكتملت الصيانة: ${m.type}`,'success'); io.emit('maintenance:complete',m); res.json(m); });
app.delete('/api/maintenance/:id',          auth('supervisor'), (req, res) => { const ok=db.remove('maintenance',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'السجل غير موجود'}); });

// ══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/appointments',                  auth(), (_req, res) => res.json(db.store.appointments));
app.post('/api/appointments',                 auth('operator'), (req, res) => { const a=db.insert('appointments',{...req.body,status:'pending'}); io.emit('appointments:new',a); res.status(201).json(a); });
app.put('/api/appointments/:id',              auth('operator'), (req, res) => { const a=db.update('appointments',req.params.id,req.body); a?res.json(a):res.status(404).json({error:'الموعد غير موجود'}); });
app.post('/api/appointments/:id/confirm',     auth('supervisor'), (req, res) => { const a=db.update('appointments',req.params.id,{status:'confirmed'}); a?res.json(a):res.status(404).json({error:'الموعد غير موجود'}); });
app.post('/api/appointments/:id/cancel',      auth('supervisor'), (req, res) => { const a=db.update('appointments',req.params.id,{status:'cancelled'}); a?res.json(a):res.status(404).json({error:'الموعد غير موجود'}); });
app.delete('/api/appointments/:id',           auth('supervisor'), (req, res) => { const ok=db.remove('appointments',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'الموعد غير موجود'}); });

// ══════════════════════════════════════════════════════════════════════════
// REGIONS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/regions',        auth(), (_req, res) => res.json(db.store.regions));
app.post('/api/regions',       auth('supervisor'), (req, res) => { const r=db.insert('regions',req.body); res.status(201).json(r); });
app.put('/api/regions/:id',    auth('supervisor'), (req, res) => { const r=db.update('regions',req.params.id,req.body); r?res.json(r):res.status(404).json({error:'المنطقة غير موجودة'}); });
app.delete('/api/regions/:id', auth('admin'), (req, res) => { const ok=db.remove('regions',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'المنطقة غير موجودة'}); });

// ══════════════════════════════════════════════════════════════════════════
// ACCIDENTS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/accidents',        auth(), (_req, res) => res.json(db.store.accidents));
app.post('/api/accidents',       auth('operator'), (req, res) => { const a=db.insert('accidents',{...req.body,status:'open'}); db.pushAlert(`حادث جديد للمركبة: ${req.body.vehicleId}`,'danger'); res.status(201).json(a); });
app.put('/api/accidents/:id',    auth('supervisor'), (req, res) => { const a=db.update('accidents',req.params.id,req.body); a?res.json(a):res.status(404).json({error:'السجل غير موجود'}); });
app.delete('/api/accidents/:id', auth('admin'), (req, res) => { const ok=db.remove('accidents',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'السجل غير موجود'}); });

// ══════════════════════════════════════════════════════════════════════════
// VIOLATIONS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/violations',           auth(), (_req, res) => res.json(db.store.violations));
app.post('/api/violations',          auth('operator'), (req, res) => { const v=db.insert('violations',{...req.body,status:'unpaid'}); db.pushAlert(`مخالفة جديدة: ${v.type||''}`,'warning'); res.status(201).json(v); });
app.post('/api/violations/:id/pay',  auth('supervisor'), (req, res) => { const v=db.update('violations',req.params.id,{status:'paid',paidAt:db.nowIso()}); v?res.json(v):res.status(404).json({error:'المخالفة غير موجودة'}); });
app.delete('/api/violations/:id',    auth('admin'), (req, res) => { const ok=db.remove('violations',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'المخالفة غير موجودة'}); });

// ══════════════════════════════════════════════════════════════════════════
// FINANCIAL
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/financial',        auth(), (_req, res) => res.json(db.store.financial));
app.post('/api/financial',       auth('supervisor'), (req, res) => { const f=db.insert('financial',req.body); res.status(201).json(f); });
app.put('/api/financial/:id',    auth('supervisor'), (req, res) => { const f=db.update('financial',req.params.id,req.body); f?res.json(f):res.status(404).json({error:'السجل غير موجود'}); });
app.delete('/api/financial/:id', auth('admin'), (req, res) => { const ok=db.remove('financial',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'السجل غير موجود'}); });

// ══════════════════════════════════════════════════════════════════════════
// REPORTS & ANALYTICS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/reports', auth(), (_req, res) => res.json(db.store.reports));

app.post('/api/reports/generate', auth('supervisor'), (req, res) => {
  const { type='general', from, to } = req.body||{};
  const s = db.store;
  let data = {};
  if (type==='vehicles')    data={total:s.vehicles.length, byStatus:groupBy(s.vehicles,'status'), byCity:groupBy(s.vehicles,'city')};
  else if (type==='financial')  data={total:s.financial.reduce((a,f)=>a+Number(f.amount),0), byType:groupBy(s.financial,'type')};
  else if (type==='maintenance') data={total:s.maintenance.length, byStatus:groupBy(s.maintenance,'status'), totalCost:s.maintenance.reduce((a,m)=>a+Number(m.cost||0),0)};
  else data={vehicles:s.vehicles.length, drivers:s.drivers.length, maintenance:s.maintenance.length, alerts:s.alerts.length};
  const report = db.insert('reports', { type, from, to, data, generatedBy: req.user.username });
  res.status(201).json(report);
});

app.get('/api/reports/analytics', auth(), (_req, res) => {
  const s = db.store;
  res.json({
    vehiclesByStatus: groupBy(s.vehicles,'status'),
    vehiclesByCity:   groupBy(s.vehicles,'city'),
    maintenanceCosts: s.maintenance.reduce((a,m)=>a+Number(m.cost||0),0),
    financialByType:  groupBy(s.financial,'type'),
    totalExpenses:    s.financial.reduce((a,f)=>a+Number(f.amount||0),0),
    driversByStatus:  groupBy(s.drivers,'status'),
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ALERTS & LOGS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/alerts',          auth(), (_req, res) => res.json(db.store.alerts));
app.delete('/api/alerts/:id',   auth('operator'), (req, res) => { const ok=db.remove('alerts',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'التنبيه غير موجود'}); });
app.get('/api/logs',            auth('supervisor'), (_req, res) => res.json([...db.store.logs].reverse()));

// ══════════════════════════════════════════════════════════════════════════
// DEV REQUESTS
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/dev-requests',               auth(), (_req, res) => res.json(db.store.devRequests));
app.post('/api/dev-requests',              auth(), (req, res) => { const r=db.insert('devRequests',{...req.body,status:'pending',submittedBy:req.user.username}); res.status(201).json(r); });
app.put('/api/dev-requests/:id/status',    auth('admin'), (req, res) => { const r=db.update('devRequests',req.params.id,{status:req.body.status,resolvedAt:db.nowIso()}); r?res.json(r):res.status(404).json({error:'الطلب غير موجود'}); });
app.delete('/api/dev-requests/:id',        auth('admin'), (req, res) => { const ok=db.remove('devRequests',req.params.id); ok?res.json({message:'تم الحذف'}):res.status(404).json({error:'الطلب غير موجود'}); });

// ══════════════════════════════════════════════════════════════════════════
// AI
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/ai/insights', auth(), (_req, res) => {
  const s = db.store;
  const insights = [];
  const lowFuel = s.vehicles.filter(v=>(v.fuelLevel||100)<25);
  if (lowFuel.length) insights.push({type:'warning', message:`${lowFuel.length} مركبات بمستوى وقود منخفض`, vehicles:lowFuel.map(v=>v.name)});
  const overdue = s.maintenance.filter(m=>m.status==='pending' && m.scheduledDate<new Date().toISOString().slice(0,10));
  if (overdue.length) insights.push({type:'danger', message:`${overdue.length} صيانات متأخرة`});
  const unpaid = s.violations.filter(v=>v.status==='unpaid');
  if (unpaid.length) insights.push({type:'info', message:`${unpaid.length} مخالفات غير مدفوعة`});
  insights.push({type:'success', message:`الأسطول يعمل بكفاءة ${Math.round(s.vehicles.filter(v=>v.status==='active').length/s.vehicles.length*100)}%`});
  res.json({ insights, updatedAt: db.nowIso() });
});

app.post('/api/ai/query', auth(), async (req, res) => {
  const { message } = req.body||{};
  if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });
  try { const { generateFleetAnswer }=require('./lib/ai-chat'); const reply=await generateFleetAnswer(message,db.store); res.json({reply}); }
  catch { res.json({ reply: buildLocalAiAnswer(message) }); }
});

// ══════════════════════════════════════════════════════════════════════════
// VEHICLE PROFILE (full smart file)
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/vehicles/:id/profile', auth(), (req, res) => {
  const s = db.store;
  const v = db.findOne('vehicles', x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'المركبة غير موجودة' });

  const driver    = v.driverId ? db.findOne('drivers',  x => x.id === v.driverId)   : null;
  const employee  = v.driverId ? db.findOne('employees', x => x.vehicleId === v.id) : null;
  const maint     = db.find('maintenance',  x => x.vehicleId === v.id);
  const appts     = db.find('appointments', x => x.vehicleId === v.id);
  const accidents = db.find('accidents',    x => x.vehicleId === v.id);
  const viol      = db.find('violations',   x => x.vehicleId === v.id);
  const handovers = db.find('handovers',    x => x.vehicleId === v.id);
  const finItems  = db.find('financial',    x => x.vehicleId === v.id);

  // Smart AI condition score
  const score = computeVehicleScore(v, maint, accidents, viol);

  res.json({ vehicle: v, driver, employee, maintenance: maint, appointments: appts,
    accidents, violations: viol, handovers, financial: finItems, score });
});

// Update insurance/inspection on a vehicle
app.put('/api/vehicles/:id/insurance', auth('supervisor'), (req, res) => {
  const v = db.update('vehicles', req.params.id, { insurance: req.body });
  v ? res.json(v) : res.status(404).json({ error: 'المركبة غير موجودة' });
});

app.put('/api/vehicles/:id/inspection', auth('supervisor'), (req, res) => {
  const v = db.update('vehicles', req.params.id, { inspection: req.body });
  v ? res.json(v) : res.status(404).json({ error: 'المركبة غير موجودة' });
});

// ══════════════════════════════════════════════════════════════════════════
// HANDOVERS (استلام / تسليم)
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/handovers',              auth(), (_req, res) => res.json(db.store.handovers));
app.get('/api/vehicles/:id/handovers', auth(), (req, res) => {
  res.json(db.find('handovers', x => x.vehicleId === req.params.id));
});

app.post('/api/vehicles/:id/handover', auth('operator'), async (req, res) => {
  const v = db.findOne('vehicles', x => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'المركبة غير موجودة' });

  const { type, employeeId, employeeName, km, fuelLevel, condition, notes, images } = req.body;

  // AI vision analysis (real OpenAI Vision or local rules fallback)
  const aiResult = await analyzeVehicleDamage(images || [], v, type);
  const aiReport = formatReportText(aiResult);

  // Compare with last handover
  const last = db.find('handovers', x => x.vehicleId === v.id)
    .sort((a,b) => new Date(b.date) - new Date(a.date))[0];
  const comparison = last ? compareHandovers(last, { condition, aiReport }) : null;

  const handover = db.insert('handovers', {
    vehicleId: v.id, vehiclePlate: v.plate, vehicleName: v.name,
    type, employeeId, employeeName, date: db.nowIso(),
    km: Number(km) || v.km, fuelLevel: Number(fuelLevel) || v.fuelLevel,
    condition: condition || 'جيد', notes: notes || '', images: images || [],
    aiReport, comparison, signedBy: employeeName,
  });

  // Update vehicle km/fuel
  db.update('vehicles', v.id, { km: handover.km, fuelLevel: handover.fuelLevel, driverId: employeeId || v.driverId });

  db.pushAlert(`${type}: ${v.name} ← ${employeeName}`, type === 'استلام' ? 'success' : 'info');
  io.emit('handover:new', { vehicleId: v.id, handover });
  io.emit('dashboard:update', buildDashboardSnapshot());
  res.status(201).json(handover);
});

app.delete('/api/handovers/:id', auth('admin'), (req, res) => {
  const ok = db.remove('handovers', req.params.id);
  ok ? res.json({ message: 'تم الحذف' }) : res.status(404).json({ error: 'السجل غير موجود' });
});

// ══════════════════════════════════════════════════════════════════════════
// EMPLOYEES (موظفون)
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/employees',        auth(), (_req, res) => res.json(db.store.employees));
app.get('/api/employees/:id',    auth(), (req, res) => {
  const e = db.findOne('employees', x => x.id === req.params.id);
  if (!e) return res.status(404).json({ error: 'الموظف غير موجود' });
  // Build full employee profile
  const vehicle    = e.vehicleId ? db.findOne('vehicles', v => v.id === e.vehicleId) : null;
  const handovers  = db.find('handovers',  x => x.employeeId === e.id);
  const violations = db.find('violations', x => x.employeeId === e.id);
  const accidents  = db.find('accidents',  x => x.employeeId === e.id);
  res.json({ employee: e, vehicle, handovers, violations, accidents });
});
app.post('/api/employees',       auth('supervisor'), (req, res) => {
  const emp = db.insert('employees', { ...req.body, status: 'active' });
  io.emit('employees:new', emp);
  res.status(201).json(emp);
});
app.put('/api/employees/:id',    auth('supervisor'), (req, res) => {
  const emp = db.update('employees', req.params.id, req.body);
  emp ? res.json(emp) : res.status(404).json({ error: 'الموظف غير موجود' });
});
app.delete('/api/employees/:id', auth('admin'), (req, res) => {
  const ok = db.remove('employees', req.params.id);
  ok ? res.json({ message: 'تم الحذف' }) : res.status(404).json({ error: 'الموظف غير موجود' });
});

// ══════════════════════════════════════════════════════════════════════════
// GPS LIVE STREAMING ROUTES
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/gps/push',         gps.routePush);
app.post('/api/gps/client-push',  auth('operator'), gps.routeClientPush);
app.get('/api/gps/positions',     auth(), gps.routeGetPositions);
app.get('/api/gps/positions/:id', auth(), gps.routeGetVehiclePosition);

// ══════════════════════════════════════════════════════════════════════════
// HEALTH & VERSION
// ══════════════════════════════════════════════════════════════════════════
app.get('/api/health',  (_req, res) => res.json({ status:'ok', service:'telad-fleet', pg: !!process.env.DATABASE_URL, time:db.nowIso() }));
app.get('/api/version', (_req, res) => res.json({ version:'3.1.0', deployId:DEPLOY_ID, node:process.version }));

// ── Static frontend ─────────────────────────────────────────────────────
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR,'index.html')));

// ══════════════════════════════════════════════════════════════════════════
// HTTP SERVER + SOCKET.IO
// ══════════════════════════════════════════════════════════════════════════
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods:['GET','POST'], credentials: true },
  transports: ['websocket','polling'],
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('مطلوب التوثيق'));
  try { socket.data.user = authModule.verifyAccess(token); next(); }
  catch { next(new Error('توكن غير صالح')); }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  console.log(`[WS] + ${user.username}`);
  socket.join(`role:${user.role}`);

  socket.emit('init', {
    vehicles:  db.store.vehicles,
    alerts:    db.store.alerts.slice(0,5),
    dashboard: buildDashboardSnapshot(),
  });

  // Legacy client GPS push (kept for backward compat)
  socket.on('gps:update', ({ vehicleId, lat, lng }) => {
    gps.handleDevicePush(vehicleId, parseFloat(lat), parseFloat(lng));
    io.emit('gps:update', { vehicleId, lat, lng, t: db.nowIso() });
  });

  socket.on('disconnect', () => console.log(`[WS] - ${user.username}`));
});

// ── Initialise GPS module (simulation + batch broadcasts) ────────────────
gps.init(io, db);

// Dashboard push every 30 s
setInterval(() => { io.emit('dashboard:update', buildDashboardSnapshot()); }, 30_000);

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════
function groupBy(arr, key) {
  return arr.reduce((acc,item) => { const k=item[key]||'other'; acc[k]=(acc[k]||0)+1; return acc; }, {});
}

function buildDashboardSnapshot() {
  const s = db.store;
  const monthStart = new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10);
  const today = new Date().toISOString().slice(0,10);
  const active = s.vehicles.filter(v=>v.status==='active').length;
  return {
    vehicles:          s.vehicles.length,
    activeVehicles:    active,
    drivers:           s.drivers.length,
    employees:         s.employees.length,
    maintenance:       s.maintenance.filter(m=>m.status==='pending').length,
    alerts:            s.alerts.length,
    financialMonth:    s.financial.filter(f=>f.date>=monthStart).reduce((a,f)=>a+Number(f.amount||0),0).toFixed(2),
    handoversToday:    s.handovers.filter(h=>h.date&&h.date.slice(0,10)===today).length,
    insuranceExpiring: s.vehicles.filter(v=>v.insurance?.status==='expiring').length,
    inspectionExpired: s.vehicles.filter(v=>v.inspection?.status==='منتهي').length,
    efficiency:        Math.round(active/Math.max(s.vehicles.length,1)*100),
  };
}

function buildLocalAiAnswer(msg) {
  const s = db.store;
  const lc = (msg||'').toLowerCase();
  if (lc.includes('مركبة')||lc.includes('سيارة')) return `يوجد ${s.vehicles.length} مركبة، منها ${s.vehicles.filter(v=>v.status==='active').length} نشطة.`;
  if (lc.includes('سائق'))    return `يوجد ${s.drivers.length} سائق مسجّل.`;
  if (lc.includes('موظف'))    return `يوجد ${s.employees.length} موظف مسجّل في النظام.`;
  if (lc.includes('استلام')||lc.includes('تسليم')) return `تم تسجيل ${s.handovers.length} عمليات استلام/تسليم.`;
  if (lc.includes('صيانة'))   return `يوجد ${s.maintenance.filter(m=>m.status==='pending').length} طلب صيانة معلق.`;
  if (lc.includes('مال')||lc.includes('مصروف')) return `الإجمالي: ${s.financial.reduce((a,f)=>a+Number(f.amount||0),0).toLocaleString('ar')} ريال.`;
  if (lc.includes('تأمين'))   { const exp = s.vehicles.filter(v=>v.insurance?.status==='expiring').length; return `${exp} مركبات تأمينها على وشك الانتهاء.`; }
  if (lc.includes('فحص'))     { const exp = s.vehicles.filter(v=>v.inspection?.status==='منتهي').length; return `${exp} مركبات فحصها منتهي الصلاحية.`; }
  return 'أنا مساعد TELAD – اسألني عن المركبات أو السائقين أو الصيانة أو الاستلام أو المالية.';
}

/** Compute a 0-100 health score for a vehicle */
function computeVehicleScore(v, maint, accidents, viol) {
  let score = 100;
  if (v.status === 'maintenance') score -= 20;
  if (v.fuelLevel < 20) score -= 10;
  if (v.insurance?.status === 'expiring') score -= 15;
  if (v.insurance?.status === 'expired')  score -= 30;
  if (v.inspection?.status === 'منتهي')   score -= 25;
  score -= Math.min(accidents.filter(a=>a.status!=='closed').length * 10, 20);
  score -= Math.min(viol.filter(vv=>vv.status==='unpaid').length * 5, 15);
  score -= Math.min(maint.filter(m=>m.status==='pending' && m.scheduledDate < new Date().toISOString().slice(0,10)).length * 5, 10);
  const label = score >= 80 ? 'ممتاز' : score >= 60 ? 'جيد' : score >= 40 ? 'مقبول' : 'خطر';
  return { score: Math.max(score, 0), label, color: score>=80?'#22c55e':score>=60?'#f59e0b':score>=40?'#fb923c':'#ef4444' };
}

/** Simulate AI image analysis (use real OpenAI Vision if API_KEY set) */
async function _noop() {}  // analyzeVehicleImages replaced by lib/ai-vision.js

/** Compare two handover conditions */
function compareHandovers(last, current) {
  if (!last) return null;
  if (last.condition === current.condition) return { changed: false, message: 'لا توجد تغييرات في حالة المركبة' };
  return { changed: true, message: `تغيرت الحالة من "${last.condition}" إلى "${current.condition}"`, previousReport: last.aiReport };
}

// ══════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════
async function start() {
  await ensurePasswords();
  // Force initial write of data
  const _s = db.store;
  httpServer.listen(PORT, () => {
    console.log(`\n✅ TELAD FLEET v3.1 → http://localhost:${PORT}`);
    console.log(`   Deploy ID : ${DEPLOY_ID}`);
    console.log(`   Admin     : admin / ${ADMIN_PASS}`);
    console.log(`   Socket.IO : enabled`);
    console.log(`   GPS Sim   : ${process.env.NODE_ENV!=='production'?'ON':'OFF'}\n`);
  });
}

start().catch(err => { console.error('Startup error:', err); process.exit(1); });

