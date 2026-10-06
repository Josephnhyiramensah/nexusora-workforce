/* =====================================================================
   Nexusora Workforce — supported display currencies (multi-national).
   `code` is an ISO-4217 code so Intl.NumberFormat renders the right symbol.
   This list drives the per-user display-currency switcher; a company's own
   base currency always appears even if it isn't listed here.
   ===================================================================== */
export const CURRENCIES = [
  { code: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'XOF', name: 'West African CFA Franc' },
  { code: 'XAF', name: 'Central African CFA Franc' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'RWF', name: 'Rwandan Franc' },
  { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'LRD', name: 'Liberian Dollar' },
  { code: 'SLE', name: 'Sierra Leonean Leone' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
];

export const currencyName = (code) => (CURRENCIES.find((c) => c.code === code)?.name) || code;