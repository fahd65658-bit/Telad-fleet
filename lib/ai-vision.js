'use strict';
/**
 * TELAD FLEET – AI Damage Detection Module
 * ─────────────────────────────────────────────────────────────────────────
 * Uses OpenAI GPT-4o Vision API to inspect vehicle photos uploaded during
 * a handover and produce a structured Arabic damage report.
 *
 * Falls back to a rule-based local engine when no API key is set.
 *
 * Usage:
 *   const { analyzeVehicleDamage } = require('./lib/ai-vision');
 *   const report = await analyzeVehicleDamage(images, vehicle, handoverType);
 *   // report: { summary, damages, severityScore, recommendation, source }
 */

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL   = process.env.OPENAI_VISION_MODEL || 'gpt-4o';

// ── Types & constants ────────────────────────────────────────────────────────
const MAX_IMAGES     = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;  // 4 MB per image (base64 ≈ 5.3 MB)
const SEVERITY_LABELS = { 0: 'سليمة', 1: 'طفيف', 2: 'متوسط', 3: 'جسيم', 4: 'حرج' };

// ── Local fallback engine ─────────────────────────────────────────────────────
function _localAnalysis(vehicle, handoverType) {
  const damages = [];
  let score = 0;

  if ((vehicle.fuelLevel || 0) < 20) {
    damages.push({ area: 'الوقود', description: 'مستوى الوقود منخفض جداً', severity: 1 });
    score += 10;
  }
  if ((vehicle.km || 0) > 70000) {
    damages.push({ area: 'المحرك', description: 'الكيلومترات مرتفعة – يُنصح بفحص شامل', severity: 2 });
    score += 20;
  }
  if (vehicle.status === 'maintenance') {
    damages.push({ area: 'عام', description: 'المركبة في الصيانة حالياً', severity: 3 });
    score += 30;
  }
  if (vehicle.inspection?.status === 'منتهي') {
    damages.push({ area: 'الفحص الدوري', description: 'الفحص الدوري منتهي الصلاحية', severity: 2 });
    score += 20;
  }
  if (vehicle.insurance?.status === 'expiring') {
    damages.push({ area: 'التأمين', description: 'التأمين على وشك الانتهاء', severity: 1 });
    score += 10;
  }

  const severityScore = Math.min(Math.round(score / 25), 4);
  const summary = damages.length === 0
    ? `✅ تم ${handoverType} المركبة بحالة جيدة. لا توجد ملاحظات.`
    : `⚠️ تم رصد ${damages.length} ملاحظة أثناء ${handoverType} المركبة ${vehicle.name}.`;

  const recommendation = severityScore === 0 ? 'لا توجد إجراءات مطلوبة'
    : severityScore <= 1 ? 'مراجعة بسيطة عند الفرصة'
    : severityScore === 2 ? 'جدولة صيانة خلال أسبوع'
    : severityScore === 3 ? 'صيانة عاجلة مطلوبة'
    : '🔴 إيقاف المركبة عن العمل فوراً';

  return { summary, damages, severityScore, severity: SEVERITY_LABELS[severityScore], recommendation, source: 'rules' };
}

// ── OpenAI Vision call ───────────────────────────────────────────────────────
async function _visionAnalysis(images, vehicle, handoverType) {
  // Build image_url content parts
  const imageContent = images.slice(0, MAX_IMAGES).map((img) => {
    const data = img.data || img;  // base64 string (data URI or raw base64)
    const url  = data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;
    return {
      type: 'image_url',
      image_url: { url, detail: 'high' },
    };
  });

  const systemPrompt = [
    'أنت خبير تقييم أضرار السيارات لشركة نقل سعودية.',
    'مهمتك: فحص صور المركبة وإنتاج تقرير دقيق باللغة العربية.',
    'كن موضوعياً ومختصراً. ركّز على الأضرار المرئية فقط.',
  ].join(' ');

  const userPrompt = [
    `نوع العملية: ${handoverType}`,
    `المركبة: ${vehicle.name} - لوحة: ${vehicle.plate}`,
    `الكيلومتراج: ${vehicle.km || 0} كم`,
    `مستوى الوقود: ${vehicle.fuelLevel || 0}%`,
    '',
    'حلّل الصور وأجب بصيغة JSON كالتالي:',
    '{',
    '  "summary": "ملخص قصير",',
    '  "damages": [{ "area": "...", "description": "...", "severity": 0-4 }],',
    '  "severityScore": 0-4,',
    '  "recommendation": "..."',
    '}',
    'حيث severity: 0=سليم، 1=طفيف، 2=متوسط، 3=جسيم، 4=حرج',
  ].join('\n');

  const body = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          ...imageContent,
        ],
      },
    ],
    max_tokens: 600,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI Vision error: ${resp.status} – ${err.slice(0,200)}`);
  }

  const json = await resp.json();
  const raw  = json.choices?.[0]?.message?.content || '{}';
  const data = JSON.parse(raw);

  return {
    summary:       data.summary || '—',
    damages:       Array.isArray(data.damages) ? data.damages : [],
    severityScore: Number(data.severityScore) || 0,
    severity:      SEVERITY_LABELS[Number(data.severityScore) || 0],
    recommendation: data.recommendation || '—',
    source: 'openai-vision',
    model: OPENAI_MODEL,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * analyzeVehicleDamage(images, vehicle, handoverType)
 *
 * @param {Array} images  - Array of { side, data } where data is base64/dataURI
 * @param {Object} vehicle - Vehicle object from DB
 * @param {string} handoverType - 'استلام' | 'تسليم'
 * @returns {Object} report { summary, damages, severityScore, severity, recommendation, source }
 */
async function analyzeVehicleDamage(images, vehicle, handoverType = 'استلام') {
  // If no images → always use local
  if (!images || images.length === 0) {
    return _localAnalysis(vehicle, handoverType);
  }

  // If OpenAI Vision configured, use it
  if (OPENAI_API_KEY) {
    try {
      return await _visionAnalysis(images, vehicle, handoverType);
    } catch (err) {
      console.error('[AI Vision] Falling back to rules:', err.message);
    }
  }

  // Fallback: local rule engine
  return _localAnalysis(vehicle, handoverType);
}

/**
 * formatReportText(report)
 * Converts structured report to a human-readable Arabic string for storage.
 */
function formatReportText(report) {
  if (!report) return '—';
  let txt = report.summary + '\n';
  if (report.damages?.length) {
    txt += '\nالأضرار المرصودة:\n';
    for (const d of report.damages) {
      const sev = SEVERITY_LABELS[d.severity] || '';
      txt += `• ${d.area}: ${d.description} [${sev}]\n`;
    }
  }
  txt += `\nالتوصية: ${report.recommendation}`;
  if (report.source === 'openai-vision') txt += ` (تحليل AI - ${report.model})`;
  return txt.trim();
}

module.exports = { analyzeVehicleDamage, formatReportText, SEVERITY_LABELS };
