// CÔTE D'IVOIRE compliance pack.
// 2024 reform (ord. 2023-718/719) merged IS/CN/IGR into a single ITS computed on GROSS —
// the old 20% abattement and quotient familial were abolished. CNPS employee share is
// retirement only (6.3%); family allowances, maternity and work-injury are employer-only.
// Amounts in XOF (monthly). Official UI locale: French.
module.exports = {
  countryCode: 'CI',
  countryName: "Côte d'Ivoire",
  currency: 'XOF',
  officialLocales: ['fr'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Direction Générale des Impôts (DGI)', social: 'CNPS' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,      // 2024 reform: ITS on gross, no abattement
    // Unified ITS: 0 / 16 / 21 / 24 / 28 / 32 %. Monthly bands — confirm exact thresholds with DGI.
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
      // Employee pays retirement only (6.3%). Employer: retirement 7.7% + family 5% + maternity 0.75% + work-injury 2–5%.
      { name: 'CNPS Retraite', base: 'gross', employeeRate: 0.063, employerRate: 0.077, ceiling: 3375000 },
      { name: 'CNPS Prestations Familiales', base: 'gross', employeeRate: 0.00, employerRate: 0.05, ceiling: 70000 },
      { name: 'CNPS Maternité', base: 'gross', employeeRate: 0.00, employerRate: 0.0075, ceiling: 70000 },
      { name: 'CNPS Accidents du Travail', base: 'gross', employeeRate: 0.00, employerRate: 0.02, ceiling: 70000 },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 26 } ],
    maternityWeeks: 14,
  },

  minimumWage: { amount: 75000, period: 'month', currency: 'XOF' }, // SMIG; SMAG (agricultural) is 36,607/month

  statutoryReports: ['its-declaration', 'cnps-declaration'],
  verifiedAgainst: "CNPS/DGI 2026: employee 6.3% (retirement, ceiling 3,375,000/mo); employer 14.15–17.15%; ITS unified 0/16/21/24/28/32% on gross after 2024 reform; SMIG 75,000 XOF/mo.",
  verifiedOn: '2026-08-15',
  notes: 'Work-injury rate varies 2–5% by risk category — 2% (services) seeded; adjust per the plantation\'s actual CNPS risk class. CMU (1,000 XOF flat per person) is not modelled yet.',
};