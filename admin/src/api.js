import axios from 'axios';

const TOKEN_KEY = 'nexusora_wf_platform_token';
const USER_KEY = 'nexusora_wf_platform_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const getStoredUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };
export const setStoredUser = (u) => (u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY));

// Where the product lives — used by "login as" / "open workspace".
export const PRODUCT_URL = (import.meta.env.VITE_PRODUCT_URL || 'http://localhost:5173').replace(/\/+$/, '');

const api = axios.create({ baseURL: '/api/platform' });
api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };
api.interceptors.response.use(
  (r) => r,
  (err) => { if (err.response && err.response.status === 401 && onUnauthorized) onUnauthorized(); return Promise.reject(err); },
);

export default api;
