import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const NAV_ITEMS = [
  { to: '/dashboard',   icon: '📊', label: 'لوحة التحكم', roles: null },
  { to: '/vehicles',    icon: '🚗', label: 'المركبات',    roles: null },
  { to: '/maintenance', icon: '🔧', label: 'الصيانة',     roles: null },
  { to: '/reports',     icon: '📈', label: 'التقارير',    roles: null },
  { to: '/users',       icon: '👥', label: 'المستخدمون',  roles: ['admin'] },
  { to: '/profile',     icon: '👤', label: 'الملف الشخصي', roles: null },
];

export default function Sidebar() {
  const { currentUser } = useApp();
  const role = currentUser?.role;

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar dark:bg-[#0d1626] flex flex-col overflow-hidden">
      {/* Logo area */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
          <span className="text-white font-extrabold text-sm">TF</span>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">TELAD FLEET</p>
          <p className="text-slate-400 text-[10px]">نظام إدارة الأسطول</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <p className="text-slate-500 text-[10px] text-center">
          © {new Date().getFullYear()} TELAD FLEET v2.0
        </p>
      </div>
    </aside>
  );
}
