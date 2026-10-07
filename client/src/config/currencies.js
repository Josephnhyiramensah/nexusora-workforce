/* =====================================================================
   Nexusora Workforce — supported display currencies (multi-national).
   `code` is an ISO-4217 code so Intl.NumberFormat renders the right symbol.
   This list drives the per-user display-currency switcher; a company's own
   base currency always appears even if it isn't listed here.

   Coverage: the national currencies of all 54 African countries (many
   share XOF / XAF / EUR), followed by the global majors used for trade
   and reporting. Codes are strict ISO-4217 — never a symbol like "GH₵",
   which would break Intl.NumberFormat.
   ===================================================================== */
export const CURRENCIES = [
  /* ---- Africa (alphabetical by country / currency) ---- */
  { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'AOA', name: 'Angolan Kwanza' },
  { code: 'XOF', name: 'West African CFA Franc' },      // Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo
  { code: 'BWP', name: 'Botswana Pula' },
  { code: 'BIF', name: 'Burundian Franc' },
  { code: 'XAF', name: 'Central African CFA Franc' },   // Cameroon, CAR, Chad, Congo-Brazzaville, Equatorial Guinea, Gabon
  { code: 'CVE', name: 'Cape Verdean Escudo' },
  { code: 'KMF', name: 'Comorian Franc' },
  { code: 'CDF', name: 'Congolese Franc' },             // DR Congo
  { code: 'DJF', name: 'Djiboutian Franc' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'ERN', name: 'Eritrean Nakfa' },
  { code: 'SZL', name: 'Eswatini Lilangeni' },
  { code: 'ETB', name: 'Ethiopian Birr' },
  { code: 'GMD', name: 'Gambian Dalasi' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'GNF', name: 'Guinean Franc' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'LSL', name: 'Lesotho Loti' },
  { code: 'LRD', name: 'Liberian Dollar' },
  { code: 'LYD', name: 'Libyan Dinar' },
  { code: 'MGA', name: 'Malagasy Ariary' },
  { code: 'MWK', name: 'Malawian Kwacha' },
  { code: 'MRU', name: 'Mauritanian Ouguiya' },
  { code: 'MUR', name: 'Mauritian Rupee' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'MZN', name: 'Mozambican Metical' },
  { code: 'NAD', name: 'Namibian Dollar' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'RWF', name: 'Rwandan Franc' },
  { code: 'STN', name: 'São Tomé & Príncipe Dobra' },
  { code: 'SCR', name: 'Seychellois Rupee' },
  { code: 'SLE', name: 'Sierra Leonean Leone' },
  { code: 'SOS', name: 'Somali Shilling' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'SSP', name: 'South Sudanese Pound' },
  { code: 'SDG', name: 'Sudanese Pound' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'TND', name: 'Tunisian Dinar' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'ZWL', name: 'Zimbabwean Dollar' },

  /* ---- International settlement currencies (trade & reporting) ---- */
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Pound Sterling' },
];

export const currencyName = (code) => (CURRENCIES.find((c) => c.code === code)?.name) || code;
