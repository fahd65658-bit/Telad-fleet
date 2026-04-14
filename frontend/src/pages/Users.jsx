import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { getUsers, addUser, updateUser, deleteUser } from '../services/api';
import UserModal from '../components/UserModal';

const ROLE_AR = {
  admin:      'مدير النظام',
  supervisor: 'مشرف',
  operator:   'مشغّل',
  viewer:     'مستعرض',
};

const ROLE_COLOR = {
  admin:      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  supervisor: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  operator:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  viewer:     'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

export default function Users() {
  const { addNotification, currentUser } = useApp();
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data.data || data.users || data || []);
    } catch {
      addNotification('تعذّر تحميل بيانات المستخدمين', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditUser(null); setModalOpen(true); };
  const openEdit = (u) => { setEditUser(u);   setModalOpen(true); };

  const handleSave = async (form) => {
    if (editUser) {
      await updateUser(editUser._id || editUser.id, form);
      addNotification('تم تحديث المستخدم بنجاح ✅', 'success');
    } else {
      await addUser(form);
      addNotification('تمت إضافة المستخدم بنجاح ✅', 'success');
    }
    await load();
  };

  const handleToggleActive = async (u) => {
    try {
      await updateUser(u._id || u.id, { active: !u.active });
      addNotification(u.active ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب', 'info');
      await load();
    } catch {
      addNotification('فشل تغيير حالة الحساب', 'error');
    }
  };

  const handleDelete = async (u) => {
    if (u._id === currentUser?._id || u.id === currentUser?.id) {
      addNotification('لا يمكنك حذف حسابك الخاص', 'error');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${u.name}"؟`)) return;
    try {
      await deleteUser(u._id || u.id);
      addNotification('تم حذف المستخدم', 'info');
      await load();
    } catch {
      addNotification('فشل حذف المستخدم', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">المستخدمون</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{users.length} مستخدم مسجل</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ إضافة مستخدم</button>
      </div>

      {/* Table */}
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
                  <th className="table-header text-right">الاسم</th>
                  <th className="table-header text-right">اسم المستخدم</th>
                  <th className="table-header text-right">البريد</th>
                  <th className="table-header text-right">الدور</th>
                  <th className="table-header text-right">الحالة</th>
                  <th className="table-header text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {users.map((u) => (
                  <tr key={u._id || u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="table-cell font-medium text-slate-800 dark:text-white">{u.name}</td>
                    <td className="table-cell text-slate-500 dark:text-slate-400 font-mono text-xs">{u.username}</td>
                    <td className="table-cell text-slate-500 dark:text-slate-400 text-xs">{u.email || '—'}</td>
                    <td className="table-cell">
                      <span className={`badge ${ROLE_COLOR[u.role] || ROLE_COLOR.viewer}`}>
                        {ROLE_AR[u.role] || u.role}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${u.active !== false ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                        {u.active !== false ? 'نشط' : 'معطّل'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(u)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs font-medium">تعديل</button>
                        <button onClick={() => handleToggleActive(u)} className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 text-xs font-medium">
                          {u.active !== false ? 'تعطيل' : 'تفعيل'}
                        </button>
                        <button onClick={() => handleDelete(u)} className="text-red-600 hover:text-red-800 dark:text-red-400 text-xs font-medium">حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-cell text-center py-10 text-slate-400">لا توجد بيانات</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editUser={editUser}
      />
    </div>
  );
}
