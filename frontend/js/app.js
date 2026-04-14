
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
  driver:     'سائق',
};

// Sections accessible per role
const ROLE_SECTIONS = {
  admin:      ['dashboard', 'map', 'vehicles', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'logs', 'users', 'employees', 'requests', 'monthly-reports'],
  supervisor: ['dashboard', 'map', 'vehicles', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'employees', 'requests', 'monthly-reports'],
  operator:   ['dashboard', 'map', 'vehicles', 'maintenance', 'employees'],
  viewer:     ['dashboard', 'map'],
};

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  initRequestsTable();

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
    dashboard:       loadDashboardStats,
    vehicles:        loadVehicles,
    users:           loadUsers,
    logs:            loadLogs,
    employees:       loadEmployees,
    requests:        loadRequests,
    'monthly-reports': loadMonthlyReports,
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
    const res      = await apiFetch('/vehicles');
    if (!res.ok) return;
    const vehicles = await res.json();
    const canEdit  = ['admin', 'supervisor'].includes(currentUser?.role);
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
    document.getElementById('form-vehicle').reset();
    loadVehicles();
    loadDashboardStats();
  }
}

async function deleteVehicle(id) {
  if (!confirm('هل تريد حذف هذه المركبة؟')) return;
  const res = await apiFetch('/vehicles/' + id, { method: 'DELETE' });
  if (res.ok) { loadVehicles(); loadDashboardStats(); }
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
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════
async function loadEmployees() {
  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/employees');
    if (!res.ok) return;
    const list = await res.json();
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="5" class="tbl-empty">لا يوجد موظفون بعد</td></tr>'
      : list.map(e => `
          <tr>
            <td>${escHtml(e.name   || '—')}</td>
            <td>${escHtml(e.national_id || '—')}</td>
            <td>${escHtml(e.title  || '—')}</td>
            <td>${escHtml(e.phone  || '—')}</td>
            <td>${escHtml(e.city   || '—')}</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addEmployee(e) {
  e.preventDefault();
  const errEl = document.getElementById('emp-form-error');
  errEl.textContent = '';
  const body = {
    name:        document.getElementById('emp-name').value.trim(),
    national_id: document.getElementById('emp-nid').value.trim(),
    title:       document.getElementById('emp-title').value.trim(),
    phone:       document.getElementById('emp-phone').value.trim(),
    city:        document.getElementById('emp-city').value.trim(),
  };
  if (!body.name || !body.national_id) {
    errEl.textContent = 'الاسم ورقم الهوية مطلوبان';
    return;
  }
  const res  = await apiFetch('/employees', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'خطأ'; return; }
  document.getElementById('form-employee').reset();
  loadEmployees();
  loadDashboardStats();
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUESTS  (admin/supervisor view)
// ═══════════════════════════════════════════════════════════════════════════
const REQUEST_TYPE_LABELS = {
  maintenance:      'صيانة شهرية',
  oil:              'تغيير زيت',
  tires:            'إطارات',
  full_inspection:  'فحص شامل',
  urgent_repair:    'إصلاح عاجل',
  part_replacement: 'استبدال قطعة',
  accident:         'حادث',
  complaint:        'شكوى',
  suggestion:       'اقتراح',
  other:            'أخرى',
};

const STATUS_HTML = {
  pending:  '<span class="request-status-pending">⏳ معلق</span>',
  approved: '<span class="request-status-approved">✅ موافق</span>',
  rejected: '<span class="request-status-rejected">❌ مرفوض</span>',
  held:     '<span class="request-status-held">⏸ مؤجل</span>',
};

async function loadRequests() {
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/requests');
    if (!res.ok) return;
    const list = await res.json();
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="6" class="tbl-empty">لا توجد طلبات بعد</td></tr>'
      : [...list].reverse().map(r => `
          <tr>
            <td>${escHtml(r.employeeName || '—')}</td>
            <td>${escHtml(r.plate || r.vehicleId || '—')}</td>
            <td>${escHtml(REQUEST_TYPE_LABELS[r.type] || r.type)}</td>
            <td>${new Date(r.createdAt).toLocaleDateString('ar-SA')}</td>
            <td>${STATUS_HTML[r.status] || escHtml(r.status)}</td>
            <td>
              <button class="btn-sm btn-approve" data-id="${escHtml(r.id)}" data-action="approved">✅ موافقة</button>
              <button class="btn-sm btn-reject"  data-id="${escHtml(r.id)}" data-action="rejected">❌ رفض</button>
              <button class="btn-sm btn-hold"    data-id="${escHtml(r.id)}" data-action="held">⏸ تأجيل</button>
            </td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">تعذّر تحميل الطلبات</td></tr>';
  }
}

// Permanent event delegation for request action buttons (set up once on DOMContentLoaded)
function initRequestsTable() {
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    updateRequest(btn.dataset.id, btn.dataset.action);
  });
}

async function updateRequest(id, status) {
  const comment = status === 'rejected' || status === 'held'
    ? (prompt('أضف تعليقاً (اختياري):') || '')
    : '';
  await apiFetch('/requests/' + id, {
    method: 'PUT',
    body: JSON.stringify({ status, adminComment: comment }),
  });
  loadRequests();
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY REPORTS  (admin/supervisor view)
// ═══════════════════════════════════════════════════════════════════════════
const TIRE_LABELS = { good: 'سليمة ✅', needs_attention: 'تحتاج متابعة ⚠️', damaged: 'تالفة ❌' };
const FUEL_LABELS = { full: 'ممتلئ ⛽', half: 'نصف', needs_refuel: 'يحتاج تعبئة 🔴' };

async function loadMonthlyReports() {
  const tbody = document.getElementById('monthly-reports-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/monthly-reports');
    if (!res.ok) return;
    const list = await res.json();
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="7" class="tbl-empty">لا توجد تقارير بعد</td></tr>'
      : [...list].reverse().map(r => `
          <tr>
            <td>${escHtml(r.plate || r.vehicleId || '—')}</td>
            <td>${escHtml(r.employeeName || '—')}</td>
            <td>${escHtml(r.odometer ? r.odometer + ' كم' : '—')}</td>
            <td>${escHtml(TIRE_LABELS[r.tireCondition] || r.tireCondition || '—')}</td>
            <td>${escHtml(FUEL_LABELS[r.fuelLevel] || r.fuelLevel || '—')}</td>
            <td>${new Date(r.createdAt).toLocaleDateString('ar-SA')}</td>
            <td>${escHtml(r.notes || '—')}</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">تعذّر تحميل التقارير</td></tr>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIVER PORTAL  — page switching
// ═══════════════════════════════════════════════════════════════════════════
let driverUser = null;  // { id, name, role:'driver', vehicleId, plate, token }

function showDriverLogin() {
  document.getElementById('page-login').style.display        = 'none';
  document.getElementById('page-driver-login').style.display = 'flex';
  document.getElementById('driver-login-error').textContent  = '';
}

function showAdminLogin() {
  document.getElementById('page-driver-login').style.display = 'none';
  document.getElementById('page-login').style.display        = 'flex';
}

async function driverLogin(e) {
  e.preventDefault();
  const plate      = document.getElementById('dl-plate').value.trim();
  const national_id = document.getElementById('dl-nid').value.trim();
  const errEl      = document.getElementById('driver-login-error');
  const btn        = document.getElementById('btn-driver-login');

  errEl.textContent = '';
  btn.disabled      = true;
  btn.textContent   = 'جارٍ التحقق…';

  try {
    const res  = await fetch(`${API_BASE}/driver/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plate, national_id }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'بيانات غير صحيحة';
      return;
    }

    localStorage.setItem('telad_driver_token', data.token);
    driverUser = { ...data.employee, role: 'driver', vehicleId: data.vehicle.id, plate: data.vehicle.plate, token: data.token };
    renderDriverPortal(data);
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'دخول';
  }
}

function renderDriverPortal(data) {
  document.getElementById('page-driver-login').style.display  = 'none';
  document.getElementById('page-driver-portal').style.display = 'flex';
  document.getElementById('driver-name-badge').textContent    = driverUser.name;
  document.getElementById('driver-plate-badge').textContent   = '🚗 ' + (driverUser.plate || '');
  dpShow('home');
}

function driverLogout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  localStorage.removeItem('telad_driver_token');
  driverUser = null;
  document.getElementById('page-driver-portal').style.display = 'none';
  document.getElementById('page-login').style.display         = 'flex';
}

function dpShow(section) {
  // Hide all dp- sections
  document.querySelectorAll('#page-driver-portal .dp-section, #dp-home')
    .forEach(el => el.style.display = 'none');
  const el = document.getElementById('dp-' + section);
  if (el) el.style.display = 'block';

  // Load vehicle status on demand
  if (section === 'vehicle-status') loadDriverVehicleStatus();
}

// ─── Photo helpers ────────────────────────────────────────────────────────────
function triggerPhotoUpload(inputId) {
  document.getElementById(inputId).click();
}

function previewPhoto(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  const prev = document.getElementById(previewId);
  compressImage(file, 800, (dataUrl) => {
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px';
    img.src = dataUrl;
    prev.innerHTML = '';
    prev.appendChild(img);
    prev.dataset.dataUrl = dataUrl;
  });
}

function compressImage(file, maxPx, callback) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else       { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function getPhotoData(previewId) {
  const el = document.getElementById(previewId);
  return el ? (el.dataset.dataUrl || null) : null;
}

// ─── Driver API helper ────────────────────────────────────────────────────────
function driverApiFetch(path, options = {}) {
  const token = localStorage.getItem('telad_driver_token');
  return fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
}

// ─── 1. Maintenance booking ───────────────────────────────────────────────────
async function submitMaintenanceBooking(e) {
  e.preventDefault();
  const errEl = document.getElementById('mb-error');
  errEl.textContent = '';
  const maintenanceType = document.getElementById('mb-type').value;
  const body = {
    type:            'maintenance',
    maintenanceType,
    description:     `طلب صيانة: ${maintenanceType}`,
    preferredDate:   document.getElementById('mb-date').value,
    preferredTime:   document.getElementById('mb-time').value,
    notes:           document.getElementById('mb-notes').value.trim(),
    vehicleId:       driverUser.vehicleId,
    plate:           driverUser.plate,
  };
  try {
    const res  = await driverApiFetch('/requests', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'خطأ'; return; }
    alert('✅ تم إرسال طلب الصيانة بنجاح — سيتم مراجعته من قِبل الإدارة');
    document.getElementById('form-maintenance-booking').reset();
    dpShow('home');
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  }
}

// ─── 2. Monthly report ────────────────────────────────────────────────────────
async function submitMonthlyReport(e) {
  e.preventDefault();
  const errEl = document.getElementById('mr-error');
  errEl.textContent = '';

  // Odometer photo is required
  const odoPhoto = getPhotoData('prev-odometer');
  if (!odoPhoto) { errEl.textContent = 'صورة عداد الكيلومترات إجبارية'; return; }

  const body = {
    vehicleId: driverUser.vehicleId,
    plate:     driverUser.plate,
    photos: {
      front:      getPhotoData('prev-front'),
      back:       getPhotoData('prev-back'),
      right:      getPhotoData('prev-right'),
      left:       getPhotoData('prev-left'),
      inside:     getPhotoData('prev-inside'),
      odometer:   odoPhoto,
      oilSticker: getPhotoData('prev-oilsticker'),
    },
    tireCondition: document.getElementById('mr-tires').value,
    fuelLevel:     document.getElementById('mr-fuel').value,
    odometer:      document.getElementById('mr-odometer').value || null,
    notes:         document.getElementById('mr-notes').value.trim(),
  };
  try {
    const res  = await driverApiFetch('/monthly-reports', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'خطأ'; return; }
    alert('✅ تم رفع التقرير الشهري بنجاح');
    document.getElementById('form-monthly-report').reset();
    // Reset previews
    const PHOTO_LABELS = {
      'prev-front': 'أمام', 'prev-back': 'خلف', 'prev-right': 'يمين',
      'prev-left': 'يسار', 'prev-inside': 'داخل',
      'prev-odometer': 'عداد الكيلومترات *', 'prev-oilsticker': 'ستيكر بترومين',
    };
    Object.keys(PHOTO_LABELS).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = '📷';
      const small = document.createElement('small');
      small.textContent = PHOTO_LABELS[id];
      el.appendChild(small);
      delete el.dataset.dataUrl;
    });
    dpShow('home');
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  }
}

// ─── 3. Other request ────────────────────────────────────────────────────────
async function submitOtherRequest(e) {
  e.preventDefault();
  const errEl = document.getElementById('or-error');
  errEl.textContent = '';

  const photos = [];
  for (let i = 1; i <= 5; i++) {
    const d = getPhotoData('or-prev-' + i);
    if (d) photos.push(d);
  }

  const body = {
    type:        document.getElementById('or-type').value,
    description: document.getElementById('or-description').value.trim(),
    photos,
    vehicleId:   driverUser.vehicleId,
    plate:       driverUser.plate,
  };
  try {
    const res  = await driverApiFetch('/requests', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'خطأ'; return; }
    alert('✅ تم إرسال طلبك بنجاح — سيتم مراجعته من قِبل الإدارة');
    document.getElementById('form-other-request').reset();
    dpShow('home');
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  }
}

// ─── 4. Vehicle status ────────────────────────────────────────────────────────
async function loadDriverVehicleStatus() {
  const container = document.getElementById('dp-vehicle-status-content');
  if (!container) return;
  container.innerHTML = '<div class="coming-soon" style="padding:30px">جارٍ التحميل…</div>';
  try {
    const [reqRes, repRes] = await Promise.all([
      driverApiFetch('/requests/my/' + driverUser.vehicleId),
      driverApiFetch('/monthly-reports/' + driverUser.vehicleId),
    ]);
    const reqs  = reqRes.ok  ? await reqRes.json()  : [];
    const reps  = repRes.ok  ? await repRes.json()  : [];
    const latest = reps.length ? reps[reps.length - 1] : null;

    const maintenanceReqs = reqs.filter(r => r.type === 'maintenance' && r.status === 'approved');
    const lastMaintenance = maintenanceReqs.length ? maintenanceReqs[maintenanceReqs.length - 1] : null;

    container.innerHTML = `
      <div class="vehicle-status-grid">
        <div class="vs-card">
          <div class="vs-label">🔧 آخر صيانة مجدولة</div>
          <div class="vs-value">${lastMaintenance ? new Date(lastMaintenance.createdAt).toLocaleDateString('ar-SA') : '—'}</div>
        </div>
        <div class="vs-card">
          <div class="vs-label">📸 آخر تقرير شهري</div>
          <div class="vs-value">${latest ? new Date(latest.createdAt).toLocaleDateString('ar-SA') : 'لم يُرفع بعد'}</div>
        </div>
        <div class="vs-card">
          <div class="vs-label">⛽ آخر مستوى وقود</div>
          <div class="vs-value">${latest ? (FUEL_LABELS[latest.fuelLevel] || '—') : '—'}</div>
        </div>
        <div class="vs-card">
          <div class="vs-label">🛞 حالة الإطارات</div>
          <div class="vs-value">${latest ? (TIRE_LABELS[latest.tireCondition] || '—') : '—'}</div>
        </div>
        <div class="vs-card">
          <div class="vs-label">🚗 قراءة العداد</div>
          <div class="vs-value">${latest && latest.odometer ? latest.odometer + ' كم' : '—'}</div>
        </div>
        <div class="vs-card">
          <div class="vs-label">📋 الطلبات المعلقة</div>
          <div class="vs-value">${reqs.filter(r => r.status === 'pending').length}</div>
        </div>
      </div>`;
  } catch {
    container.innerHTML = '<div class="coming-soon" style="padding:30px">تعذّر تحميل البيانات</div>';
  }
}
