
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
  admin:      ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial', 'reports', 'ai', 'logs', 'users', 'devRequests'],
  supervisor: ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial', 'reports', 'ai'],
  operator:   ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments'],
  viewer:     ['dashboard', 'map'],
};

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;

// ─── Skew Protection ─────────────────────────────────────────────────────────
// _serverDeployId: the X-Deploy-Id value received from the first API response.
// If any later response carries a *different* value, the server was redeployed
// while the user was on the page → show the reload banner.
let _serverDeployId = null;

function _showSkewBanner() {
  const banner = document.getElementById('skew-banner');
  if (banner && banner.style.display === 'none') {
    banner.style.display = 'block';
  }
}

function _checkDeployId(res) {
  const id = res.headers.get('X-Deploy-Id');
  if (!id) return;
  if (!_serverDeployId) {
    _serverDeployId = id;   // establish baseline on first response
  } else if (_serverDeployId !== id) {
    _showSkewBanner();      // deployment changed — notify user
  }
}

// Detect stale static assets (JS / CSS 404 after a redeploy that renames files)
window.addEventListener('error', (e) => {
  const el = e.target;
  if (el && (el.tagName === 'SCRIPT' || el.tagName === 'LINK')) {
    _showSkewBanner();
  }
}, true /* capture phase — fires before bubbling */);

// Wire the banner reload button (HTML is in index.html, so wait for DOM)
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('skew-reload-btn');
  if (btn) btn.addEventListener('click', () => location.reload());
});

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  // ── Skew Protection: prime the baseline deploy ID before any auth call ──
  // Uses a fire-and-forget fetch to /version so the very first response sets
  // _serverDeployId.  Subsequent apiFetch() calls then detect any change.
  fetch(API_BASE + '/version').then(r => { _checkDeployId(r); }).catch(() => {});

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
    dashboard:    loadDashboardStats,
    vehicles:     loadVehicles,
    drivers:      loadDrivers,
    maintenance:  loadMaintenance,
    appointments: loadAppointments,
    regions:      loadRegions,
    accidents:    loadAccidents,
    violations:   loadViolations,
    financial:    loadFinancial,
    reports:      loadReports,
    users:        loadUsers,
    logs:         loadLogs,
    devRequests:  loadDevRequests,
  };
  if (loaders[section]) loaders[section]();

  if (section === 'map') {
    initMap();
    connectGPS();
  }
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
  }).then(res => {
    _checkDeployId(res);   // Skew Protection: check deploy ID on every response
    return res;
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
    set('stat-vehicles',     d.vehicles);
    set('stat-drivers',      d.drivers);
    set('stat-employees',    d.employees);
    set('stat-maintenance',  d.maintenance);
    set('stat-appointments', d.appointments);
    set('stat-cities',       d.cities);
    set('stat-projects',     d.projects);
    set('stat-regions',      d.regions);
    set('stat-accidents',    d.accidents);
    set('stat-violations',   d.violationsUnpaid);
    set('stat-financial',    d.financialMonth);
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
              ? `<button class="btn-sm btn-danger" data-action="delete-vehicle" data-id="${escHtml(String(v.id))}">حذف</button>`
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
            <td>${formatDateTime(l.time)}</td>
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
            ? `<button class="btn-sm btn-warn"   data-action="toggle-user"  data-id="${escHtml(String(u.id))}" data-active="${!u.active}">${u.active ? 'تعطيل' : 'تفعيل'}</button>
               <button class="btn-sm btn-danger" data-action="delete-user"  data-id="${escHtml(String(u.id))}">حذف</button>`
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
// DRIVERS
// ═══════════════════════════════════════════════════════════════════════════
async function loadDrivers() {
  const tbody = document.getElementById('drivers-tbody');
  if (!tbody) return;
  try {
    const res     = await apiFetch('/drivers');
    if (!res.ok) return;
    const drivers = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);
    tbody.innerHTML = drivers.length === 0
      ? '<tr><td colspan="6" class="tbl-empty">لا يوجد سائقون مضافون بعد</td></tr>'
      : drivers.map(d => `
          <tr>
            <td>${escHtml(d.name || '—')}</td>
            <td>${escHtml(d.phone || '—')}</td>
            <td>${escHtml(d.licenseNo || '—')}</td>
            <td>${formatDate(d.licenseExpiry)}</td>
            <td><span class="badge-${d.status === 'active' ? 'active' : 'inactive'}">${d.status === 'active' ? '✔ نشط' : '✘ غير نشط'}</span></td>
            <td>${canEdit
              ? `<button class="btn-sm btn-danger" data-action="delete-driver" data-id="${escHtml(String(d.id))}">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addDriver(e) {
  e.preventDefault();
  const body = {
    name:          document.getElementById('d-name').value.trim(),
    phone:         document.getElementById('d-phone').value.trim(),
    licenseNo:     document.getElementById('d-licenseNo').value.trim(),
    licenseExpiry: document.getElementById('d-licenseExpiry').value || null,
  };
  const res = await apiFetch('/drivers', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-driver').reset();
    loadDrivers();
    loadDashboardStats();
  }
}

async function deleteDriver(id) {
  if (!confirm('هل تريد حذف هذا السائق؟')) return;
  const res = await apiFetch('/drivers/' + id, { method: 'DELETE' });
  if (res.ok) { loadDrivers(); loadDashboardStats(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE
// ═══════════════════════════════════════════════════════════════════════════
async function loadMaintenance() {
  const tbody = document.getElementById('maintenance-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/maintenance');
    if (!res.ok) return;
    const jobs = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);
    const statusLabel = { pending: 'معلّق', in_progress: 'جارٍ', completed: 'مكتمل', cancelled: 'ملغى' };
    tbody.innerHTML = jobs.length === 0
      ? '<tr><td colspan="7" class="tbl-empty">لا توجد مهام صيانة</td></tr>'
      : jobs.map(j => `
          <tr>
            <td>${escHtml(j.vehicleId || '—')}</td>
            <td>${escHtml(j.type || '—')}</td>
            <td>${escHtml(j.description || '—')}</td>
            <td>${formatDate(j.scheduledDate)}</td>
            <td>${j.cost != null ? j.cost + ' ر.س' : '—'}</td>
            <td>${statusLabel[j.status] || j.status}</td>
            <td>${canEdit && j.status !== 'completed'
              ? `<button class="btn-sm btn-warn" data-action="complete-maintenance" data-id="${escHtml(String(j.id))}">إتمام</button>
                 <button class="btn-sm btn-danger" data-action="delete-maintenance" data-id="${escHtml(String(j.id))}">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addMaintenance(e) {
  e.preventDefault();
  const body = {
    vehicleId:     document.getElementById('m-vehicleId').value.trim(),
    type:          document.getElementById('m-type').value.trim(),
    description:   document.getElementById('m-description').value.trim(),
    scheduledDate: document.getElementById('m-scheduledDate').value || null,
    cost:          document.getElementById('m-cost').value ? Number(document.getElementById('m-cost').value) : null,
  };
  const res = await apiFetch('/maintenance', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-maintenance').reset();
    loadMaintenance();
    loadDashboardStats();
  }
}

async function completeMaintenance(id) {
  if (!confirm('هل تريد تمييز هذه المهمة كمكتملة؟')) return;
  const res = await apiFetch('/maintenance/' + id + '/complete', { method: 'POST', body: JSON.stringify({}) });
  if (res.ok) { loadMaintenance(); loadDashboardStats(); }
}

async function deleteMaintenance(id) {
  if (!confirm('هل تريد حذف مهمة الصيانة؟')) return;
  const res = await apiFetch('/maintenance/' + id, { method: 'DELETE' });
  if (res.ok) { loadMaintenance(); loadDashboardStats(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════
async function loadAppointments() {
  const tbody = document.getElementById('appointments-tbody');
  if (!tbody) return;
  try {
    const res   = await apiFetch('/appointments');
    if (!res.ok) return;
    const appts = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);
    const statusLabel = { pending: 'معلّق', confirmed: 'مؤكّد', cancelled: 'ملغى', completed: 'مكتمل' };
    tbody.innerHTML = appts.length === 0
      ? '<tr><td colspan="6" class="tbl-empty">لا توجد مواعيد</td></tr>'
      : appts.map(a => `
          <tr>
            <td>${escHtml(a.vehicleId || '—')}</td>
            <td>${escHtml(a.type || '—')}</td>
            <td>${formatDateTime(a.scheduledAt)}</td>
            <td>${escHtml(a.notes || '—')}</td>
            <td>${statusLabel[a.status] || a.status}</td>
            <td>${canEdit && a.status === 'pending'
              ? `<button class="btn-sm btn-warn" data-action="confirm-appointment" data-id="${escHtml(String(a.id))}">تأكيد</button>
                 <button class="btn-sm btn-danger" data-action="cancel-appointment" data-id="${escHtml(String(a.id))}">إلغاء</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addAppointment(e) {
  e.preventDefault();
  const body = {
    vehicleId:   document.getElementById('a-vehicleId').value.trim(),
    type:        document.getElementById('a-type').value.trim(),
    scheduledAt: document.getElementById('a-scheduledAt').value,
    notes:       document.getElementById('a-notes').value.trim(),
  };
  const res = await apiFetch('/appointments', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-appointment').reset();
    loadAppointments();
    loadDashboardStats();
  }
}

async function confirmAppointment(id) {
  const res = await apiFetch('/appointments/' + id + '/confirm', { method: 'POST', body: JSON.stringify({}) });
  if (res.ok) { loadAppointments(); loadDashboardStats(); }
}

async function cancelAppointment(id) {
  if (!confirm('هل تريد إلغاء هذا الموعد؟')) return;
  const res = await apiFetch('/appointments/' + id + '/cancel', { method: 'POST', body: JSON.stringify({}) });
  if (res.ok) { loadAppointments(); loadDashboardStats(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGIONS
// ═══════════════════════════════════════════════════════════════════════════
async function loadRegions() {
  const tbody = document.getElementById('regions-tbody');
  if (!tbody) return;
  try {
    const res     = await apiFetch('/regions');
    if (!res.ok) return;
    const regions = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);
    tbody.innerHTML = regions.length === 0
      ? '<tr><td colspan="4" class="tbl-empty">لا توجد مناطق مضافة بعد</td></tr>'
      : regions.map(r => `
          <tr>
            <td>${escHtml(r.name || '—')}</td>
            <td>${escHtml(r.description || '—')}</td>
            <td>${formatDate(r.createdAt)}</td>
            <td>${canEdit
              ? `<button class="btn-sm btn-danger" data-action="delete-region" data-id="${escHtml(String(r.id))}">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addRegion(e) {
  e.preventDefault();
  const body = {
    name:        document.getElementById('r-name').value.trim(),
    description: document.getElementById('r-description').value.trim(),
  };
  const res = await apiFetch('/regions', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-region').reset();
    loadRegions();
    loadDashboardStats();
  }
}

async function deleteRegion(id) {
  if (!confirm('هل تريد حذف هذه المنطقة؟')) return;
  const res = await apiFetch('/regions/' + id, { method: 'DELETE' });
  if (res.ok) { loadRegions(); loadDashboardStats(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════
async function loadReports() {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;
  try {
    const res     = await apiFetch('/reports');
    if (!res.ok) return;
    const reports = await res.json();
    tbody.innerHTML = reports.length === 0
      ? '<tr><td colspan="4" class="tbl-empty">لا توجد تقارير بعد</td></tr>'
      : [...reports].reverse().map(r => `
          <tr>
            <td>${escHtml(r.title || '—')}</td>
            <td>${escHtml(r.type || '—')}</td>
            <td>${escHtml(r.createdBy || '—')}</td>
            <td>${formatDateTime(r.createdAt)}</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function generateReport() {
  const title = document.getElementById('rep-title').value.trim();
  const type  = document.getElementById('rep-type').value;
  if (!title) { alert('يرجى إدخال عنوان التقرير'); return; }
  const res = await apiFetch('/reports/generate', { method: 'POST', body: JSON.stringify({ title, type }) });
  if (res.ok) {
    document.getElementById('rep-title').value = '';
    loadReports();
  }
}

async function loadAnalytics() {
  const panel = document.getElementById('analytics-panel');
  const cards = document.getElementById('analytics-cards');
  if (!panel || !cards) return;
  try {
    const res = await apiFetch('/reports/analytics');
    if (!res.ok) return;
    const d = await res.json();
    const s = d.summary || {};
    cards.innerHTML = [
      { icon: '🚗', label: 'المركبات',          val: s.vehicles           ?? 0 },
      { icon: '🧑‍✈️', label: 'السائقون',         val: s.drivers            ?? 0 },
      { icon: '🔧', label: 'صيانة معلّقة',       val: s.maintenancePending ?? 0 },
      { icon: '✅', label: 'صيانة مكتملة',       val: s.maintenanceDone    ?? 0 },
      { icon: '📅', label: 'مواعيد معلّقة',      val: s.appointmentsPending ?? 0 },
      { icon: '🗺️', label: 'المناطق',           val: s.regions            ?? 0 },
    ].map(c => `
      <div class="card">
        <div class="card-icon">${c.icon}</div>
        <div class="card-label">${c.label}</div>
        <div class="card-value">${c.val}</div>
      </div>`).join('');
    panel.style.display = 'block';
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toISOString().split('T')[0];
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toISOString().replace('T', ' ').slice(0, 16);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT DELEGATION — handles all data-action buttons in tables
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  switch (action) {
    case 'delete-vehicle':
      await deleteVehicle(id);
      break;
    case 'delete-driver':
      await deleteDriver(id);
      break;
    case 'complete-maintenance':
      await completeMaintenance(id);
      break;
    case 'delete-maintenance':
      await deleteMaintenance(id);
      break;
    case 'confirm-appointment':
      await confirmAppointment(id);
      break;
    case 'cancel-appointment':
      await cancelAppointment(id);
      break;
    case 'delete-region':
      await deleteRegion(id);
      break;
    case 'toggle-user':
      await toggleUser(id, btn.dataset.active === 'true');
      break;
    case 'delete-user':
      await deleteUser(id);
      break;
    case 'close-accident':
      await closeAccident(id);
      break;
    case 'delete-accident':
      await deleteAccident(id);
      break;
    case 'pay-violation':
      await payViolation(id);
      break;
    case 'delete-violation':
      await deleteViolation(id);
      break;
    case 'delete-financial':
      await deleteFinancial(id);
      break;
    case 'delete-dev-request':
      await deleteDevRequest(id);
      break;
    case 'update-dev-status':
      await updateDevRequestStatus(id, btn.dataset.status);
      break;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';
  toast.style.cssText = `background:${bg};color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.2);font-size:14px;min-width:200px;transition:opacity .3s`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCIDENTS
// ═══════════════════════════════════════════════════════════════════════════
async function loadAccidents() {
  const tbody = document.getElementById('accidents-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/accidents');
    if (!res.ok) return;
    const list = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="8" class="tbl-empty">لا توجد حوادث مسجّلة</td></tr>'
      : list.map(a => `
          <tr>
            <td>${escHtml(a.vehicleId || '—')}</td>
            <td>${escHtml(a.date || '—')}</td>
            <td>${escHtml(a.location || '—')}</td>
            <td>${escHtml(a.description || '—')}</td>
            <td>${a.injuriesCount ?? 0}</td>
            <td>${(Number(a.damageAmount) || 0).toFixed(2)}</td>
            <td><span class="badge-${a.status === 'open' ? 'active' : 'inactive'}">${a.status === 'open' ? '🔴 مفتوح' : '✅ مغلق'}</span></td>
            <td>${canEdit
              ? `${a.status === 'open' ? `<button class="btn-sm btn-warn" data-action="close-accident" data-id="${escHtml(String(a.id))}">إغلاق</button> ` : ''}
                 <button class="btn-sm btn-danger" data-action="delete-accident" data-id="${escHtml(String(a.id))}">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addAccident(e) {
  e.preventDefault();
  const errEl = document.getElementById('accident-form-error');
  errEl.textContent = '';
  const vehicleId  = document.getElementById('acc-vehicleId').value.trim();
  const description = document.getElementById('acc-description').value.trim();
  if (!vehicleId || !description) { errEl.textContent = 'معرّف المركبة والوصف مطلوبان'; return; }
  const body = {
    vehicleId,
    date:         document.getElementById('acc-date').value,
    location:     document.getElementById('acc-location').value.trim(),
    description,
    injuriesCount: Number(document.getElementById('acc-injuries').value) || 0,
    damageAmount:  Number(document.getElementById('acc-damage').value)   || 0,
  };
  const res = await apiFetch('/accidents', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-accident').reset();
    loadAccidents();
    loadDashboardStats();
    showToast('تم تسجيل الحادث بنجاح');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'حدث خطأ';
  }
}

async function closeAccident(id) {
  if (!confirm('هل تريد إغلاق هذا الحادث؟')) return;
  const res = await apiFetch('/accidents/' + id, { method: 'PUT', body: JSON.stringify({ status: 'closed' }) });
  if (res.ok) { loadAccidents(); showToast('تم إغلاق الحادث'); }
}

async function deleteAccident(id) {
  if (!confirm('هل تريد حذف هذا الحادث؟')) return;
  const res = await apiFetch('/accidents/' + id, { method: 'DELETE' });
  if (res.ok) { loadAccidents(); loadDashboardStats(); showToast('تم حذف الحادث', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIOLATIONS
// ═══════════════════════════════════════════════════════════════════════════
async function loadViolations() {
  const tbody = document.getElementById('violations-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/violations');
    if (!res.ok) return;
    const list = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);
    const statusLabel = { unpaid: '⚠️ غير مسددة', paid: '✅ مسددة', disputed: '⚖️ متنازع عليها' };
    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="7" class="tbl-empty">لا توجد مخالفات مسجّلة</td></tr>'
      : list.map(v => `
          <tr>
            <td>${escHtml(v.vehicleId || '—')}</td>
            <td>${escHtml(v.date || '—')}</td>
            <td>${escHtml(v.type || '—')}</td>
            <td>${(Number(v.amount) || 0).toFixed(2)} ر.س</td>
            <td>${escHtml(v.description || '—')}</td>
            <td>${statusLabel[v.status] || v.status}</td>
            <td>${canEdit
              ? `${v.status === 'unpaid' ? `<button class="btn-sm btn-warn" data-action="pay-violation" data-id="${escHtml(String(v.id))}">تسديد</button> ` : ''}
                 <button class="btn-sm btn-danger" data-action="delete-violation" data-id="${escHtml(String(v.id))}">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addViolation(e) {
  e.preventDefault();
  const errEl = document.getElementById('violation-form-error');
  errEl.textContent = '';
  const vehicleId = document.getElementById('vio-vehicleId').value.trim();
  const type      = document.getElementById('vio-type').value.trim();
  const amount    = document.getElementById('vio-amount').value;
  if (!vehicleId || !type || !amount) { errEl.textContent = 'معرّف المركبة والنوع والمبلغ مطلوبة'; return; }
  const body = {
    vehicleId,
    date:        document.getElementById('vio-date').value,
    type,
    amount:      Number(amount),
    description: document.getElementById('vio-description').value.trim(),
  };
  const res = await apiFetch('/violations', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-violation').reset();
    loadViolations();
    loadDashboardStats();
    showToast('تم تسجيل المخالفة بنجاح');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'حدث خطأ';
  }
}

async function payViolation(id) {
  if (!confirm('هل تريد تسديد هذه المخالفة؟')) return;
  const res = await apiFetch('/violations/' + id + '/pay', { method: 'POST', body: JSON.stringify({}) });
  if (res.ok) { loadViolations(); loadDashboardStats(); showToast('تم تسديد المخالفة'); }
}

async function deleteViolation(id) {
  if (!confirm('هل تريد حذف هذه المخالفة؟')) return;
  const res = await apiFetch('/violations/' + id, { method: 'DELETE' });
  if (res.ok) { loadViolations(); loadDashboardStats(); showToast('تم حذف المخالفة', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL
// ═══════════════════════════════════════════════════════════════════════════
const FIN_LABELS = { fuel: 'وقود', maintenance: 'صيانة', violation: 'مخالفة', salary: 'راتب', other: 'أخرى' };

async function loadFinancial() {
  const tbody = document.getElementById('financial-tbody');
  const summary = document.getElementById('financial-summary');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/financial');
    if (!res.ok) return;
    const list = await res.json();
    const canEdit = ['admin', 'supervisor'].includes(currentUser?.role);

    // Summary
    const total  = list.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const byType = {};
    list.forEach(f => { byType[f.type] = (byType[f.type] || 0) + (Number(f.amount) || 0); });
    if (summary) {
      summary.innerHTML = `<div class="cards">` +
        Object.entries(byType).map(([t, v]) => `
          <div class="card"><div class="card-icon">💳</div>
            <div class="card-label">${FIN_LABELS[t] || t}</div>
            <div class="card-value">${v.toFixed(2)} ر.س</div>
          </div>`).join('') +
        `<div class="card"><div class="card-icon">💰</div>
            <div class="card-label">الإجمالي</div>
            <div class="card-value">${total.toFixed(2)} ر.س</div>
          </div></div>`;
    }

    tbody.innerHTML = list.length === 0
      ? '<tr><td colspan="7" class="tbl-empty">لا توجد معاملات مالية</td></tr>'
      : [...list].reverse().map(f => `
          <tr>
            <td>${FIN_LABELS[f.type] || f.type}</td>
            <td>${(Number(f.amount) || 0).toFixed(2)} ر.س</td>
            <td>${escHtml(f.description || '—')}</td>
            <td>${escHtml(f.vehicleId || '—')}</td>
            <td>${escHtml(f.date || '—')}</td>
            <td>${escHtml(f.receiptNo || '—')}</td>
            <td>${canEdit
              ? `<button class="btn-sm btn-danger" data-action="delete-financial" data-id="${escHtml(String(f.id))}">حذف</button>`
              : '—'
            }</td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

async function addFinancial(e) {
  e.preventDefault();
  const errEl = document.getElementById('financial-form-error');
  errEl.textContent = '';
  const amount      = document.getElementById('fin-amount').value;
  const description = document.getElementById('fin-description').value.trim();
  const date        = document.getElementById('fin-date').value;
  if (!amount || !description || !date) { errEl.textContent = 'المبلغ والوصف والتاريخ مطلوبة'; return; }
  const body = {
    type:        document.getElementById('fin-type').value,
    amount:      Number(amount),
    description,
    vehicleId:   document.getElementById('fin-vehicleId').value.trim() || null,
    date,
    receiptNo:   document.getElementById('fin-receiptNo').value.trim(),
  };
  const res = await apiFetch('/financial', { method: 'POST', body: JSON.stringify(body) });
  if (res.ok) {
    document.getElementById('form-financial').reset();
    loadFinancial();
    loadDashboardStats();
    showToast('تمت إضافة المعاملة المالية');
  } else {
    const d = await res.json();
    errEl.textContent = d.error || 'حدث خطأ';
  }
}

async function deleteFinancial(id) {
  if (!confirm('هل تريد حذف هذه المعاملة المالية؟')) return;
  const res = await apiFetch('/financial/' + id, { method: 'DELETE' });
  if (res.ok) { loadFinancial(); loadDashboardStats(); showToast('تم حذف المعاملة', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INSIGHTS & CHAT
// ═══════════════════════════════════════════════════════════════════════════
async function loadAIInsights() {
  try {
    const res = await apiFetch('/ai/insights');
    if (!res.ok) { showToast('تعذّر تحميل التحليلات', 'error'); return; }
    const d = await res.json();

    // Summary cards
    const cardsEl = document.getElementById('ai-summary-cards');
    const s = d.summary || {};
    const scoreColor = s.healthScore >= 80 ? '#22c55e' : s.healthScore >= 50 ? '#f59e0b' : '#ef4444';
    if (cardsEl) {
      cardsEl.innerHTML = [
        { icon: '💪', label: 'صحة الأسطول', val: `<span style="color:${scoreColor};font-size:1.4em;font-weight:700">${s.healthScore ?? 0}%</span>` },
        { icon: '🚗', label: 'المركبات النشطة', val: `${s.activeVehicles ?? 0} / ${s.totalVehicles ?? 0}` },
        { icon: '🔧', label: 'صيانة معلّقة', val: s.pendingMaintenance ?? 0 },
        { icon: '🚦', label: 'مخالفات غير مسددة', val: s.unpaidViolations ?? 0 },
        { icon: '⚠️', label: 'حوادث مفتوحة', val: s.openAccidents ?? 0 },
      ].map(c => `
        <div class="card">
          <div class="card-icon">${c.icon}</div>
          <div class="card-label">${c.label}</div>
          <div class="card-value">${c.val}</div>
        </div>`).join('');
    }
    document.getElementById('ai-health-panel').style.display = 'block';

    // Alerts
    const alertsEl   = document.getElementById('ai-alerts-list');
    const alertsWrap = document.getElementById('ai-alerts-wrap');
    if (alertsEl && d.alerts?.length) {
      alertsEl.innerHTML = d.alerts.map(a => `
        <div style="padding:10px 16px;margin-bottom:8px;border-radius:6px;background:${a.type === 'danger' ? '#fee2e2' : '#fef3c7'};border-right:4px solid ${a.type === 'danger' ? '#ef4444' : '#f59e0b'}">
          ${a.type === 'danger' ? '🔴' : '⚠️'} ${escHtml(a.message)}
        </div>`).join('');
      alertsWrap.style.display = 'block';
    } else if (alertsWrap) {
      alertsWrap.style.display = 'none';
    }

    // Recommendations
    const recsEl   = document.getElementById('ai-recommendations-list');
    const recsWrap = document.getElementById('ai-recommendations-wrap');
    if (recsEl && d.recommendations?.length) {
      recsEl.innerHTML = d.recommendations.map(r => `
        <div style="padding:10px 16px;margin-bottom:8px;border-radius:6px;background:#eff6ff;border-right:4px solid #3b82f6">
          ${escHtml(r.icon || '💡')} ${escHtml(r.message)}
        </div>`).join('');
      recsWrap.style.display = 'block';
    } else if (recsWrap) {
      recsWrap.style.display = 'none';
    }
  } catch {
    showToast('خطأ في تحميل التحليلات', 'error');
  }
}

async function askAI() {
  const input   = document.getElementById('ai-question');
  const answerEl = document.getElementById('ai-answer');
  const question = input?.value.trim();
  if (!question) { showToast('يرجى كتابة سؤالك', 'info'); return; }
  answerEl.style.display = 'none';
  try {
    const res = await apiFetch('/ai/query', { method: 'POST', body: JSON.stringify({ question }) });
    if (!res.ok) { showToast('تعذّر الحصول على إجابة', 'error'); return; }
    const d = await res.json();
    answerEl.textContent   = d.answer || 'لا توجد إجابة';
    answerEl.style.display = 'block';
  } catch {
    showToast('خطأ في الاتصال', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GPS MAP
// ═══════════════════════════════════════════════════════════════════════════
let fleetMap = null;
const vehicleMarkers = {};
let gpsSocketConnected = false;

function initMap() {
  if (fleetMap) { fleetMap.invalidateSize(); return; }
  if (typeof L === 'undefined') return;
  fleetMap = L.map('fleet-map').setView([24.7136, 46.6753], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(fleetMap);
}

function connectGPS() {
  if (gpsSocketConnected || typeof io === 'undefined') return;
  gpsSocketConnected = true;
  try {
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socket.on('gps-stream', data => {
      if (!fleetMap) return;
      const { vehicleId, lat, lng, label } = data;
      if (!lat || !lng) return;
      if (vehicleMarkers[vehicleId]) {
        vehicleMarkers[vehicleId].setLatLng([lat, lng]);
      } else {
        vehicleMarkers[vehicleId] = L.marker([lat, lng])
          .addTo(fleetMap)
          .bindPopup(label || vehicleId);
      }
    });
  } catch { gpsSocketConnected = false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEV REQUESTS — AI-powered development request panel (admin only)
// ═══════════════════════════════════════════════════════════════════════════
const DEV_STATUS_LABELS = {
  'مفتوح':       { cls: 'badge-active',   icon: '🟢' },
  'قيد التنفيذ': { cls: 'badge-warn',     icon: '🔵' },
  'مكتمل':       { cls: 'badge-active',   icon: '✅' },
  'مرفوض':       { cls: 'badge-inactive', icon: '🔴' },
};

const DEV_PRIORITY_COLORS = {
  'عالية':   '#ef4444',
  'متوسطة': '#f59e0b',
  'منخفضة': '#22c55e',
};

async function loadDevRequests() {
  const tbody = document.getElementById('dev-requests-tbody');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/dev-requests');
    if (!res.ok) return;
    const list = await res.json();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">لا توجد طلبات بعد — أضف أول طلب تطوير أعلاه</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(r => {
      const sl    = DEV_STATUS_LABELS[r.status] || { cls: 'badge-active', icon: '❓' };
      const pCol  = DEV_PRIORITY_COLORS[r.priority] || '#94a3b8';
      const ghBtn = r.githubIssue
        ? `<a href="${escHtml(r.githubIssue.url)}" target="_blank" rel="noopener noreferrer"
              style="color:#3b82f6;text-decoration:none;font-size:12px">
             #${r.githubIssue.number} ↗
           </a>`
        : '<span style="color:#94a3b8;font-size:12px">—</span>';

      const statusOptions = ['مفتوح', 'قيد التنفيذ', 'مكتمل', 'مرفوض']
        .filter(s => s !== r.status)
        .map(s => `<button class="btn-sm" style="font-size:11px;padding:2px 8px;background:#e2e8f0;border:none;border-radius:4px;cursor:pointer;margin-bottom:2px"
                    data-action="update-dev-status" data-id="${escHtml(r.id)}" data-status="${escHtml(s)}">${s}</button>`)
        .join('');

      return `<tr>
        <td style="max-width:220px;font-size:13px" title="${escHtml(r.request)}">${escHtml(r.title)}</td>
        <td style="font-size:12px">${escHtml(r.category)}</td>
        <td><span style="background:${pCol}22;color:${pCol};padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600">${escHtml(r.priority)}</span></td>
        <td style="font-size:12px">${escHtml(r.complexity)}</td>
        <td><span class="${sl.cls}" style="font-size:12px">${sl.icon} ${escHtml(r.status)}</span></td>
        <td>${ghBtn}</td>
        <td style="font-size:12px">${formatDate(r.createdAt)}</td>
        <td style="white-space:nowrap">
          <div style="display:flex;flex-direction:column;gap:3px">
            ${statusOptions}
            <button class="btn-sm btn-danger" style="font-size:11px;padding:2px 8px"
                    data-action="delete-dev-request" data-id="${escHtml(r.id)}">حذف</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">تعذّر تحميل الطلبات</td></tr>';
  }
}

async function submitDevRequest(e) {
  e.preventDefault();
  const text   = document.getElementById('dev-req-text').value.trim();
  const errEl  = document.getElementById('dev-req-error');
  const btn    = document.getElementById('btn-dev-submit');
  const result = document.getElementById('dev-req-result');
  const body   = document.getElementById('dev-req-result-body');

  errEl.textContent    = '';
  result.style.display = 'none';
  if (!text) { errEl.textContent = 'يرجى كتابة وصف الطلب'; return; }

  btn.disabled    = true;
  btn.textContent = '⏳ الذكاء الاصطناعي يحلل الطلب…';

  try {
    const res  = await apiFetch('/dev-requests', { method: 'POST', body: JSON.stringify({ request: text }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'فشل إرسال الطلب'; return; }

    document.getElementById('form-dev-request').reset();
    result.style.display = 'block';
    const ghLine = data.githubIssue
      ? `• Issue GitHub: <a href="${escHtml(data.githubIssue.url)}" target="_blank" rel="noopener noreferrer">#${data.githubIssue.number}</a>`
      : '• GitHub Issue: لم يُفعَّل (يحتاج GITHUB_TOKEN في .env)';
    body.innerHTML = `
      • العنوان: ${escHtml(data.title)}<br>
      • الفئة: ${escHtml(data.category)}<br>
      • الأولوية: ${escHtml(data.priority)} &nbsp;|&nbsp; التعقيد: ${escHtml(data.complexity)}<br>
      ${ghLine}
    `;
    showToast('تم إرسال الطلب وتحليله بنجاح ✅');
    loadDevRequests();
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  } finally {
    btn.disabled    = false;
    btn.textContent = '🤖 تحليل وإرسال الطلب';
  }
}

async function updateDevRequestStatus(id, status) {
  const res = await apiFetch('/dev-requests/' + id + '/status', {
    method: 'PUT',
    body:   JSON.stringify({ status }),
  });
  if (res.ok) { loadDevRequests(); showToast('تم تحديث الحالة'); }
  else        { showToast('فشل تحديث الحالة', 'error'); }
}

async function deleteDevRequest(id) {
  if (!confirm('هل تريد حذف هذا الطلب؟')) return;
  const res = await apiFetch('/dev-requests/' + id, { method: 'DELETE' });
  if (res.ok) { loadDevRequests(); showToast('تم حذف الطلب'); }
  else        { showToast('فشل حذف الطلب', 'error'); }
}
