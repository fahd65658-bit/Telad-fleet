import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE || '/api';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('telad_token') || localStorage.getItem('telad_quick_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      // Try refresh
      try {
        const { data } = await axios.post(`${BASE}/auth/refresh`, {}, { withCredentials: true });
        localStorage.setItem('telad_token', data.accessToken);
        err.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return axios(err.config);
      } catch {
        localStorage.removeItem('telad_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
