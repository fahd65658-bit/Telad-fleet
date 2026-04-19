const AUTO_REFRESH_MS = 30000;

const state = {
  status: null,
  stats: [],
  vehicles: [],
  alerts: []
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Alias for consistency with frontend/js/app.js naming (escHtml).
const escHtml = escapeHtml;

function setMetaStatus(text) {
  document.getElementById('apiStatus').textContent = text;
}

function setSyncStatus(text) {
  document.getElementById('syncStatus').textContent = text;
}

function toggleRefreshButton(isLoading) {
  const button = document.getElementById('refreshBtn');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'جاري التحديث...' : 'تحديث البيانات';
}

function renderStats() {
  const statsGrid = document.getElementById('statsGrid');

  if (!state.stats.length) {
    statsGrid.innerHTML = '<article class="card empty-state">لا توجد مؤشرات متاحة حالياً.</article>';
    return;
  }

  statsGrid.innerHTML = state.stats
    .map((item) => `
      <article class="card">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </article>
    `)
    .join('');
}

function renderVehicles() {
  const tbody = document.getElementById('fleetTableBody');

  if (!state.vehicles.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">لا توجد مركبات للعرض حالياً.</td></tr>';
    return;
  }

  tbody.innerHTML = state.vehicles
    .map((vehicle) => `
      <tr>
        <td>${escapeHtml(vehicle.name)}</td>
        <td>${escapeHtml(vehicle.driver)}</td>
        <td><span class="status ${escapeHtml(vehicle.status)}">${escapeHtml(vehicle.statusLabel)}</span></td>
        <td>${escapeHtml(vehicle.location)}</td>
      </tr>
    `)
    .join('');
}

function renderAlerts() {
  const alertsList = document.getElementById('alertsList');
  const badge = document.getElementById('alertsBadge');

  badge.textContent = `${state.alerts.length} جديد`;

  if (!state.alerts.length) {
    alertsList.innerHTML = '<li class="empty-state">لا توجد تنبيهات جديدة حالياً.</li>';
    return;
  }

  alertsList.innerHTML = state.alerts
    .map((alert) => `<li>${escapeHtml(alert)}</li>`)
    .join('');
}

function formatArabicTime(value) {
  if (!value) {
    return 'تم الاتصال بالخادم';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ar-SA');
}

async function loadDashboard(refresh = false) {
  const endpoint = refresh ? '/api/fleet?refresh=1' : '/api/fleet';
  setMetaStatus('جاري الاتصال بالخادم...');
  setSyncStatus('يتم التحقق من آخر تحديث متاح.');
  toggleRefreshButton(true);

  try {
    const [dashboardResponse, statusResponse] = await Promise.all([
      fetch(endpoint, { cache: 'no-store' }),
      fetch('/api/status', { cache: 'no-store' })
    ]);

    if (!dashboardResponse.ok) {
      throw new Error(`HTTP ${dashboardResponse.status}`);
    }

    if (!statusResponse.ok) {
      throw new Error(`HTTP ${statusResponse.status}`);
    }

    const [data, status] = await Promise.all([
      dashboardResponse.json(),
      statusResponse.json()
    ]);

    state.status = status;
    state.stats = data.stats || [];
    state.vehicles = data.vehicles || [];
    state.alerts = data.alerts || [];

    renderStats();
    renderVehicles();
    renderAlerts();

    setMetaStatus(`الخادم يعمل بشكل طبيعي على المنفذ ${status.port}`);
    setSyncStatus(`آخر تحديث: ${formatArabicTime(data.updatedAt)} • تحديث تلقائي كل 30 ثانية`);
  } catch (error) {
    renderStats();
    renderVehicles();
    renderAlerts();
    setMetaStatus('تعذر الوصول إلى الخادم');
    setSyncStatus('شغّل الخادم المحلي ثم أعد المحاولة.');
    console.error('Dashboard API error:', error);
  } finally {
    toggleRefreshButton(false);
  }
}

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadDashboard(true);
});

window.setInterval(() => {
  loadDashboard(true);
}, AUTO_REFRESH_MS);

loadDashboard();
