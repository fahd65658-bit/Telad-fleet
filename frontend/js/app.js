
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Frontend Application
// Domain: fna.sa  |  Version: 3.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── API Base URL (auto-detects environment) ─────────────────────────────────
const API_BASE = (() => {
  const host = window.location.hostname;
  const override = new URLSearchParams(window.location.search).get('api');
  if (override) return override.replace(/\/$/, '');
  // Local dev: backend runs on port 3000
  if (host === 'localhost' || host === '127.0.0.1' || host === '') return 'http://localhost:3000/api';
  // Vercel / any other host: API is same-origin under /api
  return window.location.origin + '/api';
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
  admin:      ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial', 'handovers', 'employees', 'projectStructure', 'formsApproved', 'reports', 'ai', 'logs', 'users', 'devRequests'],
  supervisor: ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial', 'handovers', 'employees', 'projectStructure', 'formsApproved', 'reports', 'ai'],
  operator:   ['dashboard', 'map', 'vehicles', 'drivers', 'maintenance', 'appointments', 'handovers'],
  viewer:     ['dashboard', 'map'],
};

// ─── State ───────────────────────────────────────────────────────────────────
let currentUser = null;
let currentLoginMode = 'admin';

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
// THEME
// ═══════════════════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('telad_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  localStorage.setItem('telad_theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = localStorage.getItem('telad_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════════════════════════
const CMD_ITEMS = [
  { icon: '📊', label: 'لوحة التحكم',           section: 'dashboard' },
  { icon: '🗺️', label: 'خريطة الأسطول',         section: 'map' },
  { icon: '🚗', label: 'المركبات',               section: 'vehicles' },
  { icon: '🧑‍✈️', label: 'السائقون',             section: 'drivers' },
  { icon: '🔧', label: 'الصيانة',               section: 'maintenance' },
  { icon: '📅', label: 'المواعيد',              section: 'appointments' },
  { icon: '🗺️', label: 'المناطق',               section: 'regions' },
  { icon: '⚠️', label: 'الحوادث',              section: 'accidents' },
  { icon: '🚦', label: 'المخالفات',             section: 'violations' },
  { icon: '💰', label: 'العهد المالية',          section: 'financial' },
  { icon: '�', label: 'الاستلام والتسليم',        section: 'handovers' },
  { icon: '👤', label: 'الموظفون',                 section: 'employees' },
  { icon: '🏙️', label: 'المدن والمشاريع',         section: 'projectStructure' },
  { icon: '🧾', label: 'النماذج المعتمدة',          section: 'formsApproved' },
  { icon: '�📈', label: 'التقارير',              section: 'reports' },
  { icon: '🧠', label: 'الذكاء الاصطناعي',       section: 'ai' },
  { icon: '📜', label: 'سجل العمليات',          section: 'logs' },
  { icon: '👥', label: 'إدارة المستخدمين',       section: 'users' },
  { icon: '🛠️', label: 'طلبات التطوير',         section: 'devRequests' },
  { icon: '☀️', label: 'تبديل الثيم',            action: toggleTheme },
];

let cmdSelectedIdx = -1;

function openCmdPalette() {
  const el = document.getElementById('cmd-palette');
  if (!el) return;
  el.classList.add('open');
  const inp = document.getElementById('cmd-input');
  if (inp) { inp.value = ''; inp.focus(); }
  renderCmdResults('');
}

function closeCmdPalette() {
  const el = document.getElementById('cmd-palette');
  if (el) el.classList.remove('open');
  cmdSelectedIdx = -1;
}

function renderCmdResults(query) {
  const container = document.getElementById('cmd-results');
  if (!container) return;
  const q = query.toLowerCase();
  const allowed = ROLE_SECTIONS[currentUser?.role] || [];
  const filtered = CMD_ITEMS.filter(item => {
    if (item.section && !allowed.includes(item.section)) return false;
    return item.label.includes(q) || (item.section && item.section.toLowerCase().includes(q));
  });
  container.innerHTML = filtered.map((item, i) => `
    <div class="cmd-item${i === cmdSelectedIdx ? ' selected' : ''}"
         data-idx="${i}" onclick="cmdSelectItem(${i})">
      <span class="cmd-item-icon">${item.icon}</span>
      <span>${item.label}</span>
      ${item.section ? `<span class="cmd-hint">${item.section}</span>` : ''}
    </div>`).join('');
  container._filtered = filtered;
}

function cmdSelectItem(idx) {
  const container = document.getElementById('cmd-results');
  const item = container?._filtered?.[idx];
  if (!item) return;
  closeCmdPalette();
  if (item.section) navigateTo(item.section);
  else if (item.action) item.action();
}

function cmdKeyNav(e) {
  const container = document.getElementById('cmd-results');
  if (!container) return;
  const items = container.querySelectorAll('.cmd-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdSelectedIdx = Math.min(cmdSelectedIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdSelectedIdx = Math.max(cmdSelectedIdx - 1, -1);
  } else if (e.key === 'Enter') {
    if (cmdSelectedIdx >= 0) cmdSelectItem(cmdSelectedIdx);
    return;
  } else if (e.key === 'Escape') {
    closeCmdPalette();
    return;
  }
  items.forEach((el, i) => el.classList.toggle('selected', i === cmdSelectedIdx));
  if (cmdSelectedIdx >= 0) items[cmdSelectedIdx]?.scrollIntoView({ block: 'nearest' });
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't fire if focused in input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // Allow Escape and Ctrl+K even in inputs
      if (e.key === 'Escape') {
        closeCmdPalette();
        return;
      }
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); openCmdPalette(); return; }
      // Navigation within cmd palette
      const palette = document.getElementById('cmd-palette');
      if (palette?.classList.contains('open')) cmdKeyNav(e);
      return;
    }

    // Ctrl+K — command palette
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); openCmdPalette(); return; }

    // Alt+T — toggle theme
    if (e.altKey && e.key === 't') { e.preventDefault(); toggleTheme(); return; }

    // Alt+R — refresh current section
    if (e.altKey && e.key === 'r') {
      e.preventDefault();
      const active = document.querySelector('.nav-link.active');
      if (active?.dataset.section) navigateTo(active.dataset.section);
      return;
    }

    // ? — shortcuts panel
    if (e.key === '?') {
      const panel = document.getElementById('shortcuts-panel');
      if (panel) panel.classList.toggle('visible');
      return;
    }

    // Escape — close panels
    if (e.key === 'Escape') {
      closeCmdPalette();
      const panel = document.getElementById('shortcuts-panel');
      if (panel) panel.classList.remove('visible');
      return;
    }

    // Alt+1..9 — navigate sections
    if (e.altKey && !e.ctrlKey) {
      const sections = ['dashboard', 'vehicles', 'drivers', 'maintenance', 'appointments', 'regions', 'accidents', 'violations', 'financial'];
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < sections.length) {
        e.preventDefault();
        const allowed = ROLE_SECTIONS[currentUser?.role] || [];
        if (allowed.includes(sections[idx])) navigateTo(sections[idx]);
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR (mobile)
// ═══════════════════════════════════════════════════════════════════════════
function openSidebar() {
  document.querySelector('.sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('visible');
}

function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
async function refreshNotifications() {
  try {
    const res = await apiFetch('/alerts');
    if (!res.ok) return;
    const data = await res.json();
    const list  = Array.isArray(data) ? data : (data.alerts || []);
    _updateNotifBadge(list.length);
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  // Init theme & shortcuts immediately
  initTheme();
  initKeyboardShortcuts();

  // Wire UI controls
  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('sidebar-toggle-btn')?.addEventListener('click', openSidebar);
  document.getElementById('cmd-input')?.addEventListener('input', e => renderCmdResults(e.target.value));
  document.getElementById('cmd-input')?.addEventListener('keydown', cmdKeyNav);
  document.getElementById('cmd-palette')?.addEventListener('click', e => { if (e.target === document.getElementById('cmd-palette')) closeCmdPalette(); });
  document.getElementById('skew-reload-btn')?.addEventListener('click', () => location.reload());

  // ── Skew Protection: prime the baseline deploy ID ──
  fetch(API_BASE + '/version').then(r => { _checkDeployId(r); }).catch(() => {});

  const token = localStorage.getItem('telad_token');
  const quickToken = localStorage.getItem('telad_quick_token');
  if (quickToken) {
    try {
      const ok = await loadQuickAccessProfile();
      if (ok) return;
    } catch (error) {
      console.warn('Quick access session restore failed:', error);
    }
    localStorage.removeItem('telad_quick_token');
  }

  if (token) {
    try {
      const res = await apiFetch('/auth/me');
      if (res.ok) {
        currentUser = await res.json();
        renderDashboard();
        // Start notification refresh + real-time socket
        refreshNotifications();
        setInterval(refreshNotifications, 60000);
        connectRealtimeSocket();
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
  document.getElementById('page-quick-access').style.display = 'none';
  document.getElementById('page-dashboard').style.display = 'none';
  document.getElementById('login-error').textContent     = '';
  const quickErr = document.getElementById('quick-login-error');
  if (quickErr) quickErr.textContent = '';
  document.getElementById('inp-username').value          = '';
  document.getElementById('inp-password').value          = '';
  switchLoginMode('admin');
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
    connectRealtimeSocket();
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم — تحقق من تشغيل الـ Backend';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'تسجيل الدخول';
  }
}

function switchLoginMode(mode) {
  if (mode !== 'quick' && mode !== 'admin') mode = 'admin';
  currentLoginMode = mode;
  const adminBtn = document.getElementById('login-mode-admin');
  const quickBtn = document.getElementById('login-mode-quick');
  const adminForm = document.getElementById('login-form');
  const quickForm = document.getElementById('quick-login-form');
  if (adminBtn) adminBtn.classList.toggle('active', currentLoginMode === 'admin');
  if (quickBtn) quickBtn.classList.toggle('active', currentLoginMode === 'quick');
  if (adminForm) adminForm.style.display = currentLoginMode === 'admin' ? '' : 'none';
  if (quickForm) quickForm.style.display = currentLoginMode === 'quick' ? '' : 'none';
}

function apiFetchQuick(path, options = {}) {
  const token = localStorage.getItem('telad_quick_token');
  return fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  }).then(res => {
    _checkDeployId(res);
    return res;
  });
}

async function quickAccessLogin(e) {
  e.preventDefault();
  const nationalId = document.getElementById('inp-quick-national-id').value.trim();
  const plate = document.getElementById('inp-quick-plate').value.trim();
  const errEl = document.getElementById('quick-login-error');
  const btn = document.getElementById('btn-quick-login');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'جارٍ التحقق…';
  try {
    const res = await fetch(`${API_BASE}/auth/quick-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nationalId, plate }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'تعذّر الدخول السريع';
      return;
    }
    localStorage.setItem('telad_quick_token', data.token);
    await loadQuickAccessProfile();
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  } finally {
    btn.disabled = false;
    btn.textContent = 'دخول سريع إلى ملف المركبة';
  }
}

async function loadQuickAccessProfile() {
  const res = await apiFetchQuick('/quick-access/vehicle-profile');
  if (!res.ok) return false;
  const data = await res.json();
  const v = data.vehicle || {};
  document.getElementById('page-login').style.display = 'none';
  document.getElementById('page-dashboard').style.display = 'none';
  document.getElementById('page-quick-access').style.display = 'block';
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value ?? '—'; };
  set('qa-user-name', v.vehicleUserName || '—');
  set('qa-plate', v.vehiclePlate || '—');
  set('qa-insurance', v.insuranceStatus || '—');
  set('qa-inspection', v.inspectionStatus || '—');
  set('qa-status', v.vehicleStatus || '—');
  set('qa-has-notes', v.hasGeneralNotes ? 'نعم' : 'لا');
  set('qa-has-driver-notes', v.hasDriverNotes ? 'نعم' : 'لا');
  const maintEl = document.getElementById('qa-latest-maintenance');
  if (maintEl) {
    if (v.latestMaintenance) {
      maintEl.textContent = formatQuickMaintenanceSummary(v.latestMaintenance);
    } else {
      maintEl.textContent = 'لا يوجد سجل صيانة';
    }
  }
  return true;
}

function formatQuickMaintenanceSummary(maintenance) {
  const type = maintenance?.type || 'صيانة';
  const status = maintenance?.status || '—';
  const date = maintenance?.scheduledDate || maintenance?.completedAt || '—';
  return `${type} — ${status} — ${date}`;
}

async function quickAccessLogout() {
  try { await apiFetchQuick('/auth/quick-logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /**/ }
  localStorage.removeItem('telad_quick_token');
  renderLogin();
}

async function bookQuickMonthlyAppointment(event) {
  event.preventDefault();
  const scheduledAt = document.getElementById('qa-appointment-date').value;
  const notes = document.getElementById('qa-appointment-notes').value.trim();
  const res = await apiFetchQuick('/quick-access/monthly-appointment', {
    method: 'POST',
    body: JSON.stringify({ scheduledAt, notes }),
  });
  if (res.ok) showToast('✅ تم حجز موعد الصيانة');
  else showToast('تعذر حجز الموعد', 'error');
}

async function _collectFileAsBase64(inputEl, type, filesOut, multiple = false) {
  const files = inputEl?.files ? Array.from(inputEl.files) : [];
  const selected = multiple ? files : files.slice(0, 1);
  for (const file of selected) {
    await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        filesOut.push({ type, name: file.name, data: e.target.result });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }
}

async function uploadQuickAttachments(event) {
  event.preventDefault();
  const files = [];
  const sidesInput = document.getElementById('qa-photo-sides');
  const sides = sidesInput?.files ? Array.from(sidesInput.files) : [];
  if (sides.length > 4) {
    showToast('سيتم استخدام أول 4 صور فقط للجهات الأربع', 'info');
  }
  for (let i = 0; i < Math.min(sides.length, 4); i++) {
    const sideType = ['front', 'back', 'left', 'right'][i];
    await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        files.push({ type: sideType, name: sides[i].name, data: e.target.result });
        resolve();
      };
      reader.readAsDataURL(sides[i]);
    });
  }
  await _collectFileAsBase64(document.getElementById('qa-oil-sticker'), 'oil_sticker', files);
  await _collectFileAsBase64(document.getElementById('qa-odometer'), 'odometer', files);
  await _collectFileAsBase64(document.getElementById('qa-extra-photos'), 'additional', files, true);
  await _collectFileAsBase64(document.getElementById('qa-handover-photos'), 'handover_receipt', files, true);

  const res = await apiFetchQuick('/quick-access/attachments', { method: 'POST', body: JSON.stringify({ files }) });
  if (res.ok) showToast('✅ تم رفع المرفقات');
  else showToast('فشل رفع المرفقات', 'error');
}

function logout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  _disconnectSocket();
  localStorage.removeItem('telad_token');
  localStorage.removeItem('telad_quick_token');
  currentUser = null;
  renderLogin();
}

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function navigateTo(section) {
  const allowed = ROLE_SECTIONS[currentUser?.role] || [];
  if (!allowed.includes(section)) return;

  closeSidebar(); // close mobile sidebar

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
    handovers:    loadHandovers,
    employees:    loadEmployees,
    projectStructure: loadProjectStructure,
    formsApproved: loadApprovedForms,
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
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('stat-vehicles',        d.vehicles);
    set('stat-vehicles-active', (d.activeVehicles || 0) + ' نشطة');
    set('stat-drivers',         d.drivers);
    set('stat-drivers-sub',     (d.drivers || 0) + ' سائق');
    set('stat-employees',       d.employees);
    set('stat-efficiency',      (d.efficiency || 0) + '%');
    set('stat-alerts-kpi',      d.alerts);
    set('stat-maintenance',     d.maintenance);
    set('stat-appointments',    d.appointments);
    set('stat-violations',      d.violationsUnpaid);
    set('stat-accidents',       d.accidents);
    set('stat-handovers',       d.handoversToday);
    set('stat-financial',       (d.financialMonth || 0) + ' ر.س');
    set('stat-cities',          d.cities);
    set('stat-regions',         d.regions);
    set('stat-projects',        d.projects);
    set('stat-insurance-exp',   d.insuranceExpiring || 0);
    set('stat-inspection-exp',  d.inspectionExpired || 0);
    _updateNotifBadge(d.alerts || 0);
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
      ? '<tr><td colspan="6" class="tbl-empty">لا توجد مركبات مضافة بعد</td></tr>'
      : vehicles.map(v => `
          <tr>
            <td>${escHtml(v.name   || '—')}</td>
            <td>${escHtml(v.plate  || '—')}</td>
            <td>${escHtml(v.city   || '—')}</td>
            <td>${escHtml(v.driver || '—')}</td>
            <td><span class="status-pill ${v.status==='active'?'pill-green':v.status==='maintenance'?'pill-red':'pill-gray'}">${escHtml(v.status||'—')}</span></td>
            <td style="display:flex;gap:6px">
              <button class="btn-sm btn-info" onclick="openVehicleProfile('${escHtml(String(v.id))}')">📋 ملف</button>
              ${canEdit
                ? `<button class="btn-sm btn-danger" data-action="delete-vehicle" data-id="${escHtml(String(v.id))}">حذف</button>`
                : ''
              }
            </td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
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
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; setTimeout(() => toast.remove(), 300); }, 3500);
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
const FIN_LABELS = { fuel: 'وقود', maintenance: 'صيانة', violation: 'مخالفة', salary: 'راتب', withdrawal: 'سحب', other: 'أخرى' };

async function loadFinancial() {
  const tbody = document.getElementById('financial-tbody');
  const summary = document.getElementById('financial-summary');
  if (!tbody) return;
  try {
    const res  = await apiFetch('/financial');
    if (!res.ok) return;
    const list = await res.json();
    const withdrawals = list.filter((f) => {
      const type = String(f.type || '').toLowerCase();
      if (type === 'deposit') return false;
      if (['fuel', 'maintenance', 'violation', 'salary', 'other', 'withdrawal'].includes(type)) return true;
      const direction = String(f.direction || f.operation || '').toLowerCase();
      if (direction === 'withdrawal' || direction === 'debit' || direction === 'out') return true;
      return Number.isFinite(Number(f.amount)) && Number(f.amount) < 0;
    });
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
        `<div class="card"><div class="card-icon">📤</div>
            <div class="card-label">عمليات السحب</div>
            <div class="card-value">${withdrawals.length}</div>
          </div>` +
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
let fleetMap     = null;
const vehicleMarkers = {};

function initMap() {
  if (fleetMap) { fleetMap.invalidateSize(); return; }
  if (typeof L === 'undefined') return;
  fleetMap = L.map('fleet-map').setView([24.7136, 46.6753], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(fleetMap);
}

function _updateMapMarker(vehicleId, lat, lng, label) {
  if (lat && lng) {
    // Main fleet map
    if (fleetMap) {
      if (vehicleMarkers[vehicleId]) {
        vehicleMarkers[vehicleId].setLatLng([lat, lng]);
      } else {
        vehicleMarkers[vehicleId] = L.marker([lat, lng])
          .addTo(fleetMap)
          .bindPopup(label || vehicleId);
      }
    }
    // Ops dashboard map
    _updateOpsMapMarker(vehicleId, lat, lng);
  }
}

function connectGPS() {
  connectRealtimeSocket(); // delegate to the full real-time connection
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-TIME SOCKET.IO
// ═══════════════════════════════════════════════════════════════════════════
let _rtSocket      = null;
let _rtConnecting  = false;

function connectRealtimeSocket() {
  if (_rtSocket || _rtConnecting || typeof io === 'undefined') return;
  const token = localStorage.getItem('telad_token');
  if (!token) return;

  // Vercel is serverless — no persistent WebSocket support.
  // Only attempt Socket.IO on localhost or self-hosted servers.
  const host = window.location.hostname;
  const isVercel = host.endsWith('.vercel.app') || host.endsWith('.now.sh');
  if (isVercel) {
    console.info('[RT] Vercel detected – real-time Socket.IO disabled, using REST polling');
    _startRestPolling();
    return;
  }

  // Socket.IO server is at the root, not under /api
  const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;

  _rtConnecting = true;
  try {
    _rtSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 3000,
    });

    _rtSocket.on('connect', () => {
      _rtConnecting = false;
      console.log('[RT] Socket connected');
      showToast('متصل بالخادم – البيانات مباشرة', 'success');
    });

    _rtSocket.on('connect_error', (err) => {
      _rtConnecting = false;
      console.warn('[RT] Socket error:', err.message);
    });

    // Initial state snapshot
    _rtSocket.on('init', (data) => {
      if (data.vehicles) {
        data.vehicles.forEach(v => _updateMapMarker(v.id, v.lat, v.lng, v.name));
      }
      if (data.alerts) _updateNotifBadge(data.alerts.length);
    });

    // Live GPS updates
    _rtSocket.on('gps:update', ({ vehicleId, lat, lng }) => {
      _updateMapMarker(vehicleId, lat, lng);
    });

    // Dashboard push (every 30s from server)
    _rtSocket.on('dashboard:update', (d) => {
      _applyDashboardData(d);
    });

    // Live GPS → update ops map markers in real time
    _rtSocket.on('gps:update', ({ vehicleId, lat, lng }) => {
      _updateOpsMapMarker(vehicleId, lat, lng);
      _pulseLiveIndicator();
    });

    // Vehicle add/update events
    _rtSocket.on('vehicles:new',    (v) => { if (_isActive('vehicles'))    loadVehicles();    loadDashboardStats(); showToast(`🚗 مركبة جديدة: ${v&&v.name?v.name:''}`, 'success'); });
    _rtSocket.on('vehicles:update', ()  => { if (_isActive('vehicles'))    loadVehicles();    });

    // Maintenance events
    _rtSocket.on('maintenance:new',      (m) => { if (_isActive('maintenance')) loadMaintenance(); showToast(`🔧 صيانة جديدة: ${m&&m.type?m.type:''}`, 'info'); });
    _rtSocket.on('maintenance:complete', ()  => { if (_isActive('maintenance')) loadMaintenance(); loadDashboardStats(); });

    // Appointments
    _rtSocket.on('appointments:new', () => { if (_isActive('appointments')) loadAppointments(); loadDashboardStats(); });

    // Handovers
    _rtSocket.on('handover:new', (data) => {
      if (_isActive('handovers')) loadHandovers();
      loadDashboardStats();
      showToast(`🔄 ${data&&data.handover?data.handover.type:'استلام/تسليم'} جديد`, 'success');
    });

    // Employees
    _rtSocket.on('employees:new', () => { if (_isActive('employees')) loadEmployees(); loadDashboardStats(); });

    // Server alert push
    _rtSocket.on('alert', (msg) => { if (msg) showToast('🔔 ' + msg, 'info'); });

    _rtSocket.on('disconnect', () => {
      console.log('[RT] Socket disconnected');
      _rtSocket = null;
    });
  } catch (e) {
    _rtConnecting = false;
    console.warn('[RT] Socket init failed:', e.message);
  }
}

function _isActive(section) {
  return !!document.querySelector(`.nav-link[data-section="${section}"].active`);
}

function _updateOpsMapMarker(vehicleId, lat, lng) {
  if (!_opsMap) return;
  if (!_opsMap._markers) _opsMap._markers = {};
  if (_opsMap._markers[vehicleId]) {
    _opsMap._markers[vehicleId].setLatLng([lat, lng]);
  }
}

let _pulseTimer = null;
function _pulseLiveIndicator() {
  const dot = document.getElementById('live-dot');
  if (!dot) return;
  dot.style.background = '#22c55e';
  clearTimeout(_pulseTimer);
  _pulseTimer = setTimeout(() => { dot.style.background = ''; }, 1500);
}

function _updateNotifBadge(count) {
  const badge = document.getElementById('notif-count');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
}

function _applyDashboardData(d) {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.textContent = val; };
  set('stat-vehicles',        d.vehicles);
  set('stat-vehicles-active', (d.activeVehicles||0) + ' نشطة');
  set('stat-drivers',         d.drivers);
  set('stat-drivers-sub',     (d.drivers||0) + ' سائق');
  set('stat-employees',       d.employees);
  set('stat-efficiency',      (d.efficiency||Math.round((d.activeVehicles||0)/Math.max(d.vehicles||1,1)*100)) + '%');
  set('stat-alerts-kpi',      d.alerts);
  set('stat-maintenance',     d.maintenance);
  set('stat-handovers',       d.handoversToday);
  set('stat-insurance-exp',   d.insuranceExpiring||0);
  set('stat-inspection-exp',  d.inspectionExpired||0);
  if (d.alerts) _updateNotifBadge(d.alerts);
}

// Disconnect on logout
function _disconnectSocket() {
  if (_rtSocket) { _rtSocket.disconnect(); _rtSocket = null; }
  if (_restPollTimer) { clearInterval(_restPollTimer); _restPollTimer = null; }
}

// REST polling fallback (for Vercel / serverless — no WebSocket)
let _restPollTimer = null;
let _lastPollEtag  = null;
async function _startRestPolling() {
  if (_restPollTimer) return;
  _restPollTimer = setInterval(async () => {
    try {
      const token = localStorage.getItem('telad_token');
      if (!token) return;
      const dashRes = await apiFetch('/dashboard');
      if (dashRes.ok) { const d = await dashRes.json(); _applyDashboardData(d); }

      const posRes = await apiFetch('/gps/positions');
      if (posRes.ok) {
        const positions = await posRes.json();
        if (Array.isArray(positions)) {
          positions.forEach(p => {
            if (p.lat && p.lng) {
              _updateMapMarker(p.vehicleId, p.lat, p.lng, p.name);
              _updateOpsMapMarker(p.vehicleId, p.lat, p.lng);
            }
          });
        }
      }
    } catch { /* silent */ }
  }, 15000);  // poll every 15 s
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

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD MODES
// ═══════════════════════════════════════════════════════════════════════════
let _currentDashMode = 'executive';
let _opsMap = null;

function setDashMode(mode) {
  _currentDashMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
  document.querySelectorAll('.dash-mode').forEach(m => m.style.display = 'none');
  const el = document.getElementById('dash-' + mode);
  if (el) el.style.display = '';

  if (mode === 'operations') initOpsMap();
  if (mode === 'ai') loadAIDashKPIs();
}

function initOpsMap() {
  if (_opsMap) return;
  const el = document.getElementById('ops-map');
  if (!el || typeof L === 'undefined') return;
  _opsMap = L.map('ops-map', { zoomControl: true }).setView([24.68, 46.72], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(_opsMap);
  loadOpsVehicles();
}

async function loadOpsVehicles() {
  try {
    const res = await apiFetch('/vehicles');
    if (!res.ok) return;
    const vehicles = await res.json();
    const list = document.getElementById('ops-vehicles-list');
    if (list) {
      list.innerHTML = vehicles.map(v => `
        <div class="ops-vehicle-item" onclick="openVehicleProfile('${escHtml(String(v.id))}')">
          <div>
            <div class="ops-vehicle-name">${escHtml(v.name || '—')}</div>
            <div class="ops-vehicle-plate">${escHtml(v.plate || '—')} · ${escHtml(v.city || '—')}</div>
          </div>
          <div class="status-dot ${v.status === 'active' ? 'active' : v.status === 'maintenance' ? 'maintenance' : 'idle'}"></div>
        </div>`).join('');
    }
    if (_opsMap) {
      if (!_opsMap._markers) _opsMap._markers = {};
      vehicles.forEach(v => {
        if (!v.lat || !v.lng) return;
        const color = v.status === 'active' ? '#22c55e' : v.status === 'maintenance' ? '#ef4444' : '#f59e0b';
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [12,12], iconAnchor: [6,6],
        });
        if (_opsMap._markers[v.id]) {
          _opsMap._markers[v.id].setLatLng([v.lat, v.lng]);
        } else {
          _opsMap._markers[v.id] = L.marker([v.lat, v.lng], { icon }).addTo(_opsMap)
            .bindPopup(`<strong>${v.name}</strong><br>${v.plate}<br>${v.status}`);
        }
      });
      // Fit bounds to all markers if first load
      const points = vehicles.filter(v=>v.lat&&v.lng).map(v=>[v.lat,v.lng]);
      if (points.length > 1) _opsMap.fitBounds(points, { padding: [30,30] });
    }
  } catch { /**/ }
}

async function loadAIDashKPIs() {
  const el = document.getElementById('ai-dash-kpis');
  if (!el) return;
  try {
    const res = await apiFetch('/dashboard');
    if (!res.ok) return;
    const d = await res.json();
    el.innerHTML = `
      <div class="widget-rows">
        <div class="widget-row"><span>كفاءة الأسطول</span><span class="badge-num">${d.efficiency || 0}%</span></div>
        <div class="widget-row"><span>استلام/تسليم اليوم</span><span class="badge-num">${d.handoversToday || 0}</span></div>
        <div class="widget-row"><span>تأمين منتهٍ قريباً</span><span class="badge-num badge-warn">${d.insuranceExpiring || 0}</span></div>
        <div class="widget-row"><span>فحص منتهي الصلاحية</span><span class="badge-num badge-danger">${d.inspectionExpired || 0}</span></div>
      </div>`;
  } catch { el.innerHTML = '<div class="tbl-empty">—</div>'; }
}

async function loadAIDashInsights() {
  const el = document.getElementById('ai-dash-insights');
  if (!el) return;
  el.innerHTML = '<div class="tbl-empty">جارٍ التحليل…</div>';
  try {
    const res = await apiFetch('/dashboard');
    if (!res.ok) throw new Error();
    const d = await res.json();
    const insights = [];
    if (d.insuranceExpiring > 0) insights.push({ icon: '⚠️', text: `${d.insuranceExpiring} مركبات تأمينها ينتهي قريباً – يُنصح بتجديده` });
    if (d.inspectionExpired > 0) insights.push({ icon: '🔴', text: `${d.inspectionExpired} مركبات الفحص الدوري منتهٍ – يجب إجراء الفحص فوراً` });
    if (d.maintenance > 0)       insights.push({ icon: '🔧', text: `${d.maintenance} طلب صيانة معلق يحتاج متابعة` });
    if (d.violationsUnpaid > 0)  insights.push({ icon: '🚦', text: `${d.violationsUnpaid} مخالفة غير مسددة – قد تتراكم غرامات` });
    if (d.accidents > 0)         insights.push({ icon: '⚠️', text: `${d.accidents} حادث مفتوح يحتاج إجراءات تأمينية` });
    if (d.efficiency < 70)       insights.push({ icon: '📉', text: `كفاءة الأسطول منخفضة (${d.efficiency}%) – راجع المركبات المعطّلة` });
    if (insights.length === 0)   insights.push({ icon: '✅', text: 'الأسطول يعمل بكفاءة عالية – لا توجد تنبيهات حرجة' });
    el.innerHTML = insights.map(i => `
      <div class="ai-insight-item">
        <span class="ai-insight-icon">${i.icon}</span>
        <span class="ai-insight-text">${escHtml(i.text)}</span>
      </div>`).join('');
  } catch { el.innerHTML = '<div class="tbl-empty">تعذّر التحليل</div>'; }
}

async function aiDashChat() {
  const input = document.getElementById('ai-dash-input');
  const chat  = document.getElementById('ai-dash-chat');
  if (!input || !chat) return;
  const msg = input.value.trim();
  if (!msg) return;
  chat.innerHTML += `<div style="text-align:left;margin-bottom:8px"><span style="background:var(--accent);color:#fff;padding:6px 12px;border-radius:16px 16px 4px 16px;display:inline-block;font-size:13px">${escHtml(msg)}</span></div>`;
  input.value = '';
  chat.scrollTop = chat.scrollHeight;
  try {
    const res = await apiFetch('/ai/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
    const data = await res.json();
    const reply = data.reply || data.answer || '—';
    chat.innerHTML += `<div style="margin-bottom:8px"><span style="background:var(--surface-2);padding:6px 12px;border-radius:16px 16px 16px 4px;display:inline-block;font-size:13px">${escHtml(reply)}</span></div>`;
    chat.scrollTop = chat.scrollHeight;
  } catch { /**/ }
}

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE PROFILE MODAL
// ═══════════════════════════════════════════════════════════════════════════
let _currentProfileVehicleId = null;

async function openVehicleProfile(vehicleId) {
  _currentProfileVehicleId = vehicleId;
  document.getElementById('modal-vehicle-profile').style.display = 'flex';
  document.getElementById('vp-title').textContent = 'جارٍ التحميل…';

  try {
    const res = await apiFetch('/vehicles/' + vehicleId + '/profile');
    if (!res.ok) throw new Error();
    const d = await res.json();
    const v = d.vehicle;

    // Header
    document.getElementById('vp-title').textContent = v.name || '—';
    document.getElementById('vp-plate').textContent  = v.plate || '';
    const sb = document.getElementById('vp-score-badge');
    if (sb && d.score) {
      sb.textContent = d.score.score + ' – ' + d.score.label;
      sb.style.background = d.score.color + '22';
      sb.style.color = d.score.color;
    }

    // Basic
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setEl('vp-name', v.name); setEl('vp-plate2', v.plate); setEl('vp-brand', (v.brand||'') + ' ' + (v.model||''));
    setEl('vp-year', v.year); setEl('vp-city', v.city); setEl('vp-driver', v.driver);
    setEl('vp-status', v.status); setEl('vp-fuel', (v.fuelLevel||0) + '%');
    setEl('vp-km', (v.km||0).toLocaleString('ar') + ' كم');
    setEl('vp-location', v.location || (v.lat ? `${v.lat}, ${v.lng}` : '—'));

    // Mini Map
    const mapEl = document.getElementById('vp-mini-map');
    if (mapEl && v.lat && v.lng && typeof L !== 'undefined') {
      mapEl.innerHTML = '';
      const mm = L.map('vp-mini-map', { zoomControl: false }).setView([v.lat, v.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mm);
      L.marker([v.lat, v.lng]).addTo(mm).bindPopup(v.name || '').openPopup();
    } else if (mapEl) {
      mapEl.innerHTML = '<div class="tbl-empty" style="height:100%;display:flex;align-items:center;justify-content:center">لا توجد إحداثيات GPS</div>';
    }

    // Insurance
    const ins = v.insurance || {};
    document.querySelector('#vp-insurance-table tbody').innerHTML = `
      <tr><td>شركة التأمين</td><td>${escHtml(ins.company||'—')}</td></tr>
      <tr><td>رقم الوثيقة</td><td>${escHtml(ins.policyNo||'—')}</td></tr>
      <tr><td>تاريخ الانتهاء</td><td>${escHtml(ins.expiry||'—')}</td></tr>
      <tr><td>الحالة</td><td><span class="${ins.status==='active'?'pill-green':ins.status==='expiring'?'pill-orange':'pill-red'} status-pill">${escHtml(ins.status||'—')}</span></td></tr>`;

    const insp = v.inspection || {};
    document.querySelector('#vp-inspection-table tbody').innerHTML = `
      <tr><td>حالة الفحص</td><td>${escHtml(insp.status||'—')}</td></tr>
      <tr><td>تاريخ الانتهاء</td><td>${escHtml(insp.expiry||'—')}</td></tr>
      <tr><td>مركز الفحص</td><td>${escHtml(insp.center||'—')}</td></tr>`;

    // Maintenance
    const maintTbody = document.querySelector('#vp-maint-table tbody');
    maintTbody.innerHTML = (d.maintenance||[]).length === 0
      ? '<tr><td colspan="4" class="tbl-empty">لا يوجد</td></tr>'
      : (d.maintenance||[]).map(m=>`<tr><td>${escHtml(m.type||'—')}</td><td>${escHtml(m.scheduledDate||'—')}</td><td>${escHtml(String(m.cost||0))}</td><td>${escHtml(m.status||'—')}</td></tr>`).join('');

    // Violations
    const violTbody = document.querySelector('#vp-viol-table tbody');
    violTbody.innerHTML = (d.violations||[]).length === 0
      ? '<tr><td colspan="4" class="tbl-empty">لا يوجد</td></tr>'
      : (d.violations||[]).map(vi=>`<tr><td>${escHtml(vi.date||'—')}</td><td>${escHtml(vi.type||'—')}</td><td>${escHtml(String(vi.fine||0))}</td><td>${escHtml(vi.status||'—')}</td></tr>`).join('');

    // Accidents
    const accTbody = document.querySelector('#vp-acc-table tbody');
    accTbody.innerHTML = (d.accidents||[]).length === 0
      ? '<tr><td colspan="4" class="tbl-empty">لا يوجد</td></tr>'
      : (d.accidents||[]).map(a=>`<tr><td>${escHtml(a.date||'—')}</td><td>${escHtml(a.location||'—')}</td><td>${escHtml(String(a.damage||0))}</td><td>${escHtml(a.status||'—')}</td></tr>`).join('');

    // Handovers tab
    const hTbody = document.querySelector('#vp-handover-table tbody');
    hTbody.innerHTML = (d.handovers||[]).length === 0
      ? '<tr><td colspan="6" class="tbl-empty">لا يوجد</td></tr>'
      : (d.handovers||[]).map(h=>`<tr><td>${escHtml((h.date||'—').slice(0,10))}</td><td>${escHtml(h.type||'—')}</td><td>${escHtml(h.employeeName||'—')}</td><td>${escHtml(String(h.km||0))}</td><td>${escHtml(h.condition||'—')}</td><td style="max-width:200px;white-space:pre-wrap">${escHtml(h.aiReport||'—')}</td></tr>`).join('');

    // Wire handover buttons in modal
    const onHandover = () => openHandoverForm(vehicleId);
    document.getElementById('vp-handover-btn').onclick          = onHandover;
    document.getElementById('vp-handover-footer-btn').onclick   = onHandover;

  } catch {
    document.getElementById('vp-title').textContent = 'تعذّر تحميل البيانات';
  }
}

function switchProfileTab(tab) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.ptab-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('ptab-' + tab);
  if (pane) pane.style.display = '';
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDOVERS
// ═══════════════════════════════════════════════════════════════════════════
async function loadHandovers() {
  const tbody = document.getElementById('handovers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="tbl-empty">جارٍ التحميل…</td></tr>';
  try {
    const typeFilter = document.getElementById('handover-filter-type')?.value || '';
    const condFilter = document.getElementById('handover-filter-condition')?.value || '';
    const res = await apiFetch('/handovers');
    if (!res.ok) throw new Error();
    let rows = await res.json();
    if (typeFilter) rows = rows.filter(h => h.type === typeFilter);
    if (condFilter) rows = rows.filter(h => h.condition === condFilter);
    tbody.innerHTML = rows.length === 0
      ? '<tr><td colspan="9" class="tbl-empty">لا توجد عمليات</td></tr>'
      : rows.map(h => `
          <tr>
            <td>${escHtml(h.vehicleId||'—')}</td>
            <td><span class="status-pill ${h.type==='استلام'?'pill-green':'pill-orange'}">${escHtml(h.type||'—')}</span></td>
            <td>${escHtml(h.employeeName||'—')}</td>
            <td>${escHtml((h.date||'—').slice(0,10))}</td>
            <td>${escHtml(String(h.km||0))} كم</td>
            <td>${escHtml(String(h.fuelLevel||0))}%</td>
            <td>${escHtml(h.condition||'—')}</td>
            <td style="max-width:180px;font-size:12px;white-space:pre-wrap">${escHtml(h.aiReport||'—')}</td>
            <td>
              <button class="btn-sm btn-danger" onclick="deleteHandover('${escHtml(String(h.id))}')">حذف</button>
            </td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="9" class="tbl-empty">تعذّر التحميل</td></tr>';
  }
}

async function openHandoverForm(vehicleId = null) {
  document.getElementById('modal-handover').style.display = 'flex';
  document.getElementById('handover-form-error').textContent = '';
  document.getElementById('ho-ai-result').style.display = 'none';

  // Reset photo slots
  ['front','back','left','right'].forEach(side => {
    const slot = document.getElementById('photo-' + side);
    if (!slot) return;
    slot.classList.remove('has-photo');
    const existing = slot.querySelector('.photo-preview');
    if (existing) existing.remove();
    slot.querySelector('.photo-label').style.display = 'flex';
    const inp = document.getElementById('photo-input-' + side);
    if (inp) inp.value = '';
  });

  // Populate vehicle select
  const vSel = document.getElementById('ho-vehicleSelect');
  try {
    const res = await apiFetch('/vehicles');
    const vehicles = res.ok ? await res.json() : [];
    vSel.innerHTML = '<option value="">— اختر مركبة —</option>' +
      vehicles.map(v => `<option value="${escHtml(String(v.id))}">${escHtml(v.name + ' – ' + v.plate)}</option>`).join('');
    if (vehicleId) {
      vSel.value = vehicleId;
      document.getElementById('ho-vehicleId').value = vehicleId;
    }
  } catch { vSel.innerHTML = '<option value="">تعذّر التحميل</option>'; }

  // Populate employee select
  const eSel = document.getElementById('ho-employeeSelect');
  try {
    const r2 = await apiFetch('/employees');
    const emps = r2.ok ? await r2.json() : [];
    eSel.innerHTML = '<option value="">— اختر موظف —</option>' +
      emps.map(e => `<option value="${escHtml(e.name)}">${escHtml(e.name)} – ${escHtml(e.department||'')}</option>`).join('');
  } catch { /**/ }
}

function previewPhoto(input, slotId) {
  const slot = document.getElementById(slotId);
  if (!slot || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    let img = slot.querySelector('.photo-preview');
    if (!img) { img = document.createElement('img'); img.className = 'photo-preview'; slot.appendChild(img); }
    img.src = e.target.result;
    slot.querySelector('.photo-label').style.display = 'none';
    slot.classList.add('has-photo');
  };
  reader.readAsDataURL(file);
}

async function submitHandover(event) {
  event.preventDefault();
  const errEl  = document.getElementById('handover-form-error');
  const btn    = document.getElementById('btn-ho-submit');
  const icon   = document.getElementById('btn-ho-icon');
  errEl.textContent = '';

  const vehicleId   = document.getElementById('ho-vehicleId').value ||
                      document.getElementById('ho-vehicleSelect').value;
  const employeeSel = document.getElementById('ho-employeeSelect').value;
  const employeeManual = document.getElementById('ho-employeeName').value.trim();

  if (!vehicleId) { errEl.textContent = 'يرجى اختيار مركبة'; return; }

  btn.disabled = true; if (icon) icon.textContent = '⏳';

  // Collect base64 images
  const images = [];
  for (const side of ['front','back','left','right']) {
    const inp = document.getElementById('photo-input-' + side);
    if (inp?.files?.length) {
      await new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = e => { images.push({ side, data: e.target.result }); resolve(); };
        fr.readAsDataURL(inp.files[0]);
      });
    }
  }

  const payload = {
    type:         document.getElementById('ho-type').value,
    employeeName: employeeSel || employeeManual || '—',
    km:           Number(document.getElementById('ho-km').value) || 0,
    fuelLevel:    Number(document.getElementById('ho-fuel').value) || 0,
    condition:    document.getElementById('ho-condition').value,
    witness:      document.getElementById('ho-witness').value,
    notes:        document.getElementById('ho-notes').value,
    images,
  };

  try {
    const res = await apiFetch('/vehicles/' + vehicleId + '/handover', {
      method: 'POST', body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'فشل التسجيل'; btn.disabled = false; if (icon) icon.textContent = '🚗'; return; }

    // Show AI Report
    if (data.aiReport) {
      document.getElementById('ho-ai-result').style.display = 'block';
      document.getElementById('ho-ai-text').textContent = data.aiReport;
    }
    showToast('✅ تم تسجيل عملية الاستلام/التسليم');
    loadHandovers();
    setTimeout(() => closeModal('modal-handover'), 3000);
  } catch {
    errEl.textContent = 'تعذّر الاتصال بالخادم';
  } finally {
    btn.disabled = false; if (icon) icon.textContent = '🚗';
  }
}

async function deleteHandover(id) {
  if (!confirm('هل تريد حذف هذا السجل؟')) return;
  const res = await apiFetch('/handovers/' + id, { method: 'DELETE' });
  if (res.ok) { loadHandovers(); showToast('تم الحذف'); }
  else        { showToast('فشل الحذف', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════
async function loadEmployees() {
  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">جارٍ التحميل…</td></tr>';
  try {
    const [empRes, handRes, vehRes, accRes, violRes] = await Promise.all([
      apiFetch('/employees'),
      apiFetch('/handovers'),
      apiFetch('/vehicles'),
      apiFetch('/accidents'),
      apiFetch('/violations'),
    ]);
    const employees = empRes.ok  ? await empRes.json()  : [];
    const handovers = handRes.ok ? await handRes.json() : [];
    const vehicles  = vehRes.ok  ? await vehRes.json()  : [];
    const accidents = accRes.ok  ? await accRes.json()  : [];
    const violations = violRes.ok ? await violRes.json() : [];

    const empHandovers = (eid, ename) => handovers.filter(h => h.employeeId === eid || h.employeeName === ename).length;
    const empAccidents = (eid) => accidents.filter(a => a.employeeId === eid).length;
    const empViolations= (eid) => violations.filter(v => v.employeeId === eid).length;
    const vehName = vId => { const v = vehicles.find(v => v.id === vId); return v ? (v.name + ' – ' + v.plate) : (vId||'—'); };

    const canEdit = ['admin','supervisor'].includes(currentUser?.role);
    tbody.innerHTML = employees.length === 0
      ? '<tr><td colspan="8" class="tbl-empty">لا يوجد موظفون</td></tr>'
      : employees.map(e => `
          <tr>
            <td>${escHtml(e.name||'—')}</td>
            <td>${escHtml(e.nationalId||'—')}</td>
            <td>${escHtml(e.phone||'—')}</td>
            <td>${escHtml(e.department||'—')}</td>
            <td>${escHtml(vehName(e.vehicleId))}</td>
            <td><span class="badge-num">${empViolations(e.id)}</span></td>
            <td><span class="badge-num">${empAccidents(e.id)}</span></td>
            <td style="display:flex;gap:6px">
              <button class="btn-sm btn-info" onclick="openEmployeeProfile('${escHtml(String(e.id))}')">👤 ملف</button>
              ${canEdit ? `<button class="btn-sm btn-danger" onclick="deleteEmployee('${escHtml(String(e.id))}')">حذف</button>` : ''}
            </td>
          </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="8" class="tbl-empty">تعذّر التحميل</td></tr>';
  }
}

async function addEmployee(event) {
  event.preventDefault();
  const payload = {
    name:       document.getElementById('emp-name').value.trim(),
    nationalId: document.getElementById('emp-nationalId').value.trim(),
    phone:      document.getElementById('emp-phone').value.trim(),
    department: document.getElementById('emp-department').value.trim(),
    jobTitle:   document.getElementById('emp-jobTitle').value.trim(),
    vehicleId:  document.getElementById('emp-vehicleId').value.trim() || null,
  };
  const res = await apiFetch('/employees', { method: 'POST', body: JSON.stringify(payload) });
  if (res.ok) {
    ['emp-name','emp-nationalId','emp-phone','emp-department','emp-jobTitle','emp-vehicleId'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    loadEmployees(); showToast('تمت إضافة الموظف');
  } else {
    showToast('فشل الإضافة', 'error');
  }
}

async function deleteEmployee(id) {
  if (!confirm('هل تريد حذف هذا الموظف؟')) return;
  const res = await apiFetch('/employees/' + id, { method: 'DELETE' });
  if (res.ok) { loadEmployees(); showToast('تم الحذف'); }
  else        { showToast('فشل الحذف', 'error'); }
}

async function openEmployeeProfile(empId) {
  document.getElementById('modal-employee-profile').style.display = 'flex';
  try {
    const res = await apiFetch('/employees/' + empId);
    if (!res.ok) throw new Error();
    const d = await res.json();
    const e = d.employee;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setEl('ep-name',  e.name);
    setEl('ep-id',    e.nationalId);
    setEl('ep-phone', e.phone);
    setEl('ep-dept',  e.department);
    setEl('ep-title', e.jobTitle);
    setEl('ep-vehicle', e.vehicleId ? (d.vehicle ? d.vehicle.name + ' – ' + d.vehicle.plate : e.vehicleId) : '—');

    const handovers = d.handovers || [];
    const hTbody = document.querySelector('#ep-handovers-table tbody');
    hTbody.innerHTML = handovers.length === 0
      ? '<tr><td colspan="4" class="tbl-empty">لا يوجد</td></tr>'
      : handovers.map(h => `
          <tr>
            <td>${escHtml((h.date||'—').slice(0,10))}</td>
            <td>${escHtml(h.vehicleId||'—')}</td>
            <td>${escHtml(h.type||'—')}</td>
            <td>${escHtml(h.condition||'—')}</td>
          </tr>`).join('');
  } catch {
    document.getElementById('ep-name').textContent = 'تعذّر التحميل';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CITIES / PROJECTS / FORMS
// ═══════════════════════════════════════════════════════════════════════════
async function loadProjectStructure() {
  try {
    const [citiesRes, projectsRes, vehiclesRes, employeesRes] = await Promise.all([
      apiFetch('/cities'),
      apiFetch('/projects'),
      apiFetch('/vehicles'),
      apiFetch('/employees'),
    ]);
    const cities = citiesRes.ok ? await citiesRes.json() : [];
    const projects = projectsRes.ok ? await projectsRes.json() : [];
    const vehicles = vehiclesRes.ok ? await vehiclesRes.json() : [];
    const employees = employeesRes.ok ? await employeesRes.json() : [];
    _fillSelect('project-city-id', cities.map(c => ({ value: c.id, label: c.name })), true);
    _fillSelect('project-fleet-select', projects.map(p => ({ value: p.id, label: p.name })), true);
    _fillSelect('transfer-vehicle-id', vehicles.map(v => ({ value: v.id, label: `${v.name} – ${v.plate}` })), true);
    _fillSelect('transfer-vehicle-city-id', cities.map(c => ({ value: c.id, label: c.name })), false);
    _fillSelect('transfer-vehicle-project-id', projects.map(p => ({ value: p.id, label: p.name })), false);
    _fillSelect('transfer-employee-id', employees.map(e => ({ value: e.id, label: `${e.name} – ${e.nationalId || '—'}` })), true);
    _fillSelect('transfer-employee-city-id', cities.map(c => ({ value: c.id, label: c.name })), false);
    _fillSelect('transfer-employee-project-id', projects.map(p => ({ value: p.id, label: p.name })), false);
    await loadProjectFleet();
  } catch {
    const tbody = document.getElementById('project-fleet-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

function _fillSelect(selectId, options, requiredChoice) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const placeholder = requiredChoice ? '<option value="">— اختر —</option>' : '<option value="">— بدون تغيير —</option>';
  select.innerHTML = placeholder + options.map(o => `<option value="${escHtml(String(o.value))}">${escHtml(String(o.label))}</option>`).join('');
}

async function addCity(event) {
  event.preventDefault();
  const name = document.getElementById('city-name').value.trim();
  const res = await apiFetch('/cities', { method: 'POST', body: JSON.stringify({ name }) });
  if (res.ok) {
    document.getElementById('city-name').value = '';
    showToast('تمت إضافة المدينة');
    loadProjectStructure();
  } else {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'فشل إضافة المدينة', 'error');
  }
}

async function addProject(event) {
  event.preventDefault();
  const name = document.getElementById('project-name').value.trim();
  const cityId = document.getElementById('project-city-id').value;
  const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify({ name, cityId }) });
  if (res.ok) {
    document.getElementById('project-name').value = '';
    showToast('تمت إضافة المشروع');
    loadProjectStructure();
  } else {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'فشل إضافة المشروع', 'error');
  }
}

async function loadProjectFleet() {
  const projectId = document.getElementById('project-fleet-select')?.value;
  const tbody = document.getElementById('project-fleet-tbody');
  if (!tbody) return;
  if (!projectId) {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">اختر مشروعاً للعرض</td></tr>';
    return;
  }
  const res = await apiFetch(`/projects/${projectId}/fleet`);
  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="4" class="tbl-empty">تعذّر تحميل ملف المشروع</td></tr>';
    return;
  }
  const data = await res.json();
  const rows = data.vehicles || [];
  tbody.innerHTML = rows.length === 0
    ? '<tr><td colspan="4" class="tbl-empty">لا توجد مركبات في هذا المشروع</td></tr>'
    : rows.map(v => `
      <tr>
        <td>${escHtml(v.name || '—')}</td>
        <td>${escHtml(v.plate || '—')}</td>
        <td>${escHtml(v.status || '—')}</td>
        <td>${escHtml(v.assignedUser?.name || 'غير معيّن')}</td>
      </tr>
    `).join('');
}

async function transferVehicle(event) {
  event.preventDefault();
  const payload = {
    vehicleId: document.getElementById('transfer-vehicle-id').value,
    toCityId: document.getElementById('transfer-vehicle-city-id').value || null,
    toProjectId: document.getElementById('transfer-vehicle-project-id').value || null,
  };
  const res = await apiFetch('/transfers/vehicle', { method: 'POST', body: JSON.stringify(payload) });
  if (res.ok) {
    showToast('تم نقل المركبة بنجاح');
    loadProjectStructure();
  } else {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'فشل نقل المركبة', 'error');
  }
}

async function transferEmployee(event) {
  event.preventDefault();
  const payload = {
    employeeId: document.getElementById('transfer-employee-id').value,
    toCityId: document.getElementById('transfer-employee-city-id').value || null,
    toProjectId: document.getElementById('transfer-employee-project-id').value || null,
  };
  const res = await apiFetch('/transfers/employee', { method: 'POST', body: JSON.stringify(payload) });
  if (res.ok) {
    showToast('تم نقل الموظف بنجاح');
    loadProjectStructure();
  } else {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'فشل نقل الموظف', 'error');
  }
}

async function loadApprovedForms() {
  const tbody = document.getElementById('approved-forms-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">جارٍ التحميل…</td></tr>';
  try {
    const [formsRes, employeesRes, vehiclesRes] = await Promise.all([
      apiFetch('/forms/approved'),
      apiFetch('/employees'),
      apiFetch('/vehicles'),
    ]);
    const forms = formsRes.ok ? await formsRes.json() : [];
    const employees = employeesRes.ok ? await employeesRes.json() : [];
    const vehicles = vehiclesRes.ok ? await vehiclesRes.json() : [];
    _fillSelect('af-employee-id', employees.map(e => ({ value: e.id, label: `${e.name} – ${e.nationalId || '—'}` })), false);
    _fillSelect('af-vehicle-id', vehicles.map(v => ({ value: v.id, label: `${v.name} – ${v.plate}` })), false);

    const empById = new Map(employees.map(e => [e.id, e]));
    const vehById = new Map(vehicles.map(v => [v.id, v]));
    tbody.innerHTML = forms.length === 0
      ? '<tr><td colspan="7" class="tbl-empty">لا توجد نماذج معتمدة</td></tr>'
      : forms.map(f => `
        <tr>
          <td>${escHtml(f.title || '—')}</td>
          <td>${escHtml(f.type || '—')}</td>
          <td>${escHtml(empById.get(f.employeeId)?.name || '—')}</td>
          <td>${escHtml(vehById.get(f.vehicleId)?.plate || '—')}</td>
          <td>${escHtml(f.status || '—')}</td>
          <td>${escHtml(String((f.attachments || []).length))}</td>
          <td><button class="btn-sm btn-info" data-action="work-approved-form" data-id="${escHtml(String(f.id))}">تحديث</button></td>
        </tr>
      `).join('');
    tbody.onclick = (event) => {
      const button = event.target.closest('button[data-action="work-approved-form"]');
      if (!button) return;
      workOnApprovedForm(button.dataset.id);
    };
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="tbl-empty">تعذّر التحميل</td></tr>';
  }
}

async function loadFormAutofill() {
  const employeeId = document.getElementById('af-employee-id')?.value || '';
  const vehicleId = document.getElementById('af-vehicle-id')?.value || '';
  if (!employeeId && !vehicleId) {
    const empPreview = document.getElementById('af-employee-preview');
    const vehPreview = document.getElementById('af-vehicle-preview');
    if (empPreview) empPreview.value = '';
    if (vehPreview) vehPreview.value = '';
    return;
  }
  const res = await apiFetch(`/forms/autofill?employeeId=${encodeURIComponent(employeeId)}&vehicleId=${encodeURIComponent(vehicleId)}`);
  if (!res.ok) return;
  const data = await res.json();
  const empPreview = document.getElementById('af-employee-preview');
  const vehPreview = document.getElementById('af-vehicle-preview');
  if (empPreview) empPreview.value = data.employee ? `${data.employee.name} — ${data.employee.nationalId}` : '';
  if (vehPreview) vehPreview.value = data.vehicle ? `${data.vehicle.name} — ${data.vehicle.plate}` : '';
}

async function createApprovedForm(event) {
  event.preventDefault();
  const attachmentsInput = document.getElementById('af-attachments');
  const files = attachmentsInput?.files ? Array.from(attachmentsInput.files) : [];
  const attachments = [];
  for (const file of files) {
    await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        attachments.push({ name: file.name, data: e.target.result });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }

  const payload = {
    title: document.getElementById('af-title').value.trim(),
    type: document.getElementById('af-type').value,
    employeeId: document.getElementById('af-employee-id').value || null,
    vehicleId: document.getElementById('af-vehicle-id').value || null,
    payload: {
      employeePreview: document.getElementById('af-employee-preview').value,
      vehiclePreview: document.getElementById('af-vehicle-preview').value,
    },
    attachments,
  };
  const res = await apiFetch('/forms/approved', { method: 'POST', body: JSON.stringify(payload) });
  if (res.ok) {
    document.getElementById('af-title').value = '';
    document.getElementById('af-attachments').value = '';
    showToast('تم حفظ النموذج المعتمد');
    loadApprovedForms();
  } else {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'فشل حفظ النموذج', 'error');
  }
}

async function workOnApprovedForm(formId) {
  const note = prompt('أدخل تحديث العمل على النموذج:');
  if (note === null) return;
  const res = await apiFetch(`/forms/approved/${encodeURIComponent(formId)}/work`, {
    method: 'POST',
    body: JSON.stringify({ payload: { lastWorkNote: note, updatedAt: new Date().toISOString() } }),
  });
  if (res.ok) {
    showToast('تم تحديث النموذج');
    loadApprovedForms();
  } else {
    showToast('فشل تحديث النموذج', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// Close modals on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-vehicle-profile','modal-handover','modal-employee-profile'].forEach(closeModal);
  }
});
