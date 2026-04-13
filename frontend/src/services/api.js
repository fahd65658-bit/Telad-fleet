'use strict';

import axios from 'axios';
import { getToken, removeToken } from './auth';

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor: handle 401 ─────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const loginUser = (credentials) =>
  api.post('/auth/login', credentials).then((r) => r.data);

export const getMe = () =>
  api.get('/auth/me').then((r) => r.data);

// ─── Vehicles ─────────────────────────────────────────────────────────────────
export const getVehicles = () =>
  api.get('/vehicles').then((r) => r.data);

export const addVehicle = (data) =>
  api.post('/vehicles', data).then((r) => r.data);

export const deleteVehicle = (id) =>
  api.delete(`/vehicles/${id}`).then((r) => r.data);

// ─── Users ────────────────────────────────────────────────────────────────────
export const getUsers = () =>
  api.get('/auth/users').then((r) => r.data);

export const addUser = (data) =>
  api.post('/auth/users', data).then((r) => r.data);

export const updateUser = (id, data) =>
  api.put(`/auth/users/${id}`, data).then((r) => r.data);

export const deleteUser = (id) =>
  api.delete(`/auth/users/${id}`).then((r) => r.data);

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () =>
  api.get('/dashboard').then((r) => r.data);

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const getLogs = (params) =>
  api.get('/logs', { params }).then((r) => r.data);

// ─── AI ───────────────────────────────────────────────────────────────────────
export const getAIPrediction = (vehicleId) =>
  api.get('/ai/predict', { params: { vehicleId } }).then((r) => r.data);

// ─── Maintenance ──────────────────────────────────────────────────────────────
export const getMaintenance = () =>
  api.get('/maintenance').then((r) => r.data);

export const addMaintenance = (data) =>
  api.post('/maintenance', data).then((r) => r.data);

// ─── Reports ──────────────────────────────────────────────────────────────────
export const getReports = (params) =>
  api.get('/reports', { params }).then((r) => r.data);

export default api;
