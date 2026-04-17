
// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Frontend Application
// Domain: fna.sa  |  Version: 2.0.0
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── API Base URL (auto-detects environment) ─────────────────────────────────
const API_BASE = (() => {
  const host = window.location.hostname;
  const override = new URLSearchParams(window.location.search).get('api');

  if (override) {
    return override.replace(/\/$/, '');
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:5000';
  }

  if (host.endsWith('.github.io')) {
    return 'https://fna.sa/api';
  }

  return `${window.location.origin}/api`;
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
  admin:      ['dashboard', 'map', 'vehicles', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'condition', 'logs', 'users'],
  supervisor: ['dashboard', 'map', 'vehicles', 'maintenance', 'accidents', 'violations', 'financial', 'reports', 'ai', 'condition'],
  operator:   ['dashboard', 'map', 'vehicles', 'maintenance', 'condition'],
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
// VEHICLE CONDITION INSPECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// ─── Tuning constants ─────────────────────────────────────────────────────────
const PHOTO_CAPTURE_QUALITY     = 0.78;   // JPEG quality for initial photo compression
const PHOTO_ANNOTATION_QUALITY  = 0.88;   // JPEG quality for annotated composite (slightly higher)
const AI_ANALYSIS_DELAY_MS      = 2200;   // Simulated AI processing time
const HISTORY_NAV_DELAY_MS      = 1600;   // Delay before switching to history tab after save

const PHOTO_POSITIONS = [
  { key: 'front',     label: 'أمامية',       icon: '🚘' },
  { key: 'rear',      label: 'خلفية',         icon: '🔄' },
  { key: 'left',      label: 'جانب أيسر',    icon: '◀' },
  { key: 'right',     label: 'جانب أيمن',    icon: '▶' },
  { key: 'interior',  label: 'داخلية',        icon: '🪑' },
  { key: 'dashboard', label: 'لوحة القيادة',  icon: '📊' },
];

// ─── Per-form state ───────────────────────────────────────────────────────────
const condState = {
  del: { photos: {}, rating: 3 },
  rec: { photos: {}, rating: 3 },
  annotating:       null,   // { prefix, posKey }
  drawTool:         'pen',
  isDrawing:        false,
  lastX:            0,
  lastY:            0,
  prevDelivery:     null,   // cached previous delivery report
};

let _condInit = false;

// ─── Section init ─────────────────────────────────────────────────────────────
function initConditionSection() {
  if (!_condInit) {
    buildPhotoGrid('del');
    buildPhotoGrid('rec');
    buildStarRating('del');
    buildStarRating('rec');
    _condInit = true;
  }
  populateCondVehicleDropdowns();
}

// ─── Photo grid builder ───────────────────────────────────────────────────────
function buildPhotoGrid(prefix) {
  const grid = document.getElementById(`${prefix}-photo-grid`);
  if (!grid) return;
  grid.innerHTML = PHOTO_POSITIONS.map(pos => `
    <div class="photo-slot" id="${prefix}-slot-${pos.key}">
      <div class="photo-placeholder" onclick="triggerPhotoInput('${prefix}','${pos.key}')">
        <span class="photo-icon">${pos.icon}</span>
        <span class="photo-lbl">${pos.label}</span>
        <span class="photo-hint-txt">انقر للتصوير</span>
      </div>
      <div class="photo-thumb-wrap" style="display:none">
        <img class="photo-thumb" onclick="openAnnotationModal('${prefix}','${pos.key}')" alt="${pos.label}">
        <div class="photo-actions">
          <button class="photo-btn" onclick="triggerPhotoInput('${prefix}','${pos.key}')">🔄 إعادة</button>
          <button class="photo-btn photo-btn-annot" onclick="openAnnotationModal('${prefix}','${pos.key}')">✏️ تعليم</button>
        </div>
        <div class="photo-note-preview" id="${prefix}-note-${pos.key}"></div>
      </div>
    </div>
  `).join('');
}

// ─── Star rating ──────────────────────────────────────────────────────────────
function buildStarRating(prefix) {
  const el = document.getElementById(`${prefix}-stars`);
  if (!el) return;
  el.innerHTML = [1, 2, 3, 4, 5].map(i =>
    `<span class="star${i <= condState[prefix].rating ? ' active' : ''}"
           onclick="setCondRating('${prefix}',${i})">★</span>`
  ).join('');
}

function setCondRating(prefix, rating) {
  condState[prefix].rating = rating;
  buildStarRating(prefix);
}

// ─── Populate vehicle dropdowns ───────────────────────────────────────────────
async function populateCondVehicleDropdowns() {
  try {
    const res = await apiFetch('/vehicles');
    if (!res.ok) return;
    const list = await res.json();
    const baseOpt = '<option value="">— اختر مركبة —</option>';
    const opts    = list.map(v =>
      `<option value="${escHtml(String(v.id))}" data-name="${escHtml(v.name + ' (' + (v.plate || '') + ')')}">${escHtml(v.name)} - ${escHtml(v.plate || '')}</option>`
    ).join('');
    ['del-vehicle', 'rec-vehicle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = baseOpt + opts;
    });
    const hist = document.getElementById('hist-vehicle-filter');
    if (hist) hist.innerHTML = '<option value="">— جميع المركبات —</option>' + opts;
  } catch { /* backend may be offline */ }
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchCondTab(tab) {
  ['delivery', 'receipt', 'history'].forEach(t => {
    document.getElementById(`ctab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`ctab-${t}-content`).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'history') loadConditionHistory();
}

// ─── Photo capture ────────────────────────────────────────────────────────────
function triggerPhotoInput(prefix, posKey) {
  const inp    = document.createElement('input');
  inp.type     = 'file';
  inp.accept   = 'image/*';
  inp.capture  = 'environment';   // prefers rear camera on mobile
  inp.onchange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader     = new FileReader();
    reader.onload    = ev => compressAndStore(prefix, posKey, ev.target.result);
    reader.readAsDataURL(file);
  };
  inp.click();
}

function compressAndStore(prefix, posKey, dataUrl) {
  const img  = new Image();
  img.onload = () => {
    const MAX_W = 800, MAX_H = 600;
    let { width: w, height: h } = img;
    if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
    if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
    const cv  = document.createElement('canvas');
    cv.width  = w;
    cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const compressed = cv.toDataURL('image/jpeg', PHOTO_CAPTURE_QUALITY);
    condState[prefix].photos[posKey] = { dataUrl: compressed, annotationDataUrl: null, notes: '' };
    updatePhotoSlotUI(prefix, posKey);
    updatePhotoCount(prefix);
    if (prefix === 'rec') updateComparisonNewPhoto(posKey);
  };
  img.src = dataUrl;
}

function updatePhotoSlotUI(prefix, posKey) {
  const slot = document.getElementById(`${prefix}-slot-${posKey}`);
  if (!slot) return;
  const data        = condState[prefix].photos[posKey];
  const placeholder = slot.querySelector('.photo-placeholder');
  const thumbWrap   = slot.querySelector('.photo-thumb-wrap');
  const thumb       = slot.querySelector('.photo-thumb');
  if (data?.dataUrl) {
    placeholder.style.display = 'none';
    thumbWrap.style.display   = '';
    thumb.src = data.annotationDataUrl || data.dataUrl;
    const noteEl = document.getElementById(`${prefix}-note-${posKey}`);
    if (noteEl) noteEl.textContent = data.notes ? `📝 ${data.notes}` : '';
  } else {
    placeholder.style.display = '';
    thumbWrap.style.display   = 'none';
  }
}

function updatePhotoCount(prefix) {
  const count = Object.values(condState[prefix].photos).filter(p => p?.dataUrl).length;
  const el    = document.getElementById(`${prefix}-photo-count`);
  if (el) {
    el.textContent = `${count}/6 صور`;
    el.classList.toggle('count-complete', count === 6);
  }
}

// ─── Comparison grid ──────────────────────────────────────────────────────────
function buildComparisonGrid(deliveryPhotos) {
  const grid = document.getElementById('rec-comparison-grid');
  if (!grid) return;
  grid.style.display = '';
  grid.innerHTML = `
    <div class="comparison-header">
      <span>📋 صور التسليم السابق</span>
      <span></span>
      <span>✅ صور الاستلام الحالي</span>
    </div>
  ` + PHOTO_POSITIONS.map(pos => {
    const old = deliveryPhotos.find(p => p.key === pos.key);
    return `
      <div class="comparison-row">
        <div class="comparison-label">${pos.icon} ${pos.label}</div>
        <div class="comparison-old">
          ${old?.dataUrl
            ? `<img src="${old.annotationDataUrl || old.dataUrl}" class="comparison-img" alt="التسليم">`
            : '<div class="comparison-empty">لا توجد صورة</div>'
          }
        </div>
        <div class="comparison-arrow">↔</div>
        <div class="comparison-new" id="comp-new-${pos.key}">
          ${condState.rec.photos[pos.key]?.dataUrl
            ? `<img src="${condState.rec.photos[pos.key].annotationDataUrl || condState.rec.photos[pos.key].dataUrl}" class="comparison-img" alt="الاستلام">`
            : '<div class="comparison-empty">في انتظار الصورة</div>'
          }
        </div>
      </div>
    `;
  }).join('');
}

function updateComparisonNewPhoto(posKey) {
  const cell = document.getElementById(`comp-new-${posKey}`);
  if (!cell) return;
  const data = condState.rec.photos[posKey];
  cell.innerHTML = data?.dataUrl
    ? `<img src="${data.annotationDataUrl || data.dataUrl}" class="comparison-img" alt="الاستلام">`
    : '<div class="comparison-empty">في انتظار الصورة</div>';
}

// ─── Load previous delivery when vehicle is selected ─────────────────────────
async function loadPreviousDelivery() {
  const vehicleId = document.getElementById('rec-vehicle')?.value;
  const banner    = document.getElementById('prev-delivery-banner');
  const compGrid  = document.getElementById('rec-comparison-grid');
  const aiBtn     = document.getElementById('btn-ai-analyze');

  condState.prevDelivery = null;
  banner.style.display   = 'none';
  compGrid.style.display = 'none';
  if (aiBtn) aiBtn.style.display = 'none';

  if (!vehicleId) return;

  try {
    const res = await apiFetch(`/vehicle-condition/compare/${vehicleId}`);
    if (res.status === 404) {
      banner.style.display  = 'block';
      banner.innerHTML      = '<span class="prev-none">ℹ️ لا يوجد تقرير تسليم سابق لهذه المركبة</span>';
      return;
    }
    if (!res.ok) return;

    const { delivery } = await res.json();
    condState.prevDelivery  = delivery;

    const stars = '★'.repeat(delivery.conditionRating) + '☆'.repeat(5 - delivery.conditionRating);
    banner.style.display  = 'block';
    banner.innerHTML      = `
      <div class="prev-info-row">
        <span class="prev-badge">📋 تقرير التسليم</span>
        <span>التاريخ: <strong>${new Date(delivery.createdAt).toLocaleDateString('ar-SA')}</strong></span>
        <span>الممشى: <strong>${delivery.mileage.toLocaleString('ar')} كم</strong></span>
        <span>الوقود: <strong>${delivery.fuelLevel}%</strong></span>
        <span>التقييم: <strong>${stars}</strong></span>
        ${delivery.employeeName ? `<span>الموظف: <strong>${escHtml(delivery.employeeName)}</strong></span>` : ''}
      </div>
    `;

    buildComparisonGrid(delivery.photos || []);
    if (aiBtn) aiBtn.style.display = '';
  } catch { /* ignore */ }
}

// ─── Annotation modal ─────────────────────────────────────────────────────────
function openAnnotationModal(prefix, posKey) {
  const data = condState[prefix].photos[posKey];
  if (!data?.dataUrl) { alert('يرجى التقاط الصورة أولاً'); return; }

  condState.annotating = { prefix, posKey };

  const modal  = document.getElementById('annotation-modal');
  const img    = document.getElementById('annot-img');
  const noteEl = document.getElementById('annot-note');
  const canvas = document.getElementById('annot-canvas');

  img.src      = data.annotationDataUrl || data.dataUrl;
  noteEl.value = data.notes || '';
  modal.style.display = 'flex';

  const setup = () => {
    requestAnimationFrame(() => {
      canvas.width  = img.offsetWidth  || img.naturalWidth;
      canvas.height = img.offsetHeight || img.naturalHeight;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      attachCanvasEvents(canvas);
    });
  };
  img.onload = setup;
  if (img.complete && img.naturalWidth > 0) setup();

  setDrawTool('pen');
}

function closeAnnotationModal() {
  document.getElementById('annotation-modal').style.display = 'none';
  const canvas = document.getElementById('annot-canvas');
  if (canvas) {
    canvas.onmousedown  = null;
    canvas.onmousemove  = null;
    canvas.onmouseup    = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove  = null;
    canvas.ontouchend   = null;
  }
  condState.isDrawing  = false;
  condState.annotating = null;
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────
function attachCanvasEvents(canvas) {
  canvas.onmousedown  = e => { condState.isDrawing = true;  annotDraw(e, true);  };
  canvas.onmousemove  = e => { if (condState.isDrawing) annotDraw(e, false); };
  canvas.onmouseup    = () => { condState.isDrawing = false; };
  canvas.onmouseleave = () => { condState.isDrawing = false; };
  canvas.ontouchstart = e => {
    e.preventDefault();
    condState.isDrawing = true;
    annotDraw(e.touches[0], true);
  };
  canvas.ontouchmove  = e => {
    e.preventDefault();
    if (condState.isDrawing) annotDraw(e.touches[0], false);
  };
  canvas.ontouchend   = () => { condState.isDrawing = false; };
}

function annotDraw(e, isStart) {
  const canvas = document.getElementById('annot-canvas');
  const ctx    = canvas.getContext('2d');
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const x      = (e.clientX - rect.left) * scaleX;
  const y      = (e.clientY - rect.top)  * scaleY;
  const size   = parseInt(document.getElementById('annot-size')?.value || '5', 10);
  const color  = document.getElementById('annot-color')?.value || '#ef4444';
  const isErase = condState.drawTool === 'eraser';

  ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
  ctx.lineWidth   = size;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.strokeStyle = isErase ? 'rgba(0,0,0,1)' : color;
  ctx.fillStyle   = isErase ? 'rgba(0,0,0,1)' : color;

  if (isStart) {
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(condState.lastX, condState.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  condState.lastX = x;
  condState.lastY = y;
}

function setDrawTool(tool) {
  condState.drawTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tool-${tool}`);
  if (btn) btn.classList.add('active');
  const canvas = document.getElementById('annot-canvas');
  if (canvas) canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
}

function clearAnnotCanvas() {
  const canvas = document.getElementById('annot-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function saveAnnotation() {
  const { prefix, posKey } = condState.annotating || {};
  if (!prefix || !posKey) return;

  const annot    = document.getElementById('annot-canvas');
  const imgEl    = document.getElementById('annot-img');
  const noteEl   = document.getElementById('annot-note');
  const cv       = document.createElement('canvas');
  cv.width       = imgEl.naturalWidth  || imgEl.width;
  cv.height      = imgEl.naturalHeight || imgEl.height;
  const ctx      = cv.getContext('2d');

  ctx.drawImage(imgEl, 0, 0, cv.width, cv.height);
  ctx.drawImage(annot, 0, 0, cv.width, cv.height);

  condState[prefix].photos[posKey].annotationDataUrl = cv.toDataURL('image/jpeg', PHOTO_ANNOTATION_QUALITY);
  condState[prefix].photos[posKey].notes             = noteEl.value.trim();

  updatePhotoSlotUI(prefix, posKey);
  if (prefix === 'rec') updateComparisonNewPhoto(posKey);
  closeAnnotationModal();
}

// ─── AI analysis (simulation) ─────────────────────────────────────────────────
async function runAiAnalysis() {
  const btn   = document.getElementById('btn-ai-analyze');
  const panel = document.getElementById('ai-result-panel');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 جارٍ التحليل…'; }
  panel.style.display = '';
  panel.innerHTML     = '<div class="ai-loading">🤖 يقوم الذكاء الاصطناعي بتحليل الصور ومقارنتها…<br><small>يرجى الانتظار</small></div>';

  await new Promise(r => setTimeout(r, AI_ANALYSIS_DELAY_MS));   // simulate processing delay

  // Collect manually annotated photos as "detected damages"
  const damages = PHOTO_POSITIONS.reduce((acc, pos) => {
    const p = condState.rec.photos[pos.key];
    if (p?.annotationDataUrl && p.notes) {
      acc.push({ position: pos.label, notes: p.notes, isManual: true });
    }
    return acc;
  }, []);

  const delPhots = (condState.prevDelivery?.photos || []).length;
  const recPhots = Object.values(condState.rec.photos).filter(p => p?.dataUrl).length;

  panel.innerHTML = `
    <div class="ai-result">
      <div class="ai-result-hdr">
        <span class="ai-badge">🤖 نتيجة التحليل الذكي</span>
        <span class="ai-ts">${new Date().toLocaleTimeString('ar-SA')}</span>
      </div>
      <div class="ai-summary ${damages.length === 0 ? 'ai-ok' : 'ai-warn'}">
        ${damages.length === 0
          ? '✅ لم يتم رصد أي أضرار جديدة — المركبة في الحالة المتوقعة'
          : `⚠️ تم رصد ${damages.length} ضرر مُعلَّم يدوياً`
        }
      </div>
      <div class="ai-stats">
        <div class="ai-stat"><span>صور التسليم</span><strong>${delPhots}</strong></div>
        <div class="ai-stat"><span>صور الاستلام</span><strong>${recPhots}</strong></div>
        <div class="ai-stat"><span>الأضرار المرصودة</span><strong>${damages.length}</strong></div>
      </div>
      ${damages.length > 0 ? `
        <div class="ai-damages">
          <h4>الأضرار المرصودة:</h4>
          ${damages.map(d => `
            <div class="ai-damage-row">
              <span class="dmg-pos">${escHtml(d.position)}</span>
              <span class="dmg-desc">${escHtml(d.notes)}</span>
              <span class="dmg-tag">✏️ مُعلَّم يدوياً</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <p class="ai-disclaimer">* لتفعيل التحليل الذكي الكامل بـ OpenAI Vision، أضف مفتاح API في إعدادات النظام.</p>
    </div>
  `;
  if (btn) { btn.disabled = false; btn.textContent = '🤖 تحليل ذكاء اصطناعي'; }
}

// ─── Submit form ──────────────────────────────────────────────────────────────
async function submitConditionReport(type) {
  const prefix    = type === 'delivery' ? 'del' : 'rec';
  const vehicleEl = document.getElementById(`${prefix}-vehicle`);
  const statusEl  = document.getElementById(`${prefix}-status-msg`);
  const vehicleId = vehicleEl?.value;

  if (!vehicleId) { alert('يرجى اختيار المركبة'); return; }

  const photos = PHOTO_POSITIONS
    .filter(pos => condState[prefix].photos[pos.key]?.dataUrl)
    .map(pos => ({
      key:              pos.key,
      label:            pos.label,
      dataUrl:          condState[prefix].photos[pos.key].dataUrl,
      annotationDataUrl: condState[prefix].photos[pos.key].annotationDataUrl || null,
      notes:            condState[prefix].photos[pos.key].notes || '',
    }));

  if (photos.length === 0) { alert('يرجى إضافة صورة واحدة على الأقل'); return; }

  const vehicleName = vehicleEl.selectedOptions[0]?.dataset?.name || '';
  const body = {
    vehicleId,
    vehicleName,
    type,
    employeeName:    document.getElementById(`${prefix}-employee`)?.value?.trim() || '',
    driverName:      document.getElementById(`${prefix}-driver`)?.value?.trim()   || '',
    mileage:         parseInt(document.getElementById(`${prefix}-mileage`)?.value, 10) || 0,
    fuelLevel:       parseInt(document.getElementById(`${prefix}-fuel`)?.value,    10) || 0,
    photos,
    conditionRating: condState[prefix].rating,
    notes:           document.getElementById(`${prefix}-notes`)?.value?.trim() || '',
  };

  if (statusEl) { statusEl.textContent = '⏳ جارٍ الحفظ…'; statusEl.className = 'status-msg'; }

  try {
    const res  = await apiFetch('/vehicle-condition', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) {
      if (statusEl) { statusEl.textContent = '❌ ' + (data.error || 'حدث خطأ'); statusEl.className = 'status-msg status-error'; }
      return;
    }
    if (statusEl) {
      statusEl.textContent = `✅ تم حفظ نموذج ${type === 'delivery' ? 'التسليم' : 'الاستلام'} بنجاح`;
      statusEl.className   = 'status-msg status-ok';
    }
    resetConditionForm(prefix);
    setTimeout(() => switchCondTab('history'), HISTORY_NAV_DELAY_MS);
  } catch {
    if (statusEl) { statusEl.textContent = '❌ تعذّر الاتصال بالخادم'; statusEl.className = 'status-msg status-error'; }
  }
}

function resetConditionForm(prefix) {
  condState[prefix].photos = {};
  condState[prefix].rating = 3;
  buildPhotoGrid(prefix);
  buildStarRating(prefix);
  updatePhotoCount(prefix);
  ['employee', 'driver', 'mileage', 'fuel', 'notes'].forEach(f => {
    const el = document.getElementById(`${prefix}-${f}`);
    if (el) el.value = '';
  });
  if (prefix === 'rec') {
    document.getElementById('prev-delivery-banner').style.display = 'none';
    document.getElementById('rec-comparison-grid').style.display  = 'none';
    const aiPanel = document.getElementById('ai-result-panel');
    if (aiPanel) aiPanel.style.display = 'none';
    const aiBtn = document.getElementById('btn-ai-analyze');
    if (aiBtn) aiBtn.style.display = 'none';
    condState.prevDelivery = null;
  }
}

// ─── History ──────────────────────────────────────────────────────────────────
async function loadConditionHistory() {
  const tbody     = document.getElementById('cond-history-tbody');
  const vehicleId = document.getElementById('hist-vehicle-filter')?.value || '';
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="tbl-empty">جارٍ التحميل…</td></tr>';
  try {
    const url = vehicleId
      ? `/vehicle-condition/${vehicleId}/history`
      : '/vehicle-condition';
    const res     = await apiFetch(url);
    if (!res.ok) { tbody.innerHTML = '<tr><td colspan="9" class="tbl-empty">تعذّر تحميل البيانات</td></tr>'; return; }
    const reports = await res.json();
    if (!reports.length) { tbody.innerHTML = '<tr><td colspan="9" class="tbl-empty">لا توجد تقارير بعد</td></tr>'; return; }
    tbody.innerHTML = reports.map(r => `
      <tr>
        <td>${new Date(r.createdAt).toLocaleString('ar-SA')}</td>
        <td>${escHtml(r.vehicleName || r.vehicleId)}</td>
        <td><span class="type-badge type-${r.type}">${r.type === 'delivery' ? '📋 تسليم' : '✅ استلام'}</span></td>
        <td>${escHtml(r.employeeName || '—')}</td>
        <td>${r.mileage.toLocaleString('ar')} كم</td>
        <td>${r.fuelLevel}%</td>
        <td class="stars-cell">${'★'.repeat(r.conditionRating)}${'☆'.repeat(5 - r.conditionRating)}</td>
        <td>${escHtml(r.createdBy)}</td>
        <td><button class="btn-sm btn-view" onclick="viewConditionReport('${escHtml(r.id)}')">👁 عرض</button></td>
      </tr>
    `).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="9" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

// ─── Report viewer ────────────────────────────────────────────────────────────
async function viewConditionReport(reportId) {
  try {
    const res = await apiFetch(`/vehicle-condition/report/${reportId}`);
    if (!res.ok) return;
    const r = await res.json();

    document.getElementById('report-view-title').textContent =
      r.type === 'delivery' ? '📋 تقرير التسليم' : '✅ تقرير الاستلام';

    document.getElementById('report-view-content').innerHTML = `
      <div class="report-meta-grid">
        <div class="report-meta-item"><span>المركبة</span><strong>${escHtml(r.vehicleName || r.vehicleId)}</strong></div>
        <div class="report-meta-item"><span>التاريخ</span><strong>${new Date(r.createdAt).toLocaleString('ar-SA')}</strong></div>
        <div class="report-meta-item"><span>الموظف</span><strong>${escHtml(r.employeeName || '—')}</strong></div>
        <div class="report-meta-item"><span>السائق</span><strong>${escHtml(r.driverName || '—')}</strong></div>
        <div class="report-meta-item"><span>الممشى</span><strong>${r.mileage.toLocaleString('ar')} كم</strong></div>
        <div class="report-meta-item"><span>الوقود</span><strong>${r.fuelLevel}%</strong></div>
        <div class="report-meta-item"><span>التقييم</span>
          <strong class="stars-cell">${'★'.repeat(r.conditionRating)}${'☆'.repeat(5 - r.conditionRating)}</strong>
        </div>
        ${r.notes ? `<div class="report-meta-item"><span>ملاحظات</span><strong>${escHtml(r.notes)}</strong></div>` : ''}
      </div>
      <div class="report-photos-section">
        <h4>الصور (${r.photos.length})</h4>
        <div class="report-photo-grid">
          ${r.photos.map(p => `
            <div class="report-photo-item">
              <img src="${p.annotationDataUrl || p.dataUrl}" alt="${escHtml(p.label)}"
                   class="report-photo-img" onclick="this.requestFullscreen?.()">
              <span class="report-photo-lbl">${escHtml(p.label)}</span>
              ${p.notes ? `<span class="report-photo-note">📝 ${escHtml(p.notes)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.getElementById('report-view-modal').style.display = 'flex';
  } catch { /* ignore */ }
}

function closeReportViewModal() {
  document.getElementById('report-view-modal').style.display = 'none';
}
