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
