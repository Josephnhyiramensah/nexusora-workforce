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
    // If the account has 2FA enabled, the server withholds the session and
    // returns a challenge; the caller then collects a code and calls verifyTwoFactor.
    if (data.twoFactorRequired) return { twoFactorRequired: true, challengeToken: data.challengeToken };
    setToken(data.token); setUser(data.user); setTenant(data.tenant);
    return data;
  }, []);

  // Step 2 of login for 2FA accounts. Pass { challengeToken, code } or { challengeToken, backupCode }.
  const verifyTwoFactor = useCallback(async ({ challengeToken, code, backupCode }) => {
    const { data } = await api.post('/auth/2fa/login', { challengeToken, token: code, backupCode });
    setToken(data.token); setUser(data.user); setTenant(data.tenant);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, verifyTwoFactor, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
