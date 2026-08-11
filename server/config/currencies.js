// Pan-African currency catalogue (ISO 4217) + common international settlement currencies.
// The multi-currency engine (reused from Nexusora Books) is currency-agnostic; this is the
// seed list a tenant chooses its base currency from. Adding one = one line here.
// decimals: minor-unit digits (0 for XOF/XAF/etc.), default 2.

const CURRENCIES = [
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'دج', decimals: 2 },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz', decimals: 2 },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', decimals: 0 },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', decimals: 0 },
  { code: 'BWP', name: 'Botswana Pula', symbol: 'P', decimals: 2 },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', decimals: 0 },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$', decimals: 2 },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF', decimals: 0 },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC', decimals: 2 },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', decimals: 0 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk', decimals: 2 },
  { code: 'SZL', name: 'Eswatini Lilangeni', symbol: 'E', decimals: 2 },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', decimals: 2 },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D', decimals: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimals: 2 },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG', decimals: 0 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L', decimals: 2 },
  { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$', decimals: 2 },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د', decimals: 3 },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', decimals: 2 },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', decimals: 2 },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM', decimals: 2 },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨', decimals: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', decimals: 2 },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT', decimals: 2 },
  { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', decimals: 0 },
  { code: 'STN', name: 'São Tomé & Príncipe Dobra', symbol: 'Db', decimals: 2 },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨', decimals: 2 },
  { code: 'SLE', name: 'Sierra Leonean Leone', symbol: 'Le', decimals: 2 },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: '£', decimals: 2 },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س', decimals: 2 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', decimals: 2 },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', decimals: 3 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', decimals: 0 },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', decimals: 2 },
  { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$', decimals: 2 },
  // International settlement currencies commonly used across Africa
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', decimals: 2 },
];

const byCode = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));
const listCurrencies = () => CURRENCIES;
const getCurrency = (code) => byCode[code] || null;
const isSupportedCurrency = (code) => Boolean(byCode[code]);

module.exports = { CURRENCIES, listCurrencies, getCurrency, isSupportedCurrency };
