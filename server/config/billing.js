// Billing constants (A2). Values here are PLACEHOLDERS pending Joseph's
// confirmation (trial/grace length, VAT, provider) — all overridable by env so
// nothing is hard-coded into logic. Plan prices live in config/plans.js.
module.exports = {
  TRIAL_DAYS: Number(process.env.TRIAL_DAYS || 14),      // PLACEHOLDER
  GRACE_DAYS: Number(process.env.GRACE_DAYS || 7),       // PLACEHOLDER
  BILLING_CURRENCY: (process.env.BILLING_CURRENCY || 'GHS').toUpperCase(),
  VAT_RATE: Number(process.env.VAT_RATE || 0),           // PLACEHOLDER (e.g. 0.15) — Ghana VAT+levies TBD
  PAYMENT_PROVIDER: (process.env.PAYMENT_PROVIDER || '').toLowerCase(), // 'paystack' | 'flutterwave' — TBD
};
