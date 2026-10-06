// LIBERIA compliance pack.
// NASSCORP split verified against nasscorp.org.lr (Aug 2026): NPS 4% employee + 4% employer;
// EIS 2% EMPLOYER-ONLY (it is an employer-liability scheme) — total 10% of gross per the 2017 Act.
// Liberia runs dual-currency (LRD/USD); base currency per tenant.
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
    // PAYE 0%/5%/15%/25% progressive. THRESHOLDS BELOW ARE ANNUAL LRD AND STILL NEED
    // CONFIRMING against the current LRA schedule — edit them in Compliance & Statutory.
    brackets: [
      { upTo: 70000, rate: 0.00 },
      { upTo: 200000, rate: 0.05 },
      { upTo: 800000, rate: 0.15 },
      { upTo: null, rate: 0.25 },
    ],
  },

  socialSecurity: {
    contributions: [
      // NPS: 4% employee + 4% employer (NASSCORP). EIS: 2%, EMPLOYER-ONLY.
      { name: 'NASSCORP National Pension Scheme (NPS)', base: 'gross', employeeRate: 0.04, employerRate: 0.04, ceiling: null },
      { name: 'NASSCORP Employment Injury Scheme (EIS)', base: 'gross', employeeRate: 0.00, employerRate: 0.02, ceiling: null },
    ],
  },

  leave: {
    // Decent Work Act 2015: 14 days after 1 year, rising to 28 days after 3+ years.
    annual: [ { minMonths: 12, days: 14 }, { minMonths: 36, days: 28 } ],
    maternityWeeks: 14,
  },

  minimumWage: { amount: 5.50, period: 'day', currency: 'USD' }, // verify current rate

  statutoryReports: ['paye-return', 'nasscorp-schedule'],
  verifiedAgainst: 'NASSCORP (nasscorp.org.lr): NPS 4% employee + 4% employer; EIS 2% employer-only (10% of gross total, 2017 NASSCORP Act). PAYE 0/5/15/25% (LRA).',
  verifiedOn: '2026-08-15',
  notes: 'NASSCORP split corrected from the official NASSCORP site — third-party payroll blogs disagree (the 4.75% figure is historical, from 1980). PAYE band THRESHOLDS and the minimum wage still need confirming against current LRA/Ministry of Labour figures.',
};