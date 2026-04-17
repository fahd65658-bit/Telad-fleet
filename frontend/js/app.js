
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
  admin:      ['dashboard', 'map', 'vehicles', 'cities', 'projects', 'employees', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'logs', 'users'],
  supervisor: ['dashboard', 'map', 'vehicles', 'cities', 'projects', 'employees', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai'],
  operator:   ['dashboard', 'map', 'vehicles', 'cities', 'projects', 'employees', 'maintenance'],
  viewer:     ['dashboard', 'map', 'cities', 'projects', 'employees'],
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
  if (!['admin', 'supervisor'].includes(currentUser.role)) {
    ['city-form-wrap', 'project-form-wrap', 'employee-form-wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
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
    cities:    loadCitiesSection,
    projects:  loadProjectsSection,
    employees: loadEmployeesSection,
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

// مدة التنبيه المسبق بالميلي ثانية (30 يوماً)
const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60 * 1000;

// إنشاء badge ملون للحالة مع التاريخ
function getStatusBadge(status, expiry) {
  const dateStr = expiry ? new Date(expiry).toLocaleDateString('ar-SA') : '';
  const now = new Date();
  const exp = expiry ? new Date(expiry) : null;
  const soon = exp && (exp - now) <= EXPIRY_WARNING_MS && exp >= now;

  let cls, label;
  if (status === 'valid' && soon) {
    cls   = 'status-warning';
    label = `⚠️ ينتهي قريباً${dateStr ? ' — ' + dateStr : ''}`;
  } else if (status === 'valid') {
    cls   = 'status-valid';
    label = `✔ ساري${dateStr ? ' — ' + dateStr : ''}`;
  } else if (status === 'expired') {
    cls   = 'status-expired';
    label = `✘ منتهي${dateStr ? ' — ' + dateStr : ''}`;
  } else {
    cls   = 'status-unknown';
    label = 'غير محدد';
  }
  return `<span class="${cls}">${label}</span>`;
}

async function loadVehicles() {
  const tbody = document.getElementById('vehicles-tbody');
  if (!tbody) return;
  try {
    const res      = await apiFetch('/vehicles');
    if (!res.ok) return;
    const vehicles = await res.json();
    const canEdit  = ['admin', 'supervisor'].includes(currentUser?.role);
    tbody.innerHTML = vehicles.length === 0
      ? '<tr><td colspan="7" class="tbl-empty">لا توجد مركبات مضافة بعد</td></tr>'
      : vehicles.map(v => `
          <tr>
            <td>${escHtml(v.name   || '—')}</td>
            <td>${escHtml(v.plate  || '—')}</td>
            <td>${escHtml(v.city   || '—')}</td>
            <td>${escHtml(v.driver || '—')}</td>
            <td>${getStatusBadge(v.inspection_status || 'unknown', v.inspection_expiry)}</td>
            <td>${getStatusBadge(v.insurance_status  || 'unknown', v.insurance_expiry)}</td>
            <td>${canEdit
              ? `<button class="btn-sm btn-danger" onclick="deleteVehicle('${escHtml(String(v.id))}')">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
    checkExpiringVehicles(vehicles);
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addVehicle(e) {
  e.preventDefault();
  const body = {
    name:               document.getElementById('v-name').value.trim(),
    plate:              document.getElementById('v-plate').value.trim(),
    city:               document.getElementById('v-city').value.trim(),
    driver:             document.getElementById('v-driver').value.trim(),
    inspection_status:  document.getElementById('v-inspection-status').value,
    inspection_expiry:  document.getElementById('v-inspection-expiry').value || null,
    insurance_status:   document.getElementById('v-insurance-status').value,
    insurance_expiry:   document.getElementById('v-insurance-expiry').value || null,
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

// تحقق من المركبات القريبة من الانتهاء وعرض تنبيه
function checkExpiringVehicles(vehicles) {
  const now  = new Date();
  const soon = new Date(now.getTime() + EXPIRY_WARNING_MS);
  const expiring = vehicles.filter(v => {
    const ie  = v.inspection_expiry ? new Date(v.inspection_expiry) : null;
    const ins = v.insurance_expiry  ? new Date(v.insurance_expiry)  : null;
    return (ie  && ie  >= now && ie  <= soon) ||
           (ins && ins >= now && ins <= soon);
  });
  if (expiring.length === 0) return;
  const names = expiring.map(v => v.plate || v.name).join('، ');
  const banner = document.getElementById('expiring-banner');
  if (banner) {
    banner.textContent = `⚠️ ${expiring.length} مركبة لديها فحص أو تأمين ينتهي خلال 30 يوم: ${names}`;
    banner.style.display = 'block';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CITIES
// ═══════════════════════════════════════════════════════════════════════════
let cachedCities = [];
let cachedProjects = [];
let cachedVehicles = [];

async function loadCities() {
  const res = await apiFetch('/cities');
  if (!res.ok) throw new Error('cities-load-failed');
  cachedCities = await res.json();
  syncCitySelects(cachedCities);
  return cachedCities;
}

function syncCitySelects(cities) {
  const select = document.getElementById('p-city-id');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">بدون ربط</option>' + cities.map(c =>
    `<option value="${escHtml(String(c.id))}">${escHtml(c.name || '—')}</option>`
  ).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

async function loadCitiesSection() {
  const tbody = document.getElementById('cities-tbody');
  if (!tbody) return;
  try {
    const cities = await loadCities();
    tbody.innerHTML = cities.length === 0
      ? '<tr><td colspan="3" class="tbl-empty">لا توجد مدن مضافة بعد</td></tr>'
      : cities.map(c => `
          <tr>
            <td>${escHtml(c.name || '—')}</td>
            <td>${escHtml(c.region || '—')}</td>
            <td>${escHtml(c.created_by || '—')}</td>
          </tr>`).join('');
    loadDashboardStats();
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" class="tbl-empty">تعذّر تحميل المدن</td></tr>';
  }
}

async function addCity(e) {
  e.preventDefault();
  const errEl = document.getElementById('city-form-error');
  errEl.textContent = '';
  const body = {
    name: document.getElementById('c-name').value.trim(),
    region: document.getElementById('c-region').value.trim(),
  };
  const res = await apiFetch('/cities', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || 'تعذّرت إضافة المدينة';
    return;
  }
  document.getElementById('form-city').reset();
  await loadCitiesSection();
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════════════
function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-SA');
}

function projectStatusLabel(status) {
  const labels = {
    active: 'نشط',
    planned: 'مخطط',
    completed: 'مكتمل',
    paused: 'متوقف',
  };
  return labels[status] || status || '—';
}

function employeeStatusLabel(status) {
  const labels = {
    active: 'نشط',
    inactive: 'غير نشط',
    leave: 'إجازة',
  };
  return labels[status] || status || '—';
}

async function loadProjects() {
  const res = await apiFetch('/projects');
  if (!res.ok) throw new Error('projects-load-failed');
  cachedProjects = await res.json();
  syncProjectSelects(cachedProjects);
  return cachedProjects;
}

function cityNameById(cityId) {
  const match = cachedCities.find(c => String(c.id) === String(cityId));
  return match?.name || '—';
}

function syncProjectSelects(projects) {
  const select = document.getElementById('e-project-id');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">بدون ربط</option>' + projects.map(p =>
    `<option value="${escHtml(String(p.id))}">${escHtml(p.name || '—')}</option>`
  ).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

async function loadProjectsSection() {
  const tbody = document.getElementById('projects-tbody');
  if (!tbody) return;
  try {
    await loadCities();
    const projects = await loadProjects();
    tbody.innerHTML = projects.length === 0
      ? '<tr><td colspan="5" class="tbl-empty">لا توجد مشاريع مضافة بعد</td></tr>'
      : projects.map(p => `
          <tr>
            <td>${escHtml(p.name || '—')}</td>
            <td>${escHtml(cityNameById(p.city_id))}</td>
            <td>${escHtml(projectStatusLabel(p.status))}</td>
            <td>${formatDate(p.start_date)}</td>
            <td>${formatDate(p.end_date)}</td>
          </tr>`).join('');
    loadDashboardStats();
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">تعذّر تحميل المشاريع</td></tr>';
  }
}

async function addProject(e) {
  e.preventDefault();
  const errEl = document.getElementById('project-form-error');
  errEl.textContent = '';
  const body = {
    name: document.getElementById('p-name').value.trim(),
    city_id: document.getElementById('p-city-id').value || null,
    status: document.getElementById('p-status').value,
    start_date: document.getElementById('p-start-date').value || null,
    end_date: document.getElementById('p-end-date').value || null,
  };
  const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || 'تعذّرت إضافة المشروع';
    return;
  }
  document.getElementById('form-project').reset();
  document.getElementById('p-status').value = 'active';
  await loadProjectsSection();
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════
async function loadVehicleOptions() {
  const res = await apiFetch('/vehicles');
  if (!res.ok) throw new Error('vehicles-load-failed');
  cachedVehicles = await res.json();
  syncVehicleSelects(cachedVehicles);
}

function syncVehicleSelects(vehicles) {
  const select = document.getElementById('e-vehicle-id');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">بدون ربط</option>' + vehicles.map(v =>
    `<option value="${escHtml(String(v.id))}">${escHtml(v.plate || v.name || '—')}</option>`
  ).join('');
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

async function loadEmployeesSection() {
  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;
  try {
    await Promise.all([loadProjects(), loadVehicleOptions()]);
    const res = await apiFetch('/employees');
    if (!res.ok) throw new Error('employees-load-failed');
    const employees = await res.json();
    tbody.innerHTML = employees.length === 0
      ? '<tr><td colspan="5" class="tbl-empty">لا يوجد موظفون مضافون بعد</td></tr>'
      : employees.map(emp => `
          <tr>
            <td>${escHtml(emp.name || '—')}</td>
            <td>${escHtml(emp.role || '—')}</td>
            <td>${escHtml(emp.phone || '—')}</td>
            <td>${escHtml(emp.city || '—')}</td>
            <td>${escHtml(employeeStatusLabel(emp.status))}</td>
          </tr>`).join('');
    loadDashboardStats();
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">تعذّر تحميل الموظفين</td></tr>';
  }
}

async function addEmployee(e) {
  e.preventDefault();
  const errEl = document.getElementById('employee-form-error');
  errEl.textContent = '';
  const body = {
    name: document.getElementById('e-name').value.trim(),
    role: document.getElementById('e-role').value.trim(),
    phone: document.getElementById('e-phone').value.trim(),
    national_id: document.getElementById('e-national-id').value.trim(),
    city: document.getElementById('e-city').value.trim(),
    project_id: document.getElementById('e-project-id').value || null,
    vehicle_id: document.getElementById('e-vehicle-id').value || null,
    status: document.getElementById('e-status').value,
  };
  const res = await apiFetch('/employees', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || 'تعذّرت إضافة الموظف';
    return;
  }
  document.getElementById('form-employee').reset();
  document.getElementById('e-status').value = 'active';
  await loadEmployeesSection();
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
