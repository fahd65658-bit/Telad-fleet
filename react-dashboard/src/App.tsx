import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import LoginPage    from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MapPage      from './pages/MapPage';
import VehiclesPage from './pages/VehiclesPage';

const NAV_ITEMS = [
  { to: '/dashboard', icon: '📊', label: 'لوحة التحكم', roles: ['viewer','operator','supervisor','admin'] },
  { to: '/map',       icon: '🗺️', label: 'الخريطة',    roles: ['viewer','operator','supervisor','admin'] },
  { to: '/vehicles',  icon: '🚗', label: 'المركبات',   roles: ['operator','supervisor','admin'] },
];

function AppShell() {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">🚗 تيلاد فليت</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(n => n.roles.includes(user.role)).map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={logout}>تسجيل الخروج</button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-title">TELAD FLEET</div>
          <div className="topbar-user">
            <span style={{ fontSize: 13 }}>{user.name}</span>
            <span className="role-pill">{user.role}</span>
          </div>
        </header>
        <main className="page-content">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/map"       element={<MapPage />} />
            <Route path="/vehicles"  element={<VehiclesPage />} />
            <Route path="*"          element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*"     element={<AppShell />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
