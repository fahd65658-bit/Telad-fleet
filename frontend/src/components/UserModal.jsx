import React, { useState, useEffect } from 'react';

const ROLES = [
  { value: 'admin',      label: 'مدير النظام' },
  { value: 'supervisor', label: 'مشرف' },
  { value: 'operator',   label: 'مشغّل' },
  { value: 'viewer',     label: 'مستعرض' },
];

export default function UserModal({ isOpen, onClose, onSave, editUser }) {
  const [form, setForm] = useState({
    name: '', username: '', email: '', password: '', role: 'operator',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (editUser) {
      setForm({
        name:     editUser.name     || '',
        username: editUser.username || '',
        email:    editUser.email    || '',
        password: '',
        role:     editUser.role     || 'operator',
      });
    } else {
      setForm({ name: '', username: '', email: '', password: '', role: 'operator' });
    }
    setError('');
  }, [editUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.username) {
      setError('الاسم واسم المستخدم مطلوبان');
      return;
    }
    if (!editUser && !form.password) {
      setError('كلمة المرور مطلوبة للمستخدم الجديد');
      return;
    }
    setLoading(true);
    try {
      const data = { ...form };
      if (editUser && !data.password) delete data.password;
      await onSave(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setLoading(false);
    }
  };

  const update = (field, val) => setForm((p) => ({ ...p, [field]: val }));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 dark:text-white">
            {editUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الاسم الكامل</label>
            <input className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="أحمد محمد" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">اسم المستخدم</label>
            <input className="input-field" value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="ahmed_m" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">البريد الإلكتروني</label>
            <input type="email" className="input-field" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="ahmed@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              كلمة المرور {editUser && <span className="text-slate-400 text-xs">(اتركها فارغة للإبقاء على الحالية)</span>}
            </label>
            <input type="password" className="input-field" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="••••••••" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الدور</label>
            <select className="input-field" value={form.role} onChange={(e) => update('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
