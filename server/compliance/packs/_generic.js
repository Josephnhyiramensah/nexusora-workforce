// GENERIC country pack — used for any country that has no ready-made pack yet.
// Everything is zeroed/neutral so NOTHING is silently wrong: payroll will compute
// zero statutory deductions until an administrator enters that country's real rates
// in Compliance & Statutory (stored per-tenant in the database).
module.exports = function makeGenericPack({ countryCode, countryName, currency, locales }) {
  return {
    countryCode,
    countryName: countryName || countryCode,
    currency,
    officialLocales: locales && locales.length ? locales : ['en'],
    effectiveFrom: null,
    authority: { tax: 'Not configured', social: 'Not configured' },

    incomeTax: {
      method: 'progressive',
      standardDeductionRate: 0,
      brackets: [ { upTo: null, rate: 0 } ],   // no tax until configured
    },

    socialSecurity: { contributions: [] },     // none until configured

    leave: {
      annual: [ { minMonths: 12, days: 0 } ],
      maternityWeeks: 0,
    },

    minimumWage: { amount: 0, period: 'month', currency },

    statutoryReports: [],
    isTemplate: true,                           // flags the UI to warn "not configured"
    notes: 'No statutory rates configured for this country yet. Enter the local PAYE bands, '
      + 'social-security rates, minimum wage and leave entitlements in Compliance & Statutory '
      + 'before running payroll. Until then payroll computes gross pay with zero deductions.',
  };
};