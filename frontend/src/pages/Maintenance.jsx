import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { getMaintenance, addMaintenance, getVehicles } from '../services/api';

const TYPES = ['صيانة دورية', 'تغيير زيت', 'تغيير إطارات', 'فحص شامل', 'إصلاح عطل', 'أخرى'];

const EMPTY_FORM = {
  vehicleId: '', type: TYPES[0], description: '', date: '', cost: '',
};

export default function Maintenance() {
  const { canWrite, addNotification } = useApp();
  const [records, setRecords]     = useState([]);
  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    try {
      const [m, v] = await Promise.all([getMaintenance(), getVehicles()]);
      setRecords(m.data || m.records || m || []);
      setVehicles((v.data || v.vehicles || v || []).slice(0, 50));
    } catch {
      addNotification('تعذّر تحميل بيانات الصيانة', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.vehicleId || !form.date) {
      setError('المركبة والتاريخ مطلوبان');
      return;
    }
    setSaving(true);
    try {
      await addMaintenance({
        ...form,
        cost: form.cost ? Number(form.cost) : undefined,
      });
      addNotification('تمت إضافة سجل الصيانة ✅', 'success');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إضافة سجل الصيانة');
    } finally {
      setSaving(false);
    }
  };

  const update = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ar-SA');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">الصيانة</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{records.length} سجل صيانة</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowForm((p) => !p)} className="btn-primary text-sm">
            {showForm ? 'إلغاء' : '+ إضافة سجل صيانة'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-4">إضافة سجل صيانة جديد</h2>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">المركبة *</label>
              <select className="input-field" value={form.vehicleId} onChange={(e) => update('vehicleId', e.target.value)} required>
                <option value="">اختر مركبة</option>
                {vehicles.map((v) => (
                  <option key={v._id || v.id} value={v._id || v.id}>
                    {v.plate || v.plateNumber} – {v.model || ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">نوع الصيانة</label>
              <select className="input-field" value={form.type} onChange={(e) => update('type', e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">التاريخ *</label>
              <input type="date" className="input-field" value={form.date} onChange={(e) => update('date', e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">التكلفة (ريال)</label>
              <input type="number" className="input-field" value={form.cost} onChange={(e) => update('cost', e.target.value)} placeholder="0.00" min="0" />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">الوصف</label>
              <input className="input-field" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="وصف أعمال الصيانة" />
            </div>
            <div className="col-span-2 md:col-span-3 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* Records table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header text-right">المركبة</th>
                  <th className="table-header text-right">نوع الصيانة</th>
                  <th className="table-header text-right">الوصف</th>
                  <th className="table-header text-right">التاريخ</th>
                  <th className="table-header text-right">التكلفة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {records.map((r) => (
                  <tr key={r._id || r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="table-cell font-medium text-slate-800 dark:text-white">
                      {r.vehicle?.plate || r.vehiclePlate || r.vehicleId || '—'}
                    </td>
                    <td className="table-cell">
                      <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {r.type || '—'}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500 dark:text-slate-400">{r.description || '—'}</td>
                    <td className="table-cell text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                    <td className="table-cell font-medium">
                      {r.cost ? `${Number(r.cost).toLocaleString('ar-SA')} ريال` : '—'}
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-cell text-center py-10 text-slate-400">لا توجد سجلات صيانة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
