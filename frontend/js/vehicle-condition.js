// ═══════════════════════════════════════════════════════════════════════════
// TELAD FLEET – Vehicle Condition Registration System
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const vcState = {
  currentTab:    'delivery',
  deliveryPhotos: [],  // Array of {data, direction} or null per slot
  receiptPhotos:  [],  // Array of {data, direction} or null per slot
  annotating: {
    containerId: '',
    photoIndex:  -1,
  },
};

const VC_DIRECTIONS = [
  { key: 'front',    label: 'أمامي',  icon: '⬆️' },
  { key: 'back',     label: 'خلفي',   icon: '⬇️' },
  { key: 'right',    label: 'يمين',   icon: '➡️' },
  { key: 'left',     label: 'يسار',   icon: '⬅️' },
  { key: 'roof',     label: 'سقف',    icon: '🔝' },
  { key: 'interior', label: 'داخلي',  icon: '🪑' },
  { key: 'engine',   label: 'محرك',   icon: '⚙️' },
  { key: 'other',    label: 'أخرى',   icon: '📷' },
];

// ─── Tab switching ────────────────────────────────────────────────────────────
function vcShowTab(tab) {
  vcState.currentTab = tab;
  document.querySelectorAll('.vc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.vc-tab-content').forEach(c => c.style.display = 'none');

  const activeTab = document.querySelector(`.vc-tab[data-tab="${tab}"]`);
  if (activeTab) activeTab.classList.add('active');

  const activeContent = document.getElementById(`vc-tab-${tab}`);
  if (activeContent) activeContent.style.display = 'block';

  if (tab === 'history') vcFetchReports();
}

// ─── Main section loader (called by navigateTo) ───────────────────────────────
function vcLoadHistory() {
  // Initialize photo grids on first load
  const grid1 = document.getElementById('vc-delivery-photos');
  const grid2 = document.getElementById('vc-receipt-photos');
  if (grid1 && !grid1.dataset.initialized) {
    vcInitPhotoGrid('vc-delivery-photos', vcState.deliveryPhotos);
    grid1.dataset.initialized = '1';
  }
  if (grid2 && !grid2.dataset.initialized) {
    vcInitPhotoGrid('vc-receipt-photos', vcState.receiptPhotos);
    grid2.dataset.initialized = '1';
  }
  // Show delivery tab by default; if already on history tab, reload
  if (vcState.currentTab === 'history') {
    vcFetchReports();
  }
}

// ─── Fetch and render reports ─────────────────────────────────────────────────
async function vcFetchReports() {
  const tbody = document.getElementById('vc-history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">جارٍ التحميل…</td></tr>';
  try {
    const res = await apiFetch('/vehicle-condition/reports');
    if (!res.ok) throw new Error('فشل التحميل');
    const reports = await res.json();
    if (!reports.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">لا توجد تقارير بعد</td></tr>';
      return;
    }
    tbody.innerHTML = [...reports].reverse().map(r => `
      <tr>
        <td>${new Date(r.createdAt).toLocaleString('ar-SA')}</td>
        <td>${escHtml(r.vehiclePlate)}</td>
        <td><span class="vc-condition-badge ${r.type === 'delivery' ? 'badge-delivery' : 'badge-receipt'}">${r.type === 'delivery' ? '🚗 تسليم' : '📋 استلام'}</span></td>
        <td>${escHtml(r.driverName || r.employeeName || '—')}</td>
        <td>${r.aiAnalysis
          ? `<span class="vc-condition-badge badge-${r.aiAnalysis.overallCondition || 'good'}">${vcConditionLabel(r.aiAnalysis.overallCondition)}</span>`
          : '<span style="color:#475569">—</span>'
        }</td>
        <td>${escHtml(r.createdBy || '—')}</td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="tbl-empty">تعذّر تحميل البيانات</td></tr>';
  }
}

function vcFilterHistory() {
  const q = (document.getElementById('vc-history-search')?.value || '').toLowerCase();
  document.querySelectorAll('#vc-history-tbody tr').forEach(row => {
    row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function vcConditionLabel(cond) {
  return { good: 'ممتاز', fair: 'متوسط', poor: 'سيئ' }[cond] || (cond || '—');
}

// ─── Photo grid ───────────────────────────────────────────────────────────────
function vcInitPhotoGrid(containerId, photosArray) {
  const container = document.getElementById(containerId);
  if (!container) return;
  while (photosArray.length < VC_DIRECTIONS.length) photosArray.push(null);

  container.innerHTML = VC_DIRECTIONS.map((dir, i) => `
    <div class="vc-photo-slot" id="${containerId}-slot-${i}" onclick="vcTriggerFileInput('${containerId}',${i})">
      <input type="file" id="${containerId}-file-${i}" accept="image/*" capture="environment"
             style="display:none" onchange="vcOnFileSelect('${containerId}',${i},this)">
      <div class="vc-photo-slot-inner" id="${containerId}-inner-${i}">
        <span class="vc-photo-icon">${dir.icon}</span>
        <span class="vc-photo-label">${dir.label}</span>
      </div>
    </div>`).join('');
}

function vcTriggerFileInput(containerId, index) {
  document.getElementById(`${containerId}-file-${index}`)?.click();
}

function vcOnFileSelect(containerId, index, input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    vcCompressImage(e.target.result, 800, compressed => {
      const arr = vcGetPhotosArray(containerId);
      arr[index] = { data: compressed, direction: VC_DIRECTIONS[index].key };
      vcUpdatePhotoSlot(containerId, index, compressed);
    });
  };
  reader.readAsDataURL(file);
}

function vcGetPhotosArray(containerId) {
  return containerId.startsWith('vc-delivery') ? vcState.deliveryPhotos : vcState.receiptPhotos;
}

function vcCompressImage(dataUrl, maxSize, callback) {
  const img = new Image();
  img.onload = () => {
    let { width, height } = img;
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
      else { width = Math.round(width * maxSize / height); height = maxSize; }
    }
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', 0.82));
  };
  img.src = dataUrl;
}

function vcUpdatePhotoSlot(containerId, index, dataUrl) {
  const inner = document.getElementById(`${containerId}-inner-${index}`);
  if (!inner) return;
  const dir = VC_DIRECTIONS[index];
  inner.innerHTML = `
    <img src="${dataUrl}" class="vc-photo-thumb" alt="${dir.label}">
    <div class="vc-photo-overlay">
      <button class="vc-annotate-btn" onclick="event.stopPropagation();vcAnnotate(${index},'${containerId}')" title="تحرير">✏️</button>
      <button class="vc-annotate-btn" onclick="event.stopPropagation();vcRemovePhoto('${containerId}',${index})" title="حذف">🗑️</button>
    </div>
    <span class="vc-photo-label-over">${dir.label}</span>`;
}

function vcRemovePhoto(containerId, index) {
  vcGetPhotosArray(containerId)[index] = null;
  const inner = document.getElementById(`${containerId}-inner-${index}`);
  const dir   = VC_DIRECTIONS[index];
  if (inner) inner.innerHTML = `<span class="vc-photo-icon">${dir.icon}</span><span class="vc-photo-label">${dir.label}</span>`;
  // Reset the file input so the same file can be re-selected
  const fileInput = document.getElementById(`${containerId}-file-${index}`);
  if (fileInput) fileInput.value = '';
}

// ─── Annotation canvas ────────────────────────────────────────────────────────
let _vcCanvas = null, _vcCtx = null, _vcDrawing = false;
let _vcTool = 'pen', _vcColor = '#ef4444', _vcLineWidth = 3;
let _vcHistory = [], _vcStartX = 0, _vcStartY = 0;

function vcAnnotate(index, containerId) {
  vcState.annotating = { containerId, photoIndex: index };
  const photo = vcGetPhotosArray(containerId)[index];
  if (!photo) return;

  const modal = document.getElementById('vc-annotate-modal');
  modal.style.display = 'flex';

  _vcCanvas  = document.getElementById('vc-annot-canvas');
  _vcCtx     = _vcCanvas.getContext('2d');
  _vcTool    = 'pen';
  _vcColor   = '#ef4444';
  _vcHistory = [];

  document.querySelectorAll('.vc-tool-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.vc-tool-btn[data-tool="pen"]')?.classList.add('active');
  document.querySelectorAll('.vc-color-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.vc-color-btn[data-color="#ef4444"]')?.classList.add('active');

  const img = new Image();
  img.onload = () => {
    _vcCanvas.width  = img.width;
    _vcCanvas.height = img.height;
    _vcCtx.drawImage(img, 0, 0);
    _vcHistory = [_vcCtx.getImageData(0, 0, _vcCanvas.width, _vcCanvas.height)];
  };
  img.src = photo.data || photo;
}

function vcAnnotClose() {
  document.getElementById('vc-annotate-modal').style.display = 'none';
  _vcDrawing = false;
}

function vcAnnotSave() {
  const { containerId, photoIndex } = vcState.annotating;
  const arr  = vcGetPhotosArray(containerId);
  const saved = _vcCanvas.toDataURL('image/jpeg', 0.9);
  if (arr[photoIndex]) arr[photoIndex].data = saved;
  vcUpdatePhotoSlot(containerId, photoIndex, saved);
  vcAnnotClose();
}

function vcAnnotUndo() {
  if (_vcHistory.length <= 1) return;
  _vcHistory.pop();
  _vcCtx.putImageData(_vcHistory[_vcHistory.length - 1], 0, 0);
}

function vcAnnotClear() {
  if (_vcHistory.length) _vcCtx.putImageData(_vcHistory[0], 0, 0);
  _vcHistory = [_vcHistory[0]];
}

function vcSetTool(tool) {
  _vcTool = tool;
  document.querySelectorAll('.vc-tool-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.vc-tool-btn[data-tool="${tool}"]`)?.classList.add('active');
  const textGroup = document.getElementById('vc-text-input-group');
  if (textGroup) textGroup.style.display = tool === 'text' ? 'flex' : 'none';
}

function vcSetColor(color) {
  _vcColor = color;
  document.querySelectorAll('.vc-color-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.vc-color-btn[data-color="${color}"]`)?.classList.add('active');
}

function _vcGetPos(e) {
  const rect   = _vcCanvas.getBoundingClientRect();
  const scaleX = _vcCanvas.width  / rect.width;
  const scaleY = _vcCanvas.height / rect.height;
  const src    = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
}

function vcAnnotMouseDown(e) {
  e.preventDefault();
  _vcDrawing = true;
  const { x, y } = _vcGetPos(e);
  _vcStartX = x; _vcStartY = y;

  if (_vcTool === 'text') {
    const textInput = document.getElementById('vc-annot-text-input');
    const text = textInput ? textInput.value.trim() : '';
    if (text) {
      _vcCtx.globalCompositeOperation = 'source-over';
      _vcCtx.font      = 'bold 22px sans-serif';
      _vcCtx.fillStyle = _vcColor;
      _vcCtx.fillText(text, x, y);
      _vcHistory.push(_vcCtx.getImageData(0, 0, _vcCanvas.width, _vcCanvas.height));
    }
    _vcDrawing = false;
    return;
  }

  _vcCtx.globalCompositeOperation = _vcTool === 'eraser' ? 'destination-out' : 'source-over';
  _vcCtx.strokeStyle = _vcTool === 'eraser' ? 'rgba(0,0,0,1)' : _vcColor;
  _vcCtx.lineWidth   = _vcTool === 'eraser' ? 20 : _vcLineWidth;
  _vcCtx.lineCap     = 'round';
  _vcCtx.lineJoin    = 'round';

  if (_vcTool === 'pen' || _vcTool === 'eraser') {
    _vcCtx.beginPath();
    _vcCtx.moveTo(x, y);
  }
}

function vcAnnotMouseMove(e) {
  if (!_vcDrawing) return;
  e.preventDefault();
  const { x, y } = _vcGetPos(e);

  if (_vcTool === 'pen' || _vcTool === 'eraser') {
    _vcCtx.lineTo(x, y);
    _vcCtx.stroke();
  } else if (_vcTool === 'rect') {
    _vcCtx.putImageData(_vcHistory[_vcHistory.length - 1], 0, 0);
    _vcCtx.globalCompositeOperation = 'source-over';
    _vcCtx.strokeStyle = _vcColor;
    _vcCtx.lineWidth   = _vcLineWidth;
    _vcCtx.strokeRect(_vcStartX, _vcStartY, x - _vcStartX, y - _vcStartY);
  }
}

function vcAnnotMouseUp(e) {
  if (!_vcDrawing) return;
  _vcDrawing = false;
  _vcCtx.globalCompositeOperation = 'source-over';
  _vcHistory.push(_vcCtx.getImageData(0, 0, _vcCanvas.width, _vcCanvas.height));
}

// ─── Submit delivery ──────────────────────────────────────────────────────────
async function vcSubmitDelivery(e) {
  e.preventDefault();
  const btn   = e.target.querySelector('button[type="submit"]');
  const errEl = document.getElementById('vc-delivery-error');
  if (errEl) errEl.textContent = '';

  const body = {
    vehiclePlate:     document.getElementById('vc-d-plate').value.trim(),
    employeeName:     document.getElementById('vc-d-employee').value.trim(),
    driverName:       document.getElementById('vc-d-driver').value.trim(),
    mileage:          +document.getElementById('vc-d-mileage').value || 0,
    fuelLevel:        +document.getElementById('vc-d-fuel').value || 0,
    tireCondition:    document.getElementById('vc-d-tires').value,
    oilLevel:         document.getElementById('vc-d-oil').value,
    batteryCondition: document.getElementById('vc-d-battery').value,
    glassCondition:   document.getElementById('vc-d-glass').value,
    lightsCondition:  document.getElementById('vc-d-lights').value,
    mirrorsCondition: document.getElementById('vc-d-mirrors').value,
    notes:            document.getElementById('vc-d-notes').value.trim(),
    photos:           vcState.deliveryPhotos.filter(Boolean),
  };

  if (!body.vehiclePlate) {
    if (errEl) errEl.textContent = 'رقم اللوحة مطلوب';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'جارٍ الإرسال والتحليل…';

  try {
    const res  = await apiFetch('/vehicle-condition/delivery', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل الإرسال');

    e.target.reset();
    document.getElementById('vc-d-fuel-val').textContent = '50';
    vcState.deliveryPhotos = [];
    const grid = document.getElementById('vc-delivery-photos');
    if (grid) { grid.dataset.initialized = ''; vcInitPhotoGrid('vc-delivery-photos', vcState.deliveryPhotos); }

    const resultEl = document.getElementById('vc-delivery-ai-result');
    if (data.aiAnalysis) vcShowAIResults(data.aiAnalysis, 'vc-delivery-ai-result');
    else if (resultEl) resultEl.innerHTML = '<div class="vc-ai-card">✅ تم حفظ تقرير التسليم بنجاح</div>';
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = '✅ حفظ وتحليل';
  }
}

// ─── Submit receipt ───────────────────────────────────────────────────────────
async function vcSubmitReceipt(e) {
  e.preventDefault();
  const btn   = e.target.querySelector('button[type="submit"]');
  const errEl = document.getElementById('vc-receipt-error');
  if (errEl) errEl.textContent = '';

  const body = {
    vehiclePlate:     document.getElementById('vc-r-plate').value.trim(),
    employeeName:     document.getElementById('vc-r-employee').value.trim(),
    driverName:       document.getElementById('vc-r-driver').value.trim(),
    finalMileage:     +document.getElementById('vc-r-finalmileage').value || 0,
    daysUsed:         +document.getElementById('vc-r-daysused').value || 0,
    currentCondition: document.getElementById('vc-r-condition').value,
    notes:            document.getElementById('vc-r-notes').value.trim(),
    photos:           vcState.receiptPhotos.filter(Boolean),
  };

  if (!body.vehiclePlate) {
    if (errEl) errEl.textContent = 'رقم اللوحة مطلوب';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'جارٍ الإرسال والتحليل…';

  try {
    const res  = await apiFetch('/vehicle-condition/receipt', { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل الإرسال');

    e.target.reset();
    vcState.receiptPhotos = [];
    const grid = document.getElementById('vc-receipt-photos');
    if (grid) { grid.dataset.initialized = ''; vcInitPhotoGrid('vc-receipt-photos', vcState.receiptPhotos); }

    if (data.aiAnalysis) vcShowAIResults(data.aiAnalysis, 'vc-receipt-ai-result');
    else {
      const el = document.getElementById('vc-receipt-ai-result');
      if (el) el.innerHTML = '<div class="vc-ai-card">✅ تم حفظ تقرير الاستلام بنجاح</div>';
    }
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = '✅ حفظ وتحليل';
  }
}

// ─── AI analysis results renderer ────────────────────────────────────────────
function vcShowAIResults(analysis, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const condClass = analysis.overallCondition || 'good';
  const isMock    = analysis.mock;

  const damagesHtml = (analysis.damages || []).map(d => `
    <div class="vc-ai-damage-item">
      <span class="vc-severity-badge sev-${d.severity || 'low'}">${
        d.severity === 'high' ? 'عالي' : d.severity === 'medium' ? 'متوسط' : 'منخفض'
      }</span>
      <strong>${escHtml(d.type || '')}</strong>
      ${d.location ? ` — ${escHtml(d.location)}` : ''}
      ${d.estimatedCost ? `<span style="color:#c9a227;margin-right:8px">~${d.estimatedCost} ر.س</span>` : ''}
    </div>`).join('');

  const recHtml = (analysis.recommendations || []).map(r => `<li>${escHtml(r)}</li>`).join('');

  el.innerHTML = `
    <div class="vc-ai-card cond-${condClass}">
      ${isMock ? '<div class="vc-mock-notice">⚠️ تحليل تجريبي — قم بتكوين OPENAI_API_KEY للتحليل الحقيقي</div>' : ''}
      <div class="vc-ai-header">
        <span class="vc-condition-badge badge-${condClass}">${vcConditionLabel(analysis.overallCondition)}</span>
        <span class="vc-ai-score">النقاط: ${analysis.conditionScore ?? '—'}/100</span>
        ${analysis.estimatedRepairCost ? `<span class="vc-ai-cost">تكلفة الإصلاح: ~${analysis.estimatedRepairCost} ر.س</span>` : ''}
      </div>
      <p class="vc-ai-summary">${escHtml(analysis.summary || '')}</p>
      ${damagesHtml ? `<div class="vc-ai-damages"><strong>الأضرار المكتشفة:</strong>${damagesHtml}</div>` : ''}
      ${recHtml     ? `<div class="vc-ai-rec"><strong>التوصيات:</strong><ul>${recHtml}</ul></div>` : ''}
    </div>`;
}

// ─── Compare ──────────────────────────────────────────────────────────────────
async function vcCompare(vehiclePlate) {
  if (!vehiclePlate) {
    vehiclePlate = prompt('أدخل رقم لوحة المركبة للمقارنة:');
    if (!vehiclePlate) return;
  }
  try {
    const res  = await apiFetch('/vehicle-condition/compare', {
      method: 'POST',
      body:   JSON.stringify({ vehiclePlate, photos: [] }),
    });
    const data = await res.json();
    const el   = document.getElementById('vc-history-compare');
    if (!el) return;
    if (!data.hasComparison) {
      el.innerHTML = `<div class="vc-ai-card">لا يوجد تقرير تسليم سابق للمركبة ${escHtml(vehiclePlate)}</div>`;
    } else {
      el.innerHTML = `
        <div class="vc-ai-card">
          <strong>مقارنة المركبة: ${escHtml(vehiclePlate)}</strong>
          <p>آخر تسليم: ${new Date(data.lastDelivery.createdAt).toLocaleString('ar-SA')}</p>
        </div>`;
    }
  } catch { /* silent */ }
}
