import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setUnauthorizedHandler } from '../api';

const AuthContext = createContext(null);

const DEFAULT_CONFIG = { demo: false, signup: 'invite', demoResetHours: null, needsSetup: false };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    Promise.all([
      api.get('/config').then((res) => setConfig({ ...DEFAULT_CONFIG, ...res.data })).catch(() => {}),
      api.get('/auth/session').then((res) => setUser(res.data.user)).catch(() => setUser(null)),
    ]).finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  /** kind: 'candidate' | 'admin' — public demo only. */
  const tryDemo = useCallback(async (kind) => {
    const res = await api.post(`/demo/${kind}`);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const logoutEverywhere = useCallback(async () => {
    await api.post('/auth/logout-all');
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const res = await api.post('/auth/password', { current_password: currentPassword, new_password: newPassword });
    setUser(res.data.user);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, config, loading, login, register, tryDemo, logout, logoutEverywhere, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
