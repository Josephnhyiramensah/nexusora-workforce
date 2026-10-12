// Billing constants (A2). Only operational toggles live here — NOT prices or
// tax rates, which are DB-backed and edited in the admin console so nothing is
// hardcoded to one country or currency. All values are env-overridable.
module.exports = {
  // 1 month free registration, then a 7-day grace window before lockout.
  TRIAL_DAYS: Number(process.env.TRIAL_DAYS || 30),
  GRACE_DAYS: Number(process.env.GRACE_DAYS || 7),

  // The currency an admin enters base prices in (a price can also be overridden
  // per-currency). Other currencies are derived from this via FX.
  PRICING_BASE_CURRENCY: (process.env.PRICING_BASE_CURRENCY || 'GHS').toUpperCase(),

  // Payment provider.
  PAYMENT_PROVIDER: (process.env.PAYMENT_PROVIDER || 'paystack').toLowerCase(),
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
  // Currencies Paystack can actually charge for a given account. If a tenant's
  // currency isn't chargeable, the amount is converted to this fallback.
  PAYSTACK_CHARGE_CURRENCIES: String(process.env.PAYSTACK_CHARGE_CURRENCIES || 'GHS,NGN,USD,ZAR,KES')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  PAYSTACK_FALLBACK_CURRENCY: (process.env.PAYSTACK_FALLBACK_CURRENCY || 'USD').toUpperCase(),
};
