// GHANA compliance pack — INDICATIVE seed values. Verify against GRA (tax) & SSNIT (social)
// before go-live; keep effective-dated. Amounts in GHS (monthly basis).
module.exports = {
  countryCode: 'GH',
  countryName: 'Ghana',
  currency: 'GHS',
  officialLocales: ['en'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Ghana Revenue Authority (GRA)', social: 'SSNIT' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,
    // Monthly PAYE bands (indicative — confirm current GRA schedule).
    brackets: [
      { upTo: 490, rate: 0.00 },
      { upTo: 600, rate: 0.05 },
      { upTo: 730, rate: 0.10 },
      { upTo: 3896.67, rate: 0.175 },
      { upTo: 19896.67, rate: 0.25 },
      { upTo: 50416.67, rate: 0.30 },
      { upTo: null, rate: 0.35 },
    ],
  },

  socialSecurity: {
    contributions: [
      // SSNIT: employee 5.5% + employer 13% of basic (Tier 1 + Tier 2). Tier 3 voluntary.
      { name: 'SSNIT', base: 'basic', employeeRate: 0.055, employerRate: 0.13, ceiling: null },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 15 } ],   // Labour Act 651: min 15 working days
    maternityWeeks: 12,
  },

  minimumWage: { amount: 19.97, period: 'day', currency: 'GHS' }, // indicative daily NDMW

  statutoryReports: ['paye-return', 'ssnit-contribution-schedule'],
  notes: 'Bands/rates indicative; confirm with GRA & SSNIT and set effectiveFrom per change.',
};
