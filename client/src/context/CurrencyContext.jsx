/* =====================================================================
   Nexusora Workforce — Currency context (multi-national).

   Two layers:
   • BASE currency  — belongs to the company (tenant.baseCurrency). Payroll is
     always calculated and stored in the base currency; it never changes with
     exchange rates. This also drives the global money() default in ui/tokens.
   • DISPLAY currency — a per-user, display-only preference. A user can view
     amounts in another currency without affecting payroll. Conversion uses
     exchange rates from the backend, which merges a live rate feed with any
     manual overrides an admin has set (manual wins).

   Mount this INSIDE your LocaleProvider and AuthProvider, e.g.
     <AuthProvider><LocaleProvider><CurrencyProvider> …app… </CurrencyProvider></LocaleProvider></AuthProvider>

   Usage in a page:
     const { fmt } = useCurrency();
     …{fmt(employee.compensation.baseSalary)}…      // amounts are in base currency
     …{fmt(amount, { from: 'USD' })}…               // if an amount is in another currency
   ===================================================================== */
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useLocale } from './LocaleContext';
import { setDefaultCurrency, formatMoney } from '../ui/tokens';

const Ctx = createContext(null);
const LS_KEY = 'nx_display_currency';

export function CurrencyProvider({ children }) {
  const { tenant, user } = useAuth();
  const { locale } = useLocale();
  const baseCurrency = String(tenant?.baseCurrency || tenant?.currency || 'USD').toUpperCase();

  const [displayCurrency, setDisplayState] = useState(() => {
    try { return String(localStorage.getItem(LS_KEY) || user?.displayCurrency || baseCurrency).toUpperCase(); }
    catch { return baseCurrency; }
  });
  const [rates, setRates] = useState({ [baseCurrency]: 1 });
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null);

  // Keep the global money() default in sync with the company base currency,
  // so even screens not yet migrated to fmt() stop showing hardcoded cedis.
  useEffect(() => { setDefaultCurrency(baseCurrency); }, [baseCurrency]);

  // If a base changes and the stored display was the old base, follow it.
  useEffect(() => {
    try { if (!localStorage.getItem(LS_KEY)) setDisplayState(baseCurrency); }
    catch { setDisplayState((d) => d || baseCurrency); }
  }, [baseCurrency]);

  // Exchange rates for this base. Backend merges the live feed with any manual
  // overrides (manual wins). If the endpoint isn't there yet, we stay base-only
  // and conversion is a safe no-op.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/fx/rates', { params: { base: baseCurrency } });
        if (!alive) return;
        setRates({ ...(data?.rates || {}), [baseCurrency]: 1 });
        setRatesUpdatedAt(data?.updatedAt || null);
      } catch { /* no rates yet — base only */ }
    })();
    return () => { alive = false; };
  }, [baseCurrency]);

  const setDisplayCurrency = useCallback((cur) => {
    const c = String(cur || baseCurrency).toUpperCase();
    setDisplayState(c);
    try { localStorage.setItem(LS_KEY, c); } catch { /* ignore */ }
    // Best-effort server persistence; harmless if the endpoint doesn't exist yet.
    if (typeof api.patch === 'function') api.patch('/auth/users/me', { displayCurrency: c }).catch(() => {});
  }, [baseCurrency]);

  // Convert an amount from one currency to another using base-relative rates
  // (rates[X] = how many X per 1 unit of base). Missing rate → return as-is.
  const convert = useCallback((amount, from, to) => {
    const a = Number(amount || 0);
    const f = String(from || baseCurrency).toUpperCase();
    const t = String(to || displayCurrency).toUpperCase();
    if (f === t) return a;
    const rf = rates[f], rt = rates[t];
    if (!rf || !rt) return a;
    return (a / rf) * rt;
  }, [rates, baseCurrency, displayCurrency]);

  // Format an amount (given in base currency unless opts.from says otherwise)
  // in the user's chosen display currency, localized.
  const fmt = useCallback((amount, opts = {}) => {
    const from = opts.from || baseCurrency;
    const converted = convert(amount, from, displayCurrency);
    return formatMoney(converted, displayCurrency, { locale, maximumFractionDigits: opts.maximumFractionDigits });
  }, [convert, displayCurrency, baseCurrency, locale]);

  const value = useMemo(() => ({
    baseCurrency, displayCurrency, setDisplayCurrency,
    rates, ratesUpdatedAt, convert, fmt,
    isConverted: displayCurrency !== baseCurrency,
  }), [baseCurrency, displayCurrency, setDisplayCurrency, rates, ratesUpdatedAt, convert, fmt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCurrency = () => useContext(Ctx) || {
  baseCurrency: 'USD', displayCurrency: 'USD', setDisplayCurrency: () => {},
  rates: {}, ratesUpdatedAt: null, convert: (a) => a, fmt: (a) => formatMoney(a), isConverted: false,
};