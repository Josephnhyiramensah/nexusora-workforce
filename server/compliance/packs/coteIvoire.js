// CÔTE D'IVOIRE compliance pack — INDICATIVE seed values. Verify against DGI (ITS) & CNPS
// (social) before go-live. Amounts in XOF (monthly). Official UI locale: French.
module.exports = {
  countryCode: 'CI',
  countryName: "Côte d'Ivoire",
  currency: 'XOF',
  officialLocales: ['fr'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Direction Générale des Impôts (DGI)', social: 'CNPS' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0.20,   // 20% standard deduction before ITS brackets
    // ITS reformed schedule, 0%–32% (indicative — confirm current DGI brackets).
    brackets: [
      { upTo: 75000, rate: 0.00 },
      { upTo: 240000, rate: 0.16 },
      { upTo: 800000, rate: 0.21 },
      { upTo: 2400000, rate: 0.24 },
      { upTo: 8000000, rate: 0.28 },
      { upTo: null, rate: 0.32 },
    ],
  },

  socialSecurity: {
    contributions: [
      // CNPS retirement (indicative 6.3% employee / 7.7% employer) + employer-only branches.
      { name: 'CNPS Retirement', base: 'gross', employeeRate: 0.063, employerRate: 0.077, ceiling: 3375000 },
      { name: 'CNPS Family Allowances', base: 'gross', employeeRate: 0.00, employerRate: 0.0575, ceiling: 70000 },
      { name: 'CNPS Work Injury', base: 'gross', employeeRate: 0.00, employerRate: 0.02, ceiling: 70000 },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 26 } ],  // ~2.2 working days/month (indicative)
    maternityWeeks: 14,
  },

  minimumWage: { amount: 75000, period: 'month', currency: 'XOF' }, // SMIG (indicative)

  statutoryReports: ['its-declaration', 'cnps-declaration'],
  notes: 'Francophone (fr). Rates indicative; confirm with DGI & CNPS.',
};
