import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext';

import Login       from './pages/Login';
import Dashboard   from './pages/Dashboard';
import Vehicles    from './pages/Vehicles';
import Users       from './pages/Users';
import Maintenance from './pages/Maintenance';
import Reports     from './pages/Reports';
import Profile     from './pages/Profile';

import Navigation from './components/Navigation';
import Sidebar    from './components/Sidebar';

// ─── Protected layout wrapper ─────────────────────────────────────────────────
const AppLayout = ({ children }) => (
  <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-900">
    <Sidebar />
    <div className="flex flex-col flex-1 overflow-hidden">
      <Navigation />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  </div>
);

// ─── Route guard ─────────────────────────────────────────────────────────────
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { currentUser, loading, isAdmin } = useApp();
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!currentUser) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  const { currentUser, loading } = useApp();

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">جاري التحميل...</p>
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/dashboard" replace /> : <Login />} />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <AppLayout><Dashboard /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/vehicles" element={
          <ProtectedRoute>
            <AppLayout><Vehicles /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/users" element={
          <ProtectedRoute adminOnly>
            <AppLayout><Users /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/maintenance" element={
          <ProtectedRoute>
            <AppLayout><Maintenance /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute>
            <AppLayout><Reports /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute>
            <AppLayout><Profile /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
