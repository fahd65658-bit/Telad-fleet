
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Frontend Application
// Domain: fna.sa  |  Version: 2.0.1
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
  admin:      ['dashboard', 'map', 'vehicles', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'logs', 'users'],
  supervisor: ['dashboard', 'map', 'vehicles', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai'],
  operator:   ['dashboard', 'map', 'vehicles', 'maintenance'],
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
      signal:  AbortSignal.timeout(15000),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'خطأ في تسجيل الدخول';
      return;
    }

    localStorage.setItem('telad_token', data.token);
    currentUser = data.user;
    renderDashboard();
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      errEl.textContent = 'انتهت مهلة الاتصال — الخادم لا يستجيب، حاول مرة أخرى';
    } else {
      errEl.textContent = 'تعذّر الاتصال بالخادم — تحقق من الاتصال بالإنترنت';
    }
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
    users:     loadUsers,
    logs:      loadLogs,
  };
  if (loaders[section]) loaders[section]();
}

// ═══════════════════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════════════════

// Default fetch timeout in milliseconds (15 s — matches nginx proxy_read_timeout)
const FETCH_TIMEOUT_MS = 15000;

/**
 * Wraps fetch with:
 *  - automatic Authorization header injection
 *  - AbortController-based timeout to avoid hanging requests
 *  - automatic retry on transient network errors (up to maxRetries)
 */
function apiFetch(path, options = {}, maxRetries = 1) {
  const token      = localStorage.getItem('telad_token');
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const attempt = (retriesLeft) =>
    fetch(API_BASE + path, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Accept-Encoding': 'gzip',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(options.headers || {}),
      },
    })
    .then(res => { clearTimeout(timer); return res; })
    .catch(err => {
      if (err.name === 'AbortError') {
        clearTimeout(timer);
        throw new Error('انتهت مهلة الطلب — الخادم لا يستجيب');
      }
      if (retriesLeft > 0) return attempt(retriesLeft - 1);
      clearTimeout(timer);
      throw err;
    });

  return attempt(maxRetries);
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
