
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
  admin:      ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial', 'reports', 'ai', 'logs', 'users'],
  supervisor: ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial', 'reports', 'ai'],
  operator:   ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments'],
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
    dashboard:    loadDashboardStats,
    vehicles:     loadVehicles,
    drivers:      loadDrivers,
    maintenance:  loadMaintenance,
    appointments: loadAppointments,
    regions:      loadRegions,
    reports:      loadReports,
    users:        loadUsers,
    logs:         loadLogs,
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
    set('stat-vehicles',     d.vehicles);
    set('stat-drivers',      d.drivers);
    set('stat-employees',    d.employees);
    set('stat-maintenance',  d.maintenance);
    set('stat-appointments', d.appointments);
    set('stat-cities',       d.cities);
    set('stat-projects',     d.projects);
    set('stat-regions',      d.regions);
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
            <td>${new Date(l.time).toISOString().replace('T', ' ').slice(0, 16)}</td>
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
            <td>${d.licenseExpiry ? new Date(d.licenseExpiry).toISOString().split('T')[0] : '—'}</td>
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
            <td>${j.scheduledDate ? new Date(j.scheduledDate).toISOString().split('T')[0] : '—'}</td>
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
            <td>${a.scheduledAt ? new Date(a.scheduledAt).toISOString().replace('T', ' ').slice(0, 16) : '—'}</td>
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
            <td>${r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '—'}</td>
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
            <td>${r.createdAt ? new Date(r.createdAt).toISOString().replace('T', ' ').slice(0, 16) : '—'}</td>
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
  }
});
