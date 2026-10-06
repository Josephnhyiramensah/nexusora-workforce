/* =====================================================================
   Nexusora Workforce — design tokens, helpers & style objects.
   Pure constants/functions only (NO React components) so Fast Refresh
   stays happy. Components live in ./kit.jsx, the hook in ./hooks.js.
   ===================================================================== */

/* ------------------------------ TOKENS ---------------------------- */
export const C = {
  navy: '#012158', ink: '#1b2536', muted: '#67728a', muted2: '#8a94a6',
  line: '#e3e8ef', lineSoft: '#eef1f6', ground: '#eef1f4', card: '#ffffff',
  accent: '#168eff', accentInk: '#0b6fd6',
  hero1: '#aed9f3', hero2: '#dff0fa', hero3: '#eef7fd',
  green: '#1f9d57', greenBg: '#e7f6ee', amber: '#c77700', amberBg: '#fdf0dc',
  red: '#e5484d', redBg: '#fdeaea', blue: '#3485E9', teal: '#17a2b8', purple: '#7c5cdf',
  greyBg: '#eef1f6', panel: '#f7f9fc',
};
export const NUM = { fontVariantNumeric: 'tabular-nums' };
export const FONT = "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
export const PILL = {
  green: [C.green, C.greenBg], amber: [C.amber, C.amberBg], blue: [C.accentInk, '#e6f1fd'],
  red: [C.red, C.redBg], grey: [C.muted, C.greyBg], navy: [C.navy, '#e7ecf6'],
};
export const AV_GRADS = ['linear-gradient(135deg,#3485E9,#012158)', 'linear-gradient(135deg,#1f9d57,#0d6b3a)', 'linear-gradient(135deg,#7c5cdf,#4a32a8)', 'linear-gradient(135deg,#FD9C09,#c77700)', 'linear-gradient(135deg,#17a2b8,#0d6b7a)', 'linear-gradient(135deg,#e5484d,#a8262a)'];

/* ------------------------------ HELPERS --------------------------- */
export const labelOf = (arr, k) => (arr.find((x) => x[0] === k) || [k, k])[1];
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fullName = (e) => e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() || (e.name || '—') : '—';
/* Currency-aware money formatting (multi-national).
   The active currency is NOT hardcoded: setDefaultCurrency() is called once
   at login with the tenant's base currency (the CurrencyProvider does this),
   and any call can still pass an explicit currency to override. Intl gives the
   correct symbol/format per currency (₵, $, ₦, KSh …) with a safe fallback. */
let _defaultCurrency = 'USD';
export const setDefaultCurrency = (cur) => { if (cur) _defaultCurrency = String(cur).toUpperCase(); };
export const getDefaultCurrency = () => _defaultCurrency;
export const formatMoney = (n, currency, { locale, maximumFractionDigits = 0 } = {}) => {
  const num = Number(n || 0);
  const cur = String(currency || _defaultCurrency).toUpperCase();
  try { return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: cur, maximumFractionDigits }).format(num); }
  catch { return `${cur} ${num.toLocaleString(undefined, { maximumFractionDigits })}`; }
};
export const money = (n, cur) => formatMoney(n, cur);
export const cap = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '';
export const initials = (name) => { const p = String(name || '').trim().split(/\s+/); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '—'; };
export const gradOf = (seed) => AV_GRADS[Math.abs(String(seed || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % AV_GRADS.length];
export const tone = (t) => (PILL[(t || [])[1]] || PILL.grey)[0];

/* --------------------------- STYLE OBJECTS ------------------------ */
export const inp = { width: '100%', padding: '9px 11px', border: '1px solid #d8e0ec', borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', fontFamily: FONT };
export const ta = { ...inp, resize: 'vertical', marginBottom: 12 };
export const primaryBtn = { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: FONT };
export const ghostBtn = { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: FONT };
export const rowStyle = { cursor: 'pointer', borderTop: `1px solid ${C.lineSoft}` };
export const td = { padding: '13px 20px', fontSize: '.85rem', color: C.ink, verticalAlign: 'middle' };
export const mtd = { padding: '10px 4px', fontSize: '.83rem', color: C.ink };
export const thBase = { textAlign: 'left', fontSize: '.68rem', letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted2, fontWeight: 700, padding: '11px 20px', background: '#fafbfd', borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' };
export const miniBtn = (color) => ({ padding: '6px 12px', border: `1px solid ${color}33`, borderRadius: 8, background: `${color}0f`, color, fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', display: 'inline-block', fontFamily: FONT });