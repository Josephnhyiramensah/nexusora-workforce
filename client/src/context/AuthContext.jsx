import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setToken, setSubdomain, getToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => { setToken(null); setUser(null); setTenant(null); }, []);

  useEffect(() => { setUnauthorizedHandler(() => logout()); }, [logout]);

  // Hydrate session from a stored token on load.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const { data } = await api.get('/auth/me');
        if (active) { setUser(data.user); setTenant(data.tenant); }
      } catch (e) { setToken(null); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (subdomain, email, password) => {
    setSubdomain(String(subdomain).trim().toLowerCase());
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token); setUser(data.user); setTenant(data.tenant);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
