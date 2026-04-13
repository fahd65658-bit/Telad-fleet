'use strict';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken, removeToken } from '../services/auth';
import { getMe } from '../services/api';
import { connectWS, disconnectWS } from '../services/websocket';

const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser]   = useState(null);
  const [loading, setLoading]           = useState(true);
  const [darkMode, setDarkMode]         = useState(() => {
    try { return localStorage.getItem('telad_dark') === 'true'; }
    catch { return false; }
  });
  const [notifications, setNotifications] = useState([]);

  // ─── Dark mode effect ────────────────────────────────────────────────────────
  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) html.classList.add('dark');
    else          html.classList.remove('dark');
    try { localStorage.setItem('telad_dark', String(darkMode)); } catch {}
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => setDarkMode((prev) => !prev), []);

  // ─── Bootstrap: restore session ──────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    getMe()
      .then((data) => {
        setCurrentUser(data.user || data);
        connectWS(token);
      })
      .catch(() => {
        removeToken();
        setCurrentUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ─── Auth helpers ─────────────────────────────────────────────────────────────
  const login = useCallback((token, user) => {
    setToken(token);
    setCurrentUser(user);
    connectWS(token);
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setCurrentUser(null);
    disconnectWS();
    window.location.href = '/login';
  }, []);

  // ─── Notifications ───────────────────────────────────────────────────────────
  const addNotification = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  const clearNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const value = {
    currentUser,
    loading,
    darkMode,
    toggleDarkMode,
    notifications,
    addNotification,
    clearNotification,
    login,
    logout,
    isAdmin: currentUser?.role === 'admin',
    isSupervisor: ['admin', 'supervisor'].includes(currentUser?.role),
    canWrite: ['admin', 'supervisor', 'operator'].includes(currentUser?.role),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export default AppContext;
