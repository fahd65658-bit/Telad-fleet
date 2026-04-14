import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { getVehicles, addVehicle, deleteVehicle } from '../services/api';
import VehicleCard from '../components/VehicleCard';
import Map from '../components/Map';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const EMPTY_FORM = { plate: '', model: '', type: '', driver: '', status: 'active', location: '' };

export default function Vehicles() {
  const { canWrite, isAdmin, addNotification } = useApp();
  const [vehicles, setVehicles]   = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [showMap, setShowMap]     = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getVehicles();
      const list = data.data || data.vehicles || data || [];
      setVehicles(list);
      setFiltered(list);
    } catch {
      addNotification('تعذّر تحميل بيانات المركبات', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? vehicles.filter((v) =>
            (v.plate || v.plateNumber || '').toLowerCase().includes(q) ||
            (v.model || '').toLowerCase().includes(q) ||
            (v.driver || '').toLowerCase().includes(q)
          )
        : vehicles
    );
  }, [search, vehicles]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.plate) { setError('رقم اللوحة مطلوب'); return; }
    setSaving(true);
    try {
      await addVehicle(form);
      addNotification('تمت إضافة المركبة بنجاح ✅', 'success');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إضافة المركبة');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المركبة؟')) return;
    try {
      await deleteVehicle(id);
      addNotification('تم حذف المركبة', 'info');
      await load();
    } catch {
      addNotification('فشل حذف المركبة', 'error');
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('helvetica');
    doc.text('TELAD FLEET - Vehicle Report', 14, 15);
    doc.text(`Generated: ${new Date().toLocaleDateString('ar-SA')}`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Plate', 'Model', 'Type', 'Driver', 'Status', 'Location']],
      body: filtered.map((v) => [
        v.plate || v.plateNumber || '',
        v.model || '',
        v.type  || '',
        v.driver || '',
        v.status || '',
        v.location || '',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save('vehicles-report.pdf');
  };

  const update = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">المركبات</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{vehicles.length} مركبة مسجلة</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowMap((p) => !p)} className="btn-secondary text-sm">
            {showMap ? '📋 عرض جدول' : '🗺️ عرض الخريطة'}
          </button>
          <button onClick={exportPDF} className="btn-secondary text-sm">📄 تصدير PDF</button>
          {canWrite && (
            <button onClick={() => setShowForm((p) => !p)} className="btn-primary text-sm">
              {showForm ? 'إلغاء' : '+ إضافة مركبة'}
            </button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-4">إضافة مركبة جديدة</h2>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">رقم اللوحة *</label>
              <input className="input-field" value={form.plate} onChange={(e) => update('plate', e.target.value)} placeholder="أ ب ج 1234" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">الموديل</label>
              <input className="input-field" value={form.model} onChange={(e) => update('model', e.target.value)} placeholder="تويوتا هايلكس" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">النوع</label>
              <input className="input-field" value={form.type} onChange={(e) => update('type', e.target.value)} placeholder="بيك أب" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">السائق</label>
              <input className="input-field" value={form.driver} onChange={(e) => update('driver', e.target.value)} placeholder="اسم السائق" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">الموقع</label>
              <input className="input-field" value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="الرياض" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">الحالة</label>
              <select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="active">نشط</option>
                <option value="maintenance">صيانة</option>
                <option value="inactive">متوقف</option>
              </select>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input
          className="input-field pr-9"
          placeholder="بحث بالرقم أو الموديل أو السائق..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Map view */}
      {showMap ? (
        <div className="card" style={{ height: 500 }}>
          <Map vehicles={filtered} />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">🚗</p>
          <p className="text-slate-500 dark:text-slate-400">{search ? 'لا توجد نتائج مطابقة' : 'لا توجد مركبات مسجلة'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((v) => (
            <VehicleCard
              key={v._id || v.id || v.plate}
              vehicle={v}
              onDelete={handleDelete}
              canDelete={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
