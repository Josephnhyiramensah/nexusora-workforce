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
