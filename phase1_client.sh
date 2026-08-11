#!/usr/bin/env bash
# Nexusora Workforce - Phase 1 client (login, auth, tile Home Screen, Employees UI).
# Needs react-router-dom + axios (installed in scaffold). Run ONCE from project root:
#   bash phase1_client.sh
set -e
mkdir -p client/src/api client/src/context client/src/config client/src/components client/src/pages client/src client/src/i18n

echo "  writing client/src/api/client.js"
cat > client/src/api/client.js << 'NEXUSORA_EOF'
import axios from 'axios';

const TOKEN_KEY = 'nexusora_wf_token';
const SUB_KEY = 'nexusora_wf_subdomain';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const getSubdomain = () => localStorage.getItem(SUB_KEY) || '';
export const setSubdomain = (s) => (s ? localStorage.setItem(SUB_KEY, s) : localStorage.removeItem(SUB_KEY));

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
    if (err.response && err.response.status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);

export default api;
NEXUSORA_EOF

echo "  writing client/src/context/AuthContext.jsx"
cat > client/src/context/AuthContext.jsx << 'NEXUSORA_EOF'
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
NEXUSORA_EOF

echo "  writing client/src/config/modules.js"
cat > client/src/config/modules.js << 'NEXUSORA_EOF'
// Home Screen tile map — the 17 modules grouped into sections.
// `enabled:false` tiles render as "Soon". Role visibility: a tile shows if the user's role
// is listed, or the tile is 'all', or the user is super_admin (who sees everything).
export const SECTIONS = [
  { key: 'workforce', tiles: [
    { key: 'workforcePlanning', roles: ['hr_manager'], enabled: false },
    { key: 'employees', route: '/employees', roles: ['hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'], enabled: true },
    { key: 'jobDescriptions', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'talent', tiles: [
    { key: 'recruitment', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'onboarding', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'learning', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'succession', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'operations', tiles: [
    { key: 'attendance', roles: ['hr_manager', 'hr_officer', 'line_manager'], enabled: false },
    { key: 'leave', roles: ['hr_manager', 'hr_officer', 'line_manager', 'employee'], enabled: false },
  ]},
  { key: 'payBenefits', tiles: [
    { key: 'payroll', roles: ['payroll_officer', 'hr_manager'], enabled: false },
    { key: 'welfare', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'performanceCulture', tiles: [
    { key: 'performance', roles: ['hr_manager', 'line_manager'], enabled: false },
    { key: 'relations', roles: ['hr_manager', 'ir_officer'], enabled: false },
    { key: 'engagement', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'selfService', tiles: [
    { key: 'selfService', roles: ['all'], enabled: false },
  ]},
  { key: 'adminAnalytics', tiles: [
    { key: 'documents', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'analytics', roles: ['hr_manager'], enabled: false },
  ]},
];

export function visibleTiles(tiles, role) {
  return tiles.filter((t) => t.roles.includes('all') || role === 'super_admin' || t.roles.includes(role));
}
NEXUSORA_EOF

echo "  writing client/src/components/ProtectedRoute.jsx"
cat > client/src/components/ProtectedRoute.jsx << 'NEXUSORA_EOF'
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  if (loading) return <div className="center-note">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
NEXUSORA_EOF

echo "  writing client/src/components/Layout.jsx"
cat > client/src/components/Layout.jsx << 'NEXUSORA_EOF'
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import LanguageSwitcher from './LanguageSwitcher';

export default function Layout({ children }) {
  const { user, tenant, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__brand">{t('app.name')}</Link>
        <div className="topbar__right">
          {tenant && <span className="topbar__tenant">{tenant.name}</span>}
          <LanguageSwitcher />
          {user && (
            <button className="btn-link" onClick={() => { logout(); navigate('/login'); }}>
              {t('auth.logout')}
            </button>
          )}
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/components/EmployeeForm.jsx"
cat > client/src/components/EmployeeForm.jsx << 'NEXUSORA_EOF'
import { useState } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';

const WORKER_CLASSES = ['staff', 'field_worker', 'tapper', 'operator'];
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'seasonal', 'probation'];
const PAY_BASES = ['salary', 'hourly', 'piece_rate', 'task'];

export default function EmployeeForm({ onClose, onCreated }) {
  const { t } = useLocale();
  const [f, setF] = useState({
    firstName: '', lastName: '', jobTitle: '', department: '',
    workerClass: 'staff', employmentType: 'permanent', payBasis: 'salary', baseSalary: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setError(''); setBusy(true);
    try {
      await api.post('/employees', {
        firstName: f.firstName, lastName: f.lastName,
        employment: { jobTitle: f.jobTitle, department: f.department, workerClass: f.workerClass, employmentType: f.employmentType },
        compensation: { payBasis: f.payBasis, baseSalary: f.baseSalary ? Number(f.baseSalary) : undefined },
      });
      onCreated();
    } catch (e) { setError(e?.response?.data?.message || t('employees.saveFailed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{t('employees.add')}</h2>
        <div className="grid2">
          <label className="field">{t('employees.firstName')}<input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
          <label className="field">{t('employees.lastName')}<input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
          <label className="field">{t('employees.jobTitle')}<input value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></label>
          <label className="field">{t('employees.department')}<input value={f.department} onChange={(e) => set('department', e.target.value)} /></label>
          <label className="field">{t('employees.workerClass')}
            <select value={f.workerClass} onChange={(e) => set('workerClass', e.target.value)}>
              {WORKER_CLASSES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.type')}
            <select value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
              {EMPLOYMENT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.payBasis')}
            <select value={f.payBasis} onChange={(e) => set('payBasis', e.target.value)}>
              {PAY_BASES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.baseSalary')}<input type="number" value={f.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal__actions">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !f.firstName || !f.lastName} onClick={submit}>
            {busy ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/pages/LoginPage.jsx"
cat > client/src/pages/LoginPage.jsx << 'NEXUSORA_EOF'
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { getSubdomain } from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState(getSubdomain() || 'demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(''); setBusy(true);
    try { await login(subdomain, email, password); navigate('/'); }
    catch (e) { setError(e?.response?.data?.message || t('auth.failed')); }
    finally { setBusy(false); }
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-card__head">
          <span className="auth-card__brand">{t('app.name')}</span>
          <LanguageSwitcher />
        </div>
        <h1 className="auth-card__title">{t('auth.signIn')}</h1>
        <p className="auth-card__sub">{t('app.tagline')}</p>
        <label className="field">{t('auth.workspace')}
          <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="demo" onKeyDown={onEnter} />
        </label>
        <label className="field">{t('auth.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} autoComplete="username" />
        </label>
        <label className="field">{t('auth.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} autoComplete="current-password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary btn-block" disabled={busy || !email || !password} onClick={submit}>
          {busy ? t('common.loading') : t('auth.signIn')}
        </button>
      </div>
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/pages/HomeScreen.jsx"
cat > client/src/pages/HomeScreen.jsx << 'NEXUSORA_EOF'
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { SECTIONS, visibleTiles } from '../config/modules';

export default function HomeScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  return (
    <div className="home">
      <h1 className="home__hello">{t('home.hello', { name: user?.name || '' })}</h1>
      <p className="home__role">{t('home.roleLabel')}: <strong>{user?.role}</strong></p>
      {SECTIONS.map((sec) => {
        const tiles = visibleTiles(sec.tiles, user?.role);
        if (!tiles.length) return null;
        return (
          <section key={sec.key} className="tile-section">
            <h2 className="tile-section__title">{t(`sections.${sec.key}`)}</h2>
            <div className="tile-grid">
              {tiles.map((tile) => {
                const label = t(`tiles.${tile.key}`);
                const body = (
                  <>
                    <span className="tile__label">{label}</span>
                    {!tile.enabled && <span className="tile__badge">{t('common.soon')}</span>}
                  </>
                );
                return tile.enabled && tile.route
                  ? <Link key={tile.key} to={tile.route} className="tile tile--live">{body}</Link>
                  : <div key={tile.key} className="tile tile--soon" aria-disabled="true">{body}</div>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/pages/EmployeesPage.jsx"
cat > client/src/pages/EmployeesPage.jsx << 'NEXUSORA_EOF'
import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import EmployeeForm from '../components/EmployeeForm';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];

export default function EmployeesPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const canWrite = WRITE_ROLES.includes(user?.role);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { const { data } = await api.get('/employees', { params: { q, page, limit: 10 } }); setData(data); }
    catch (e) { /* surfaced elsewhere */ }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">{t('tiles.employees')}</h1>
        {canWrite && <button className="btn-primary" onClick={() => setShowForm(true)}>{t('employees.add')}</button>}
      </div>

      <div className="toolbar">
        <input className="toolbar__search" placeholder={t('employees.search')} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(1); }} />
        <button className="btn" onClick={() => load(1)}>{t('common.search')}</button>
      </div>

      {loading ? (
        <p className="center-note">{t('common.loading')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('employees.name')}</th><th>{t('employees.jobTitle')}</th>
              <th>{t('employees.workerClass')}</th><th>{t('employees.type')}</th><th>{t('employees.status')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan="5" className="muted">{t('employees.none')}</td></tr>}
            {data.items.map((e) => (
              <tr key={e._id}>
                <td>{e.firstName} {e.lastName}</td>
                <td>{e.employment?.jobTitle || '—'}</td>
                <td>{e.employment?.workerClass || '—'}</td>
                <td>{e.employment?.employmentType || '—'}</td>
                <td><span className={`pill pill--${e.status}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pager">{t('employees.total', { n: data.total })}</p>

      {showForm && <EmployeeForm onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); load(1); }} />}
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/App.jsx"
cat > client/src/App.jsx << 'NEXUSORA_EOF'
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomeScreen from './pages/HomeScreen';
import EmployeesPage from './pages/EmployeesPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout><HomeScreen /></Layout></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute><Layout><EmployeesPage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
NEXUSORA_EOF

echo "  writing client/src/main.jsx"
cat > client/src/main.jsx << 'NEXUSORA_EOF'
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LocaleProvider } from './context/LocaleContext';
import { AuthProvider } from './context/AuthContext';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>
);
NEXUSORA_EOF

echo "  writing client/src/index.css"
cat > client/src/index.css << 'NEXUSORA_EOF'
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');

:root {
  --navy: #1A3560;
  --navy-700: #142a4d;
  --gold: #C9A227;
  --tech-blue: #2E75B6;
  --ink: #1f2430;
  --muted: #6b7280;
  --line: #e4e8f0;
  --bg: #f5f7fb;
  --card: #ffffff;
  --radius: 12px;
  --shadow: 0 1px 3px rgba(20,42,77,.08), 0 1px 2px rgba(20,42,77,.04);
  font-family: Inter, system-ui, Arial, sans-serif;
  color: var(--ink);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
h1, h2, h3 { font-family: 'Space Grotesk', Inter, sans-serif; color: var(--navy); }
a { color: inherit; text-decoration: none; }
input, select, button { font: inherit; }

/* ---- buttons ---- */
.btn, .btn-primary { padding: 9px 16px; border-radius: 9px; border: 1px solid var(--line); background: #fff; cursor: pointer; transition: .15s; }
.btn:hover { background: #f0f3f9; }
.btn-primary { background: var(--navy); color: #fff; border-color: var(--navy); font-weight: 600; }
.btn-primary:hover { background: var(--navy-700); }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; }
.btn-block { width: 100%; margin-top: 6px; }
.btn-link { background: none; border: none; color: #fff; cursor: pointer; opacity: .9; }
.btn-link:hover { opacity: 1; text-decoration: underline; }

/* ---- shell / topbar ---- */
.shell { min-height: 100vh; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: var(--navy); color: #fff; border-bottom: 3px solid var(--gold); }
.topbar__brand { font-family: 'Space Grotesk'; font-weight: 700; letter-spacing: .3px; color: #fff; }
.topbar__right { display: flex; align-items: center; gap: 16px; }
.topbar__tenant { font-size: .85rem; opacity: .85; padding-right: 4px; border-right: 1px solid #ffffff33; }
.content { max-width: 1080px; margin: 28px auto; padding: 0 24px; }
.center-note { text-align: center; color: var(--muted); padding: 60px 0; }

/* ---- language switcher ---- */
.lang-switcher { display: inline-flex; align-items: center; gap: 6px; }
.lang-switcher__label { font-size: .8rem; opacity: .85; }
.lang-switcher select { padding: 5px 8px; border-radius: 8px; border: 1px solid #ffffff44; background: #fff; color: var(--ink); font-size: .85rem; }

/* ---- auth ---- */
.auth-wrap { min-height: 100vh; display: grid; place-items: center; background:
  radial-gradient(1200px 500px at 50% -10%, #eaf0fb 0%, var(--bg) 60%); padding: 20px; }
.auth-card { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); padding: 26px; border-top: 4px solid var(--gold); }
.auth-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.auth-card__brand { font-family: 'Space Grotesk'; font-weight: 700; color: var(--navy); }
.auth-card__head .lang-switcher__label { color: var(--muted); }
.auth-card__head .lang-switcher select { border-color: var(--line); }
.auth-card__title { margin: 2px 0 2px; font-size: 1.4rem; }
.auth-card__sub { margin: 0 0 16px; color: var(--muted); font-size: .9rem; }

/* ---- fields ---- */
.field { display: flex; flex-direction: column; gap: 5px; font-size: .85rem; color: #374151; margin-bottom: 12px; }
.field input, .field select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 9px; background: #fff; }
.field input:focus, .field select:focus { outline: 2px solid var(--tech-blue); outline-offset: 0; border-color: var(--tech-blue); }
.form-error { color: #b42318; background: #fef3f2; border: 1px solid #fecdca; padding: 8px 10px; border-radius: 8px; font-size: .85rem; margin: 4px 0 10px; }

/* ---- home / tiles ---- */
.home__hello { margin: 0 0 2px; font-size: 1.6rem; }
.home__role { margin: 0 0 22px; color: var(--muted); font-size: .9rem; }
.tile-section { margin-bottom: 26px; }
.tile-section__title { font-size: .8rem; text-transform: uppercase; letter-spacing: .12em; color: var(--tech-blue); margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.tile { position: relative; display: flex; align-items: center; min-height: 84px; padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); transition: .15s; }
.tile--live { cursor: pointer; }
.tile--live:hover { transform: translateY(-2px); border-color: var(--gold); box-shadow: 0 6px 18px rgba(20,42,77,.12); }
.tile--live::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 4px; border-radius: 4px; background: var(--gold); }
.tile--soon { opacity: .6; }
.tile__label { font-weight: 600; color: var(--navy); }
.tile__badge { position: absolute; top: 10px; right: 10px; font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); background: #eef1f6; padding: 2px 7px; border-radius: 999px; }

/* ---- page / table ---- */
.page__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page__title { margin: 0; font-size: 1.5rem; }
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.toolbar__search { flex: 1; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; }
.table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.table th, .table td { text-align: left; padding: 11px 14px; border-bottom: 1px solid var(--line); font-size: .9rem; }
.table th { background: #f0f3f9; color: var(--navy); font-family: 'Space Grotesk'; font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; }
.table tr:last-child td { border-bottom: none; }
.muted { color: var(--muted); text-align: center; padding: 26px; }
.pager { color: var(--muted); font-size: .85rem; margin-top: 12px; }
.pill { font-size: .72rem; padding: 3px 9px; border-radius: 999px; text-transform: capitalize; }
.pill--active { background: #e7f6ec; color: #1a6b3c; }
.pill--suspended { background: #fef7e6; color: #9a6b00; }
.pill--terminated { background: #fdecea; color: #b42318; }

/* ---- modal ---- */
.modal-overlay { position: fixed; inset: 0; background: rgba(20,42,77,.45); display: grid; place-items: center; padding: 20px; z-index: 50; }
.modal { width: 100%; max-width: 560px; background: #fff; border-radius: 16px; padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.25); border-top: 4px solid var(--gold); }
.modal__title { margin: 0 0 16px; font-size: 1.25rem; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

/* RTL awareness (Arabic): mirror bar + tile accent */
[dir="rtl"] .topbar { flex-direction: row-reverse; }
[dir="rtl"] .tile--live::before { left: auto; right: 0; }
[dir="rtl"] .topbar__tenant { border-right: none; border-left: 1px solid #ffffff33; padding-right: 0; padding-left: 4px; }

@media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } .content { padding: 0 16px; } }
NEXUSORA_EOF

echo "  writing client/src/i18n/en.json"
cat > client/src/i18n/en.json << 'NEXUSORA_EOF'
{
  "app": { "name": "Nexusora Workforce", "tagline": "Intelligent HR for African industry & agribusiness" },
  "common": { "language": "Language", "loading": "Loading…", "save": "Save", "cancel": "Cancel", "search": "Search", "soon": "Soon" },
  "auth": { "signIn": "Sign in", "workspace": "Workspace", "email": "Email", "password": "Password", "logout": "Log out", "failed": "Sign in failed" },
  "home": { "hello": "Hello, {name}", "roleLabel": "Signed in as" },
  "sections": {
    "workforce": "Workforce", "talent": "Talent", "operations": "Operations",
    "payBenefits": "Pay & Benefits", "performanceCulture": "Performance & Culture",
    "selfService": "Self-Service", "adminAnalytics": "Admin & Analytics"
  },
  "tiles": {
    "workforcePlanning": "Workforce Planning", "employees": "Employee Records", "jobDescriptions": "Job Descriptions",
    "recruitment": "Recruitment", "onboarding": "Onboarding", "learning": "Learning & Competency", "succession": "Talent & Succession",
    "attendance": "Attendance & Absenteeism", "leave": "Leave",
    "payroll": "Compensation & Payroll", "welfare": "Welfare & Social Services",
    "performance": "Performance", "relations": "Employee Relations", "engagement": "Engagement",
    "selfService": "Self-Service", "documents": "Documents & Policies", "analytics": "Analytics & Dashboards"
  },
  "employees": {
    "add": "Add employee", "search": "Search employees…", "name": "Name", "jobTitle": "Job title",
    "workerClass": "Worker class", "type": "Type", "status": "Status", "firstName": "First name", "lastName": "Last name",
    "department": "Department", "payBasis": "Pay basis", "baseSalary": "Base salary",
    "none": "No employees yet", "total": "{n} employee(s)", "saveFailed": "Could not save employee"
  }
}
NEXUSORA_EOF

echo "  writing client/src/i18n/fr.json"
cat > client/src/i18n/fr.json << 'NEXUSORA_EOF'
{
  "app": { "tagline": "RH intelligentes pour l'industrie et l'agro-industrie africaines" },
  "common": { "language": "Langue", "loading": "Chargement…", "save": "Enregistrer", "cancel": "Annuler", "search": "Rechercher", "soon": "Bientôt" },
  "auth": { "signIn": "Se connecter", "workspace": "Espace de travail", "email": "E-mail", "password": "Mot de passe", "logout": "Se déconnecter", "failed": "Échec de la connexion" },
  "home": { "hello": "Bonjour, {name}", "roleLabel": "Connecté en tant que" },
  "sections": {
    "workforce": "Effectifs", "talent": "Talents", "operations": "Opérations",
    "payBenefits": "Paie & Avantages", "performanceCulture": "Performance & Culture",
    "selfService": "Libre-service", "adminAnalytics": "Administration & Analyses"
  },
  "tiles": {
    "workforcePlanning": "Planification des effectifs", "employees": "Dossiers du personnel", "jobDescriptions": "Descriptions de poste",
    "recruitment": "Recrutement", "onboarding": "Intégration", "learning": "Formation & Compétences", "succession": "Talents & Succession",
    "attendance": "Présence & Absentéisme", "leave": "Congés",
    "payroll": "Rémunération & Paie", "welfare": "Bien-être & Services sociaux",
    "performance": "Performance", "relations": "Relations sociales", "engagement": "Engagement",
    "selfService": "Libre-service", "documents": "Documents & Politiques", "analytics": "Analyses & Tableaux de bord"
  },
  "employees": {
    "add": "Ajouter un employé", "search": "Rechercher des employés…", "name": "Nom", "jobTitle": "Intitulé du poste",
    "workerClass": "Catégorie", "type": "Type", "status": "Statut", "firstName": "Prénom", "lastName": "Nom",
    "department": "Département", "payBasis": "Base de paie", "baseSalary": "Salaire de base",
    "none": "Aucun employé pour l'instant", "total": "{n} employé(s)", "saveFailed": "Enregistrement impossible"
  }
}
NEXUSORA_EOF

echo
echo "Phase 1 client written (14 files)."
echo "Ensure deps: (cd client && npm install react-router-dom axios)"
echo "Then: cd client && npm run dev   (API must be running on :5002)"
