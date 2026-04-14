import React from 'react';
import { useApp } from '../context/AppContext';

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

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
    <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-sm font-medium text-slate-800 dark:text-white">{value || '—'}</span>
  </div>
);

export default function Profile() {
  const { currentUser, logout } = useApp();

  if (!currentUser) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">الملف الشخصي</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">معلومات حسابك</p>
      </div>

      {/* Avatar card */}
      <div className="card flex items-center gap-5">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
          {currentUser.name?.charAt(0) || 'U'}
        </div>
        <div>
          <h2 className="font-bold text-slate-800 dark:text-white text-lg">{currentUser.name}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">@{currentUser.username}</p>
          <span className={`badge mt-1.5 ${ROLE_COLOR[currentUser.role] || ROLE_COLOR.viewer}`}>
            {ROLE_AR[currentUser.role] || currentUser.role}
          </span>
        </div>
      </div>

      {/* Info card */}
      <div className="card">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-2">المعلومات الأساسية</h3>
        <InfoRow label="الاسم الكامل"    value={currentUser.name} />
        <InfoRow label="اسم المستخدم"   value={currentUser.username} />
        <InfoRow label="البريد الإلكتروني" value={currentUser.email} />
        <InfoRow label="الدور"          value={ROLE_AR[currentUser.role] || currentUser.role} />
        <InfoRow label="الحالة"         value={currentUser.active !== false ? 'نشط ✅' : 'معطّل ❌'} />
        {currentUser.createdAt && (
          <InfoRow
            label="تاريخ الإنشاء"
            value={new Date(currentUser.createdAt).toLocaleDateString('ar-SA')}
          />
        )}
        {currentUser.lastLogin && (
          <InfoRow
            label="آخر دخول"
            value={new Date(currentUser.lastLogin).toLocaleString('ar-SA')}
          />
        )}
      </div>

      {/* Permissions card */}
      <div className="card">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-3">الصلاحيات</h3>
        <div className="space-y-2">
          {[
            { label: 'عرض المركبات',        allowed: true },
            { label: 'إضافة/تعديل المركبات', allowed: ['admin','supervisor','operator'].includes(currentUser.role) },
            { label: 'حذف المركبات',         allowed: currentUser.role === 'admin' },
            { label: 'إدارة المستخدمين',     allowed: currentUser.role === 'admin' },
            { label: 'عرض التقارير',         allowed: true },
            { label: 'تصدير البيانات',       allowed: ['admin','supervisor'].includes(currentUser.role) },
          ].map((perm) => (
            <div key={perm.label} className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-300">{perm.label}</span>
              <span className={`text-lg`}>{perm.allowed ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={logout} className="btn-danger w-full">تسجيل الخروج</button>
    </div>
  );
}
