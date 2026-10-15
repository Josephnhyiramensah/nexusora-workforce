import axios from 'axios';

const TOKEN_KEY = 'nexusora_wf_token';
const SUB_KEY = 'nexusora_wf_subdomain';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const getSubdomain = () => localStorage.getItem(SUB_KEY) || '';
export const setSubdomain = (s) => (s ? localStorage.setItem(SUB_KEY, s) : localStorage.removeItem(SUB_KEY));

// D3: derive the tenant from the host (e.g. acme.nexusoraworkforce.com -> 'acme').
// Returns '' on localhost, bare IPs, the apex, or reserved labels (www/app/api…),
// i.e. wherever the host does NOT itself identify a tenant.
const RESERVED_SUBS = ['www', 'app', 'api', 'admin', 'mail', 'static', 'assets'];
export function hostSubdomain() {
  try {
    const h = window.location.hostname || '';
    if (!h || h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return '';
    const parts = h.split('.');
    if (parts.length < 3) return '';                 // apex like nexusoraworkforce.com
    const sub = parts[0].toLowerCase();
    return RESERVED_SUBS.includes(sub) ? '' : sub;
  } catch { return ''; }
}

const api = axios.create({ baseURL: '/api' });

// Attach bearer token + (dev) tenant hint on every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const sub = getSubdomain();
  if (sub) config.headers['x-tenant-subdomain'] = sub;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const st = err.response && err.response.status;
    if (st === 401 && onUnauthorized) onUnauthorized();
    // Subscription expired: route the user to billing to renew (unless already there).
    if (st === 402 && err.response?.data?.code === 'subscription_inactive') {
      try {
        if (!/[?&]tab=billing/.test(window.location.search)) window.location.assign('/settings?tab=billing&expired=1');
      } catch { /* ignore */ }
    }
    return Promise.reject(err);
  }
);

export default api;
