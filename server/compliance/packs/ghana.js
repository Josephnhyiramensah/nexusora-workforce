// GHANA compliance pack. PAYE bands cross-checked to GRA 2026 (monthly).
// SSNIT 5.5% employee / 13% employer, monthly insurable ceiling GHS 69,000.
// Still have an accountant confirm before live payroll — you are liable, not the software.
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
      { name: 'SSNIT', base: 'basic', employeeRate: 0.055, employerRate: 0.13, ceiling: 69000 },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 15 } ],
    maternityWeeks: 12,
  },

  minimumWage: { amount: 19.97, period: 'day', currency: 'GHS' },

  statutoryReports: ['paye-return', 'ssnit-contribution-schedule'],
  minimumInsurable: 587.80,
  verifiedAgainst: 'GRA PAYE 2026 monthly bands; SSNIT 5.5%/13%, monthly insurable ceiling GHS 69,000',
  verifiedOn: '2026-08-14',
  notes: 'PAYE bands cross-checked to GRA 2026. Confirm with GRA/SSNIT + an accountant before live payroll.',
};