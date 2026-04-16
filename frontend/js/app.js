
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Frontend Application
// Domain: fna.sa  |  Version: 2.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── API Base URL (auto-detects environment) ─────────────────────────────────
const API_BASE = (() => {
  const h = window.location.hostname;
  if (h === 'fna.sa' || h === 'www.fna.sa' || h === 'fleet.fna.sa') {
    return 'https://api.fna.sa';
  }
  return 'http://localhost:5000';
})();

// ─── Role definitions ────────────────────────────────────────────────────────
const ROLE_NAMES = {
  admin:      'مدير النظام',
  supervisor: 'مشرف',
  operator:   'مشغّل',
  viewer:     'مستعرض',
};

// Sections accessible per role
const ROLE_SECTIONS = {
  admin:      ['dashboard', 'map', 'vehicles', 'condition', 'petromin', 'aldrees', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'logs', 'users'],
  supervisor: ['dashboard', 'map', 'vehicles', 'condition', 'petromin', 'aldrees', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai'],
  operator:   ['dashboard', 'map', 'vehicles', 'condition', 'petromin', 'aldrees', 'maintenance'],
  viewer:     ['dashboard', 'map'],
};

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('telad_token');
  if (token) {
    try {
      const res = await apiFetch('/auth/me');
      if (res.ok) {
        currentUser = await res.json();
        renderDashboard();
        return;
      }
    } catch { /* network error – fall through to login */ }
    localStorage.removeItem('telad_token');
  }
  renderLogin();
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE RENDERING
// ═══════════════════════════════════════════════════════════════════════════
function renderLogin() {
  document.getElementById('page-login').style.display    = 'flex';
  document.getElementById('page-dashboard').style.display = 'none';
  document.getElementById('login-error').textContent     = '';
  document.getElementById('inp-username').value          = '';
  document.getElementById('inp-password').value          = '';
}

function renderDashboard() {
  document.getElementById('page-login').style.display    = 'none';
  document.getElementById('page-dashboard').style.display = 'flex';

  // Topbar user info
  document.getElementById('user-name').textContent = currentUser.name;
  const badge = document.getElementById('user-role-badge');
  badge.textContent = ROLE_NAMES[currentUser.role] || currentUser.role;
  badge.className   = 'role-badge role-' + currentUser.role;

  // Show/hide sidebar menu items based on role
  const allowed = ROLE_SECTIONS[currentUser.role] || [];
  document.querySelectorAll('.nav-link[data-section]').forEach(el => {
    el.style.display = allowed.includes(el.dataset.section) ? 'flex' : 'none';
  });

  // Hide vehicle add-form for read-only roles
  if (currentUser.role === 'viewer') {
    const vf = document.getElementById('vehicle-form-wrap');
    if (vf) vf.style.display = 'none';
  }

  navigateTo('dashboard');
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
async function login(e) {
  e.preventDefault();
  const username = document.getElementById('inp-username').value.trim();
  const password = document.getElementById('inp-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errEl.textContent = '';
  btn.disabled      = true;
  btn.textContent   = 'جارٍ التحقق…';

  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'خطأ في تسجيل الدخول';
      return;
    }

    localStorage.setItem('telad_token', data.token);
    currentUser = data.user;
    renderDashboard();
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم — تحقق من تشغيل الـ Backend';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'تسجيل الدخول';
  }
}

function logout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  localStorage.removeItem('telad_token');
  currentUser = null;
  renderLogin();
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function navigateTo(section) {
  const allowed = ROLE_SECTIONS[currentUser?.role] || [];
  if (!allowed.includes(section)) return;

  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');

  // Deactivate all nav links
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));

  // Show target section
  const el = document.getElementById('sec-' + section);
  if (el) el.style.display = 'block';

  // Activate nav link
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (link) link.classList.add('active');

  // Load data for section
  const loaders = {
    dashboard: loadDashboardStats,
    vehicles:  loadVehicles,
    condition: initConditionSection,
    petromin:  initPetrominSection,
    aldrees:   initAldreesSection,
    users:     loadUsers,
    logs:      loadLogs,
  };
  if (loaders[section]) loaders[section]();
}

// ═══════════════════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════════════════
function apiFetch(path, options = {}) {
  const token = localStorage.getItem('telad_token');
  return fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════════════
async function loadDashboardStats() {
  try {
    const res = await apiFetch('/dashboard');
    if (!res.ok) return;
    const d = await res.json();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? 0;
    };
    set('stat-vehicles',  d.vehicles);
    set('stat-employees', d.employees);
    set('stat-cities',    d.cities);
    set('stat-projects',  d.projects);
  } catch { /* backend may not be running in dev */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLES
// ═══════════════════════════════════════════════════════════════════════════
async function loadVehicles() {
  const tbody = document.getElementById('vehicles-tbody');
  if (!tbody) return;
  try {
    const res       = await apiFetch('/vehicles');
    if (!res.ok) return;
    const fetched   = await res.json();
    vehicles        = fetched; // keep module-level cache in sync
    const canEdit   = ['admin', 'supervisor'].includes(currentUser?.role);
    tbody.innerHTML = vehicles.length === 0
      ? '<tr><td colspan="5" class="tbl-empty">لا توجد مركبات مضافة بعد</td></tr>'
      : vehicles.map(v => `
          <tr>
            <td>${escHtml(v.name   || '—')}</td>
            <td>${escHtml(v.plate  || '—')}</td>
            <td>${escHtml(v.city   || '—')}</td>
            <td>${escHtml(v.driver || '—')}</td>
            <td>${canEdit
              ? `<button class="btn-sm btn-danger" onclick="deleteVehicle('${escHtml(String(v.id))}')">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addVehicle(e) {
  e.preventDefault();
  const body = {
    name:   document.getElementById('v-name').value.trim(),
    plate:  document.getElementById('v-plate').value.trim(),
    city:   document.getElementById('v-city').value.trim(),
    driver: document.getElementById('v-driver').value.trim(),
  };
  const res = await apiFetch('/vehicles', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    vehicles = []; // reset cache so next populateVehicleSelect fetches fresh
    document.getElementById('form-vehicle').reset();
    loadVehicles();
    loadDashboardStats();
  }
}

async function deleteVehicle(id) {
  if (!confirm('هل تريد حذف هذه المركبة؟')) return;
  const res = await apiFetch('/vehicles/' + id, { method: 'DELETE' });
  if (res.ok) {
    vehicles = []; // reset cache
    loadVehicles();
    loadDashboardStats();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════
async function loadLogs() {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/logs');
    if (!res.ok) return;
    const logs = await res.json();
    tbody.innerHTML = logs.length === 0
      ? '<tr><td colspan="3" class="tbl-empty">لا توجد سجلات بعد</td></tr>'
      : [...logs].reverse().map(l => `
          <tr>
            <td>${new Date(l.time).toLocaleString('ar-SA')}</td>
            <td>${escHtml(l.user)}</td>
            <td>${escHtml(l.action)}</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" class="tbl-empty">تعذّر تحميل السجل</td></tr>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT  (admin only)
// ═══════════════════════════════════════════════════════════════════════════
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  try {
    const res   = await apiFetch('/auth/users');
    if (!res.ok) return;
    const users = await res.json();
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${escHtml(u.name)}</td>
        <td><code>${escHtml(u.username)}</code></td>
        <td>${escHtml(u.email || '—')}</td>
        <td><span class="role-badge role-${u.role}">${ROLE_NAMES[u.role] || u.role}</span></td>
        <td>${u.active
          ? '<span class="badge-active">✔ نشط</span>'
          : '<span class="badge-inactive">✘ معطّل</span>'
        }</td>
        <td>
          ${u.id !== 1
            ? `<button class="btn-sm btn-warn"   onclick="toggleUser('${escHtml(String(u.id))}', ${!u.active})">${u.active ? 'تعطيل' : 'تفعيل'}</button>
               <button class="btn-sm btn-danger" onclick="deleteUser('${escHtml(String(u.id))}')">حذف</button>`
            : '<span style="color:#475569;font-size:12px">محمي</span>'
          }
        </td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">تعذّر تحميل المستخدمين</td></tr>';
  }
}

async function addUser(e) {
  e.preventDefault();
  const errEl = document.getElementById('user-form-error');
  errEl.textContent = '';
  const body = {
    name:     document.getElementById('u-name').value.trim(),
    username: document.getElementById('u-username').value.trim(),
    email:    document.getElementById('u-email').value.trim(),
    password: document.getElementById('u-password').value,
    role:     document.getElementById('u-role').value,
  };
  const res  = await apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error; return; }
  document.getElementById('form-user').reset();
  loadUsers();
}

async function toggleUser(id, active) {
  await apiFetch('/auth/users/' + id, { method: 'PUT', body: JSON.stringify({ active }) });
  loadUsers();
}

async function deleteUser(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
  await apiFetch('/auth/users/' + id, { method: 'DELETE' });
  loadUsers();
}

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE CONDITION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

function initConditionSection() {
  populateVehicleSelect('cd-vehicle');
  populateVehicleSelect('cr-vehicle');
  populateVehicleSelect('cond-hist-vehicle');
}

function switchConditionTab(tab) {
  ['delivery', 'receipt', 'history'].forEach(t => {
    const el = document.getElementById('cond-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#sec-condition .tab-btn').forEach((btn, i) => {
    const tabs = ['delivery', 'receipt', 'history'];
    btn.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'history') loadConditionHistory();
}

async function submitConditionReport(e, reportType) {
  e.preventDefault();
  const prefix   = reportType === 'delivery' ? 'cd' : 'cr';
  const errEl    = document.getElementById(`cond-${reportType}-error`);
  const resultEl = document.getElementById(`cond-${reportType}-result`);
  errEl.textContent = '';
  resultEl.style.display = 'none';

  const vehicleId = document.getElementById(prefix + '-vehicle').value;
  if (!vehicleId) { errEl.textContent = 'يرجى اختيار المركبة'; return; }

  const body = {
    vehicleId,
    reportType,
    mileage:          parseInt(document.getElementById(prefix + '-mileage').value) || null,
    fuelLevel:        parseInt(document.getElementById(prefix + '-fuel').value)    || null,
    tiresStatus:      document.getElementById(prefix + '-tires').value,
    oilStatus:        document.getElementById(prefix + '-oil').value,
    batteryStatus:    document.getElementById(prefix + '-battery').value,
    overallCondition: document.getElementById(prefix + '-overall').value,
    notes:            document.getElementById(prefix + '-notes')?.value?.trim() || '',
    damages:          [],
  };

  const res  = await apiFetch('/vehicle-condition', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'حدث خطأ'; return; }

  const ai  = data.report.aiAnalysis || {};
  const scoreColor = ai.score >= 80 ? '#22c55e' : ai.score >= 60 ? '#f59e0b' : '#ef4444';
  resultEl.innerHTML = `
    <div class="ai-result-header">🤖 تحليل الذكاء الاصطناعي</div>
    <div class="ai-score" style="color:${scoreColor}">تقييم الحالة: ${ai.score ?? '—'} / 100</div>
    <div class="ai-recommendation">${escHtml(ai.recommendation || '')}</div>
    ${(ai.issues || []).length ? `
      <ul class="ai-issues">
        ${ai.issues.map(i => `<li>⚠️ ${escHtml(i)}</li>`).join('')}
      </ul>` : '<p class="ai-ok">✅ لا توجد ملاحظات تستوجب الإجراء الفوري</p>'}
    <small style="color:#94a3b8">التقرير #${escHtml(data.report.id)} — ${new Date(data.report.createdAt).toLocaleString('ar-SA')}</small>
  `;
  resultEl.style.display = 'block';

  document.getElementById('form-condition-' + reportType).reset();
}

async function loadConditionHistory() {
  const vehicleId = document.getElementById('cond-hist-vehicle').value;
  const listEl    = document.getElementById('condition-history-list');
  if (!vehicleId) { listEl.innerHTML = '<p class="tbl-empty">يرجى اختيار مركبة</p>'; return; }

  const res  = await apiFetch('/vehicle-condition/' + vehicleId);
  if (!res.ok) { listEl.innerHTML = '<p class="tbl-empty">تعذّر تحميل السجل</p>'; return; }
  const data = await res.json();

  if (!data.reports.length) {
    listEl.innerHTML = '<p class="tbl-empty">لا توجد تقارير لهذه المركبة بعد</p>';
    return;
  }

  listEl.innerHTML = data.reports.map(r => {
    const ai = r.aiAnalysis || {};
    const scoreColor = (ai.score >= 80) ? '#22c55e' : (ai.score >= 60) ? '#f59e0b' : '#ef4444';
    return `
      <div class="history-card">
        <div class="hcard-header">
          <span class="hcard-type">${r.reportType === 'delivery' ? '🚗 تسليم' : '📥 استلام'}</span>
          <span class="hcard-date">${new Date(r.createdAt).toLocaleDateString('ar-SA')}</span>
          <span class="hcard-score" style="color:${scoreColor}">${ai.score ?? '—'}/100</span>
        </div>
        <div class="hcard-body">
          <span>📏 الممشى: ${r.mileage ? r.mileage + ' كم' : '—'}</span>
          <span>⛽ الوقود: ${r.fuelLevel != null ? r.fuelLevel + '%' : '—'}</span>
          <span>🏷️ الحالة: ${conditionLabel(r.overallCondition)}</span>
          <span>👤 بواسطة: ${escHtml(r.createdBy || '—')}</span>
        </div>
        ${r.notes ? `<div class="hcard-notes">📝 ${escHtml(r.notes)}</div>` : ''}
        ${ai.recommendation ? `<div class="hcard-ai">🤖 ${escHtml(ai.recommendation)}</div>` : ''}
      </div>`;
  }).join('');
}

function conditionLabel(val) {
  const map = { excellent: 'ممتازة ✅', good: 'جيدة 👍', fair: 'متوسطة ⚠️', poor: 'سيئة ❌' };
  return map[val] || val || '—';
}

// ═══════════════════════════════════════════════════════════════════════════
// PETROMIN SECTION
// ═══════════════════════════════════════════════════════════════════════════

async function initPetrominSection() {
  populateVehicleSelect('pm-vehicle');
  populateVehicleSelect('pm-filter-vehicle', true);
  populateVehicleSelect('pm-sync-vehicle');

  // Load integration status
  const res = await apiFetch('/integrations/status');
  if (res.ok) {
    const status = await res.json();
    const badge  = document.getElementById('petromin-conn-badge');
    if (status.petromin?.connected) {
      badge.textContent = `🟢 مربوط — ${escHtml(status.petromin.username || '')}`;
      badge.className   = 'badge-active';
    }
  }

  // Set today's date
  const dateEl = document.getElementById('pm-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
}

function switchPetrominTab(tab) {
  ['add', 'list', 'sync'].forEach(t => {
    const el = document.getElementById('pm-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#sec-petromin .tab-btn').forEach((btn, i) => {
    const tabs = ['add', 'list', 'sync'];
    btn.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'list')  loadPetrominServices();
  if (tab === 'sync')  loadSyncLogs('petromin');
}

function openPetrominConnect() {
  document.getElementById('petromin-connect-form').style.display = 'block';
}
function closePetrominConnect() {
  document.getElementById('petromin-connect-form').style.display = 'none';
}

async function connectPetromin() {
  const errEl = document.getElementById('pm-connect-error');
  errEl.textContent = '';
  const body = {
    service:       'petromin',
    username:      document.getElementById('pm-username').value.trim(),
    apiKey:        document.getElementById('pm-password').value,
    accountNumber: document.getElementById('pm-account').value.trim(),
  };
  const res  = await apiFetch('/integrations/connect', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'حدث خطأ في الربط'; return; }
  document.getElementById('petromin-conn-badge').textContent = `🟢 مربوط — ${escHtml(body.username)}`;
  document.getElementById('petromin-conn-badge').className = 'badge-active';
  closePetrominConnect();
}

async function addPetrominService(e) {
  e.preventDefault();
  const errEl = document.getElementById('pm-form-error');
  errEl.textContent = '';
  const vehicleId = document.getElementById('pm-vehicle').value;
  if (!vehicleId) { errEl.textContent = 'يرجى اختيار المركبة'; return; }

  const body = {
    vehicleId,
    serviceType:         document.getElementById('pm-type').value,
    serviceDate:         document.getElementById('pm-date').value,
    mileageAtService:    parseInt(document.getElementById('pm-mileage').value) || null,
    nextServiceMileage:  parseInt(document.getElementById('pm-next-mileage').value) || null,
    nextServiceDate:     document.getElementById('pm-next-date').value || null,
    cost:                parseFloat(document.getElementById('pm-cost').value) || null,
    oilType:             document.getElementById('pm-oil-type').value.trim(),
    oilBrand:            document.getElementById('pm-oil-brand').value.trim(),
    workshopName:        document.getElementById('pm-workshop').value.trim(),
    workshopCity:        document.getElementById('pm-city').value.trim(),
    invoiceNumber:       document.getElementById('pm-invoice').value.trim(),
    notes:               document.getElementById('pm-notes').value.trim(),
  };

  const res  = await apiFetch('/petromin/services', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'حدث خطأ'; return; }
  document.getElementById('form-petromin').reset();
  document.getElementById('pm-date').value = new Date().toISOString().slice(0, 10);
  alert('✅ تم حفظ خدمة بترومين بنجاح');
}

async function loadPetrominServices() {
  const tbody    = document.getElementById('pm-services-tbody');
  const summaryEl = document.getElementById('pm-oil-summary');
  const vehicleId = document.getElementById('pm-filter-vehicle').value;
  const url       = vehicleId ? `/petromin/services/${vehicleId}` : '/petromin/services';
  tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">جارٍ التحميل…</td></tr>';

  const res = await apiFetch(url);
  if (!res.ok) { tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">تعذّر التحميل</td></tr>'; return; }
  const data     = await res.json();
  const services = Array.isArray(data) ? data : (data.services || []);
  const pred     = data.prediction;

  if (pred && vehicleId) {
    summaryEl.innerHTML = `
      <div class="summary-box">
        <div class="summary-title">🤖 ملخص AI — آخر تغيير زيت</div>
        <div class="summary-grid">
          <span>📅 تاريخ آخر تغيير: <strong>${pred.last_oil_change_date || '—'}</strong></span>
          <span>📏 الممشى: <strong>${pred.last_oil_change_mileage ? pred.last_oil_change_mileage + ' كم' : '—'}</strong></span>
          <span>💰 التكلفة: <strong>${pred.last_oil_change_cost ? pred.last_oil_change_cost + ' ريال' : '—'}</strong></span>
          <span>🛢️ نوع الزيت: <strong>${escHtml(pred.oil_type || '—')}</strong></span>
          <span>🏷️ الماركة: <strong>${escHtml(pred.oil_brand || '—')}</strong></span>
          <span>🔧 الورشة: <strong>${escHtml(pred.workshop || '—')}</strong></span>
          <span>📏 الخدمة القادمة: <strong>${pred.next_service_mileage ? pred.next_service_mileage + ' كم' : '—'}</strong></span>
          <span>📅 تاريخ الخدمة القادمة: <strong>${pred.next_service_date || '—'}</strong></span>
        </div>
      </div>`;
  } else {
    summaryEl.innerHTML = '';
  }

  const serviceLabels = {
    oil_change:    'تغيير زيت 🛢️',
    filter_change: 'تغيير فلتر',
    inspection:    'فحص دوري',
    tire_rotation: 'تدوير إطارات',
    brake_service: 'صيانة فرامل',
    other:         'أخرى',
  };

  tbody.innerHTML = services.length === 0
    ? '<tr><td colspan="8" class="tbl-empty">لا توجد خدمات مسجلة</td></tr>'
    : services.map(s => {
        const v = vehicles.find(vv => vv.id === s.vehicleId);
        return `<tr>
          <td>${escHtml(v ? (v.plate || v.name) : s.vehicleId)}</td>
          <td>${escHtml(serviceLabels[s.serviceType] || s.serviceType)}</td>
          <td>${s.serviceDate || '—'}</td>
          <td>${s.mileageAtService ? s.mileageAtService + ' كم' : '—'}</td>
          <td>${s.cost ? s.cost + ' ريال' : '—'}</td>
          <td>${escHtml(s.oilType || '—')}</td>
          <td>${s.nextServiceDate || (s.nextServiceMileage ? s.nextServiceMileage + ' كم' : '—')}</td>
          <td>${escHtml(s.workshopName || '—')}</td>
        </tr>`;
      }).join('');
}

async function syncPetromin() {
  const resultEl  = document.getElementById('pm-sync-result');
  const vehicleId = document.getElementById('pm-sync-vehicle').value;
  if (!vehicleId) { alert('يرجى اختيار المركبة'); return; }
  resultEl.style.display = 'none';

  const res  = await apiFetch('/petromin/sync', { method: 'POST', body: JSON.stringify({ vehicleId }) });
  const data = await res.json();
  resultEl.innerHTML = `<strong>${data.status === 'ok' ? '✅' : '❌'}</strong> ${escHtml(data.message || data.error || '')}`;
  resultEl.style.display = 'block';
  loadSyncLogs('petromin');
}

// ═══════════════════════════════════════════════════════════════════════════
// AL-DREES SECTION
// ═══════════════════════════════════════════════════════════════════════════

async function initAldreesSection() {
  populateVehicleSelect('ad-vehicle');
  populateVehicleSelect('ad-filter-vehicle', true);
  populateVehicleSelect('ad-sync-vehicle');

  const dateEl = document.getElementById('ad-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  // Integration status
  const res = await apiFetch('/integrations/status');
  if (res.ok) {
    const status = await res.json();
    const badge  = document.getElementById('aldrees-conn-badge');
    if (status.aldrees?.connected) {
      badge.textContent = `🟢 مربوط — بطاقة ${escHtml(status.aldrees.cardNumber || '')}`;
      badge.className   = 'badge-active';
    }
  }
}

function switchAldreesTab(tab) {
  ['add', 'list', 'sync'].forEach(t => {
    const el = document.getElementById('ad-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#sec-aldrees .tab-btn').forEach((btn, i) => {
    const tabs = ['add', 'list', 'sync'];
    btn.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'list') loadFuelLogs();
  if (tab === 'sync') loadSyncLogs('aldrees');
}

function openAldreesConnect() {
  document.getElementById('aldrees-connect-form').style.display = 'block';
}
function closeAldreesConnect() {
  document.getElementById('aldrees-connect-form').style.display = 'none';
}

async function connectAldrees() {
  const errEl = document.getElementById('ad-connect-error');
  errEl.textContent = '';
  const body = {
    service:       'aldrees',
    cardNumber:    document.getElementById('ad-card').value.trim(),
    apiKey:        document.getElementById('ad-password').value,
    accountNumber: document.getElementById('ad-account').value.trim(),
  };
  const res  = await apiFetch('/integrations/connect', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'حدث خطأ في الربط'; return; }
  document.getElementById('aldrees-conn-badge').textContent = `🟢 مربوط — بطاقة ${escHtml(body.cardNumber)}`;
  document.getElementById('aldrees-conn-badge').className = 'badge-active';
  closeAldreesConnect();
}

function calcFuelTotal() {
  const liters = parseFloat(document.getElementById('ad-liters').value) || 0;
  const price  = parseFloat(document.getElementById('ad-cost-per-liter').value) || 0;
  const totalEl = document.getElementById('ad-total-cost');
  if (totalEl && liters && price) totalEl.value = (liters * price).toFixed(2);
}

async function addFuelLog(e) {
  e.preventDefault();
  const errEl = document.getElementById('ad-form-error');
  errEl.textContent = '';
  const vehicleId = document.getElementById('ad-vehicle').value;
  if (!vehicleId) { errEl.textContent = 'يرجى اختيار المركبة'; return; }

  const body = {
    vehicleId,
    fillDate:       document.getElementById('ad-date').value,
    liters:         parseFloat(document.getElementById('ad-liters').value),
    costPerLiter:   parseFloat(document.getElementById('ad-cost-per-liter').value) || null,
    totalCost:      parseFloat(document.getElementById('ad-total-cost').value) || null,
    mileage:        parseInt(document.getElementById('ad-mileage').value) || null,
    fuelCardNumber: document.getElementById('ad-card-num').value.trim(),
    stationName:    document.getElementById('ad-station').value.trim(),
    stationCity:    document.getElementById('ad-station-city').value.trim(),
    driver:         document.getElementById('ad-driver').value.trim(),
    notes:          document.getElementById('ad-notes').value.trim(),
  };

  const res  = await apiFetch('/aldrees/fuel', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'حدث خطأ'; return; }
  document.getElementById('form-aldrees').reset();
  document.getElementById('ad-date').value = new Date().toISOString().slice(0, 10);
  alert('✅ تم حفظ سجل الوقود بنجاح');
}

async function loadFuelLogs() {
  const tbody     = document.getElementById('ad-fuel-tbody');
  const summaryEl = document.getElementById('ad-fuel-summary');
  const vehicleId = document.getElementById('ad-filter-vehicle').value;
  const url       = vehicleId ? `/aldrees/fuel/${vehicleId}` : '/aldrees/fuel';
  tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">جارٍ التحميل…</td></tr>';

  const res = await apiFetch(url);
  if (!res.ok) { tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">تعذّر التحميل</td></tr>'; return; }
  const data  = await res.json();
  const logs  = Array.isArray(data) ? data : (data.logs || []);
  const trend = data.trend;

  if (trend && vehicleId) {
    const anomalyHtml = trend.anomaly_detected
      ? `<span class="anomaly-badge">⚠️ ${escHtml(trend.anomaly_note)}</span>`
      : '<span class="ok-badge">✅ لا توجد شذوذات</span>';
    summaryEl.innerHTML = `
      <div class="summary-box">
        <div class="summary-title">🤖 تحليل AI — استهلاك الوقود</div>
        <div class="summary-grid">
          <span>🛢️ إجمالي اللترات: <strong>${trend.total_liters} لتر</strong></span>
          <span>💰 إجمالي التكلفة: <strong>${trend.total_cost_sar} ريال</strong></span>
          <span>📊 معدل التعبئة: <strong>${trend.average_fill_liters} لتر</strong></span>
          <span>🔢 عدد التعبئات: <strong>${trend.fills_count}</strong></span>
          <span>🔍 الشذوذات: ${anomalyHtml}</span>
        </div>
      </div>`;
  } else {
    summaryEl.innerHTML = '';
  }

  tbody.innerHTML = logs.length === 0
    ? '<tr><td colspan="8" class="tbl-empty">لا توجد سجلات وقود</td></tr>'
    : logs.map(l => {
        const v = vehicles.find(vv => vv.id === l.vehicleId);
        return `<tr>
          <td>${escHtml(v ? (v.plate || v.name) : l.vehicleId)}</td>
          <td>${l.fillDate || '—'}</td>
          <td><strong>${l.liters}</strong> لتر</td>
          <td>${l.costPerLiter ? l.costPerLiter + ' ريال' : '—'}</td>
          <td>${l.totalCost ? l.totalCost + ' ريال' : '—'}</td>
          <td>${l.mileage ? l.mileage + ' كم' : '—'}</td>
          <td>${escHtml(l.stationName || '—')}</td>
          <td>${escHtml(l.driver || '—')}</td>
        </tr>`;
      }).join('');
}

async function syncAldrees() {
  const resultEl  = document.getElementById('ad-sync-result');
  const vehicleId = document.getElementById('ad-sync-vehicle').value;
  if (!vehicleId) { alert('يرجى اختيار المركبة'); return; }
  resultEl.style.display = 'none';

  const res  = await apiFetch('/aldrees/sync', { method: 'POST', body: JSON.stringify({ vehicleId }) });
  const data = await res.json();
  resultEl.innerHTML = `<strong>${data.status === 'ok' ? '✅' : '❌'}</strong> ${escHtml(data.message || data.error || '')}`;
  resultEl.style.display = 'block';
  loadSyncLogs('aldrees');
}

async function loadSyncLogs(service) {
  const elId = service === 'petromin' ? 'pm-sync-logs' : 'ad-sync-logs';
  const el   = document.getElementById(elId);
  if (!el) return;

  const res = await apiFetch('/sync/logs');
  if (!res.ok) { el.innerHTML = '<p class="tbl-empty">تعذّر التحميل</p>'; return; }
  const all  = await res.json();
  const logs = all.filter(l => l.service === service);

  el.innerHTML = logs.length === 0
    ? '<p class="tbl-empty">لا توجد مزامنات سابقة</p>'
    : `<table class="data-table"><thead><tr><th>الحالة</th><th>السجلات</th><th>التاريخ</th><th>ملاحظة</th></tr></thead><tbody>
        ${logs.map(l => `<tr>
          <td>${l.status === 'ok' ? '✅ ناجح' : '❌ خطأ'}</td>
          <td>${l.recordsSynced}</td>
          <td>${new Date(l.syncedAt).toLocaleString('ar-SA')}</td>
          <td>${escHtml(l.message || l.errorMessage || '—')}</td>
        </tr>`).join('')}
      </tbody></table>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Cache of vehicles for dropdowns
let vehicles = [];

async function populateVehicleSelect(selectId, addAll = false) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  if (!vehicles.length) {
    try {
      const res = await apiFetch('/vehicles');
      if (res.ok) vehicles = await res.json();
    } catch { /* ignore */ }
  }

  const placeholder = addAll ? '<option value="">جميع المركبات</option>' : '<option value="">اختر المركبة…</option>';
  sel.innerHTML = placeholder + vehicles.map(v =>
    `<option value="${escHtml(String(v.id))}">${escHtml(v.plate || v.name || v.id)}</option>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
