import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setToken, getToken, getStoredUser, setStoredUser, setUnauthorizedHandler } from './api';

const Ctx = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [authed, setAuthed] = useState(!!getToken());

  const logout = useCallback(() => { setToken(null); setStoredUser(null); setUser(null); setAuthed(false); }, []);
  useEffect(() => { setUnauthorizedHandler(() => logout()); }, [logout]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/login', { email, password });
    setToken(data.token); setStoredUser(data.user); setUser(data.user); setAuthed(true);
    return data;
  }, []);

  return <Ctx.Provider value={{ user, authed, login, logout }}>{children}</Ctx.Provider>;
}

export const usePlatformAuth = () => useContext(Ctx);
