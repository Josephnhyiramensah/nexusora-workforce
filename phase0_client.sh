#!/usr/bin/env bash
# Nexusora Workforce - Phase 0 client i18n + language switcher (auto-generated, build-tested).
# Run ONCE from the project root:  bash phase0_client.sh
set -e
mkdir -p client/src/i18n client/src/context client/src/components client/src client/.

echo "  writing client/src/i18n/en.json"
cat > client/src/i18n/en.json << 'NEXUSORA_EOF'
{
  "app": { "name": "Nexusora Workforce", "tagline": "Intelligent HR for African industry & agribusiness" },
  "common": { "language": "Language", "loading": "Loading…", "save": "Save", "cancel": "Cancel" },
  "nav": { "home": "Home", "employees": "Employees", "attendance": "Attendance", "leave": "Leave", "payroll": "Payroll", "reports": "Reports" },
  "home": { "welcome": "Welcome to {app}", "chooseLanguage": "Choose your language", "direction": "Text direction" }
}
NEXUSORA_EOF

echo "  writing client/src/i18n/fr.json"
cat > client/src/i18n/fr.json << 'NEXUSORA_EOF'
{
  "app": { "tagline": "RH intelligentes pour l'industrie et l'agro-industrie africaines" },
  "common": { "language": "Langue", "loading": "Chargement…", "save": "Enregistrer", "cancel": "Annuler" },
  "nav": { "home": "Accueil", "employees": "Employés", "attendance": "Présence", "leave": "Congés", "payroll": "Paie", "reports": "Rapports" },
  "home": { "welcome": "Bienvenue sur {app}", "chooseLanguage": "Choisissez votre langue", "direction": "Sens du texte" }
}
NEXUSORA_EOF

echo "  writing client/src/i18n/index.js"
cat > client/src/i18n/index.js << 'NEXUSORA_EOF'
// Lightweight i18n core. Add a language: drop an <code>.json here and import it below.
import en from './en.json';
import fr from './fr.json';

const catalogs = { en, fr };
export const DEFAULT_LOCALE = 'en';

function getFrom(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
}
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

// t() bound to a locale: primary -> English fallback -> key (logged in dev).
export function makeT(locale) {
  const primary = catalogs[locale] || {};
  const fallback = catalogs[DEFAULT_LOCALE] || {};
  return function t(key, vars) {
    let val = getFrom(primary, key);
    if (val == null) val = getFrom(fallback, key);
    if (val == null) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return interpolate(val, vars);
  };
}
export function hasCatalog(locale) { return Boolean(catalogs[locale]); }
NEXUSORA_EOF

echo "  writing client/src/context/LocaleContext.jsx"
cat > client/src/context/LocaleContext.jsx << 'NEXUSORA_EOF'
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { makeT, DEFAULT_LOCALE } from '../i18n';

const STORAGE_KEY = 'nexusora_wf_locale';
const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  // Fallback registry until /api/config responds.
  const [locales, setLocales] = useState([
    { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', status: 'ready' },
  ]);
  const [locale, setLocaleState] = useState(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE);

  // Pull the full locale registry from the API so the client mirrors the server.
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => { if (Array.isArray(cfg.locales)) setLocales(cfg.locales); })
      .catch(() => { /* keep fallback */ });
  }, []);

  const dir = useMemo(() => {
    const found = locales.find((l) => l.code === locale);
    return found ? found.dir : 'ltr';
  }, [locale, locales]);

  // Apply language + direction to <html> and persist the choice.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale, dir]);

  const t = useMemo(() => makeT(locale), [locale]);
  const setLocale = (code) => setLocaleState(code);

  const value = useMemo(() => ({ locale, setLocale, locales, dir, t }), [locale, locales, dir, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
NEXUSORA_EOF

echo "  writing client/src/components/LanguageSwitcher.jsx"
cat > client/src/components/LanguageSwitcher.jsx << 'NEXUSORA_EOF'
import { useLocale } from '../context/LocaleContext';

// Language dropdown. Shows every registered locale; a bullet marks languages whose
// translations are not shipped yet (they fall back to English text but still apply RTL/LTR).
export default function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useLocale();
  return (
    <label className="lang-switcher">
      <span className="lang-switcher__label">{t('common.language')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {(l.nativeName || l.name) + (l.status && l.status !== 'ready' ? ' •' : '')}
          </option>
        ))}
      </select>
    </label>
  );
}
NEXUSORA_EOF

echo "  writing client/src/App.jsx"
cat > client/src/App.jsx << 'NEXUSORA_EOF'
import LanguageSwitcher from './components/LanguageSwitcher';
import { useLocale } from './context/LocaleContext';

export default function App() {
  const { t, locale, dir } = useLocale();
  return (
    <div className="app">
      <header className="app__bar">
        <strong className="app__brand">{t('app.name')}</strong>
        <LanguageSwitcher />
      </header>
      <main className="app__main">
        <h1>{t('home.welcome', { app: t('app.name') })}</h1>
        <p className="app__tagline">{t('app.tagline')}</p>
        <ul className="nav-demo">
          <li>{t('nav.home')}</li>
          <li>{t('nav.employees')}</li>
          <li>{t('nav.attendance')}</li>
          <li>{t('nav.leave')}</li>
          <li>{t('nav.payroll')}</li>
          <li>{t('nav.reports')}</li>
        </ul>
        <p className="meta">{t('home.direction')}: <code>{dir}</code> · locale <code>{locale}</code></p>
      </main>
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/main.jsx"
cat > client/src/main.jsx << 'NEXUSORA_EOF'
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from './context/LocaleContext';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>
);
NEXUSORA_EOF

echo "  writing client/src/index.css"
cat > client/src/index.css << 'NEXUSORA_EOF'
:root {
  --navy: #1A3560;
  --gold: #C9A227;
  --tech-blue: #2E75B6;
  --ink: #222;
  --bg: #f6f8fb;
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); }

.app__bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 22px; background: var(--navy); color: #fff;
  border-bottom: 3px solid var(--gold);
}
.app__brand { font-size: 1.1rem; letter-spacing: .3px; }
.app__main { max-width: 760px; margin: 40px auto; padding: 0 22px; }
.app__main h1 { color: var(--navy); }
.app__tagline { color: #555; margin-top: -6px; }

.lang-switcher { display: inline-flex; align-items: center; gap: 8px; }
.lang-switcher__label { font-size: .85rem; opacity: .9; }
.lang-switcher select {
  padding: 6px 10px; border-radius: 8px; border: 1px solid #ffffff55;
  background: #ffffff; color: var(--ink); font-size: .9rem;
}

.nav-demo { display: flex; flex-wrap: wrap; gap: 10px; list-style: none; padding: 0; }
.nav-demo li {
  padding: 8px 14px; background: #fff; border: 1px solid #e2e6ee;
  border-radius: 999px; box-shadow: 0 1px 2px #0000000a;
}
.meta { margin-top: 26px; color: #667; }
.meta code { background: #eef2f8; padding: 2px 6px; border-radius: 6px; }

/* RTL-friendly: browser mirrors layout when <html dir="rtl"> is set by LocaleContext. */
[dir="rtl"] .app__bar { flex-direction: row-reverse; }
NEXUSORA_EOF

echo "  writing client/vite.config.js"
cat > client/vite.config.js << 'NEXUSORA_EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: forward /api to the Workforce API on :5002 (same-origin in production).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5002',
    },
  },
});
NEXUSORA_EOF

echo
echo "Phase 0 client files written (9 files)."
echo "Next: cd client && npm run dev  (keep the API running on :5002 in another terminal)."
