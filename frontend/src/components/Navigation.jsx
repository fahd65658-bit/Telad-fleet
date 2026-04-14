import React, { useState } from 'react';
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

export default function Navigation() {
  const { currentUser, darkMode, toggleDarkMode, notifications, logout } = useApp();
  const [showNotif, setShowNotif] = useState(false);
  const unread = notifications.length;

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
      {/* Right side: brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">TF</span>
        </div>
        <span className="font-bold text-slate-800 dark:text-white text-sm hidden sm:block">
          تيلاد فليت
        </span>
      </div>

      {/* Left side: actions */}
      <div className="flex items-center gap-3">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title={darkMode ? 'الوضع النهاري' : 'الوضع الليلي'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>

        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotif((p) => !p)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors relative"
          >
            <span className={unread > 0 ? 'bell-ring' : ''}>🔔</span>
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50">
              <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                <p className="font-semibold text-sm text-slate-700 dark:text-slate-200">الإشعارات</p>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">لا توجد إشعارات</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-3 border-b border-slate-50 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300">
                      {n.msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User info */}
        {currentUser && (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">
                {currentUser.name}
              </p>
              <span className={`badge text-[10px] ${ROLE_COLOR[currentUser.role] || ROLE_COLOR.viewer}`}>
                {ROLE_AR[currentUser.role] || currentUser.role}
              </span>
            </div>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {currentUser.name?.charAt(0) || 'U'}
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="btn-secondary text-xs py-1.5 px-3"
          title="تسجيل الخروج"
        >
          خروج
        </button>
      </div>
    </header>
  );
}
