// COMPLIANCE PACK TEMPLATE — copy this file to add any African country.
// Fill the values from the country's revenue & social-security authorities, then register
// it in compliance/registry.js. All amounts are in the country's own currency.
// IMPORTANT: every figure below is CONFIRMED DATA to verify against the authority before
// go-live, and is effective-dated so historic pay runs stay correct.

module.exports = {
  countryCode: 'XX',                 // ISO 3166-1 alpha-2
  countryName: 'Country Name',
  currency: 'XXX',                   // ISO 4217, must exist in config/currencies.js
  officialLocales: ['en'],           // must exist in i18n/locales.js
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Revenue Authority', social: 'Social Security Body' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,        // 0..1 (e.g. 0.20 = 20% standard deduction)
    brackets: [                      // ordered; final bracket upTo: null
      { upTo: 0, rate: 0 },
    ],
  },

  socialSecurity: {
    contributions: [
      // { name: 'Scheme', base: 'basic'|'gross', employeeRate: 0, employerRate: 0, ceiling: null },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 0 } ],   // tenure-banded
    maternityWeeks: 0,
  },

  minimumWage: { amount: 0, period: 'day', currency: 'XXX' },

  statutoryReports: [],              // e.g. ['income-tax-return', 'social-security-schedule']

  notes: 'Source & verification notes here.',
};
