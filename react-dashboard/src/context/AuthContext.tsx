import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api';

interface User { id: string; name: string; username: string; role: string; }
interface AuthCtx { user: User | null; token: string | null; login: (u: string, p: string) => Promise<void>; logout: () => void; }

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,  setUser]  = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('telad_token') || localStorage.getItem('telad_quick_token'));

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(async () => {
          try {
            const quick = await api.get('/quick-access/vehicle');
            const employee = quick?.data?.employee;
            if (employee?.id || employee?.name) {
              setUser({ id: employee.id || 'quick', name: employee.name || 'Quick Access', username: 'quick', role: 'quick' });
              return;
            }
          } catch { /* ignore */ }
          setToken(null);
          localStorage.removeItem('telad_token');
          localStorage.removeItem('telad_quick_token');
        });
    }
  }, [token]);

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('telad_token', data.token || data.accessToken);
    setToken(data.token || data.accessToken);
    setUser(data.user);
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    api.post('/auth/quick-logout').catch(() => {});
    localStorage.removeItem('telad_token');
    localStorage.removeItem('telad_quick_token');
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, token, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
