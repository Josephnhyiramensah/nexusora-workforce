// LIBERIA compliance pack — INDICATIVE seed values. Verify against LRA (tax) & NASSCORP
// (social) before go-live. Liberia runs dual-currency (LRD/USD); base currency per tenant.
module.exports = {
  countryCode: 'LR',
  countryName: 'Liberia',
  currency: 'LRD',
  officialLocales: ['en'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Liberia Revenue Authority (LRA)', social: 'NASSCORP' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,
    // PAYE 0%–25% (indicative annual bands — confirm current LRA schedule).
    brackets: [
      { upTo: 70000, rate: 0.00 },
      { upTo: 200000, rate: 0.05 },
      { upTo: 800000, rate: 0.15 },
      { upTo: null, rate: 0.25 },
    ],
  },

  socialSecurity: {
    contributions: [
      // NASSCORP national pension + employment-injury (indicative split — confirm).
      { name: 'NASSCORP Pension', base: 'gross', employeeRate: 0.03, employerRate: 0.03, ceiling: null },
      { name: 'NASSCORP Injury ( EII )', base: 'gross', employeeRate: 0.00, employerRate: 0.0175, ceiling: null },
    ],
  },

  leave: {
    // Decent Work Act: tenure-banded annual leave (indicative).
    annual: [ { minMonths: 12, days: 14 }, { minMonths: 36, days: 28 } ],
    maternityWeeks: 14,
  },

  minimumWage: { amount: 5.50, period: 'day', currency: 'USD' }, // indicative; verify

  statutoryReports: ['paye-return', 'nasscorp-schedule'],
  notes: 'Dual-currency (LRD/USD). Rates indicative; confirm with LRA & NASSCORP.',
};
