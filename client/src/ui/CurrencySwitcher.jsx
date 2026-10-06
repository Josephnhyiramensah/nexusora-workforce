/* =====================================================================
   CurrencySwitcher — per-user display-currency picker.
   Drop it in the top bar / profile menu next to the language switcher:
     import CurrencySwitcher from '../ui/CurrencySwitcher';
     …<CurrencySwitcher />…
   Changing it only affects how amounts are shown for this user; payroll
   still runs in the company base currency.
   ===================================================================== */
import { useCurrency } from '../context/CurrencyContext';
import { CURRENCIES } from '../config/currencies';
import { C } from './tokens';

export default function CurrencySwitcher({ compact = false }) {
  const { displayCurrency, setDisplayCurrency, baseCurrency } = useCurrency();
  // Base currency is always selectable, even if it isn't in the standard list.
  const codes = Array.from(new Set([baseCurrency, ...CURRENCIES.map((c) => c.code)]));
  return (
    <select
      value={displayCurrency}
      onChange={(e) => setDisplayCurrency(e.target.value)}
      aria-label="Display currency"
      title="Display currency"
      style={{
        border: `1px solid ${C.line}`, borderRadius: 9, background: '#fff', color: C.navy,
        fontSize: '.82rem', fontWeight: 700, padding: compact ? '6px 8px' : '8px 12px',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {codes.map((code) => (
        <option key={code} value={code}>{code}{code === baseCurrency ? ' · base' : ''}</option>
      ))}
    </select>
  );
}