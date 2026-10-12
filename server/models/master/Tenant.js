// Master/registry model: one document per client organisation (tenant).
// Exports schema + modelName only — registered on the MASTER connection (never default).
const mongoose = require('mongoose');
const { isSupportedCurrency } = require('../../config/currencies');
const { isSupportedLocale, DEFAULT_LOCALE } = require('../../i18n/locales');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  dbName: { type: String, required: true, unique: true },   // nexusora_wf_<subdomain>
  countryCode: { type: String, required: true, uppercase: true },  // drives Compliance Pack
  baseCurrency: { type: String, required: true, uppercase: true, validate: { validator: isSupportedCurrency, message: 'Unsupported currency' } },
  defaultLocale: { type: String, default: DEFAULT_LOCALE, validate: { validator: isSupportedLocale, message: 'Unsupported locale' } },
  enabledLocales: { type: [String], default: [DEFAULT_LOCALE] },
  plan: { type: String, enum: ['starter', 'professional', 'enterprise'], default: 'starter' },
  // Subscription lifecycle (A2). trial → active → past_due → grace → expired;
  // suspended is an admin action. Enforced by requireActiveSubscription (C2).
  status: { type: String, enum: ['active', 'trial', 'past_due', 'grace', 'suspended', 'expired'], default: 'trial' },
  trialEndsAt: { type: Date },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  graceEndsAt: { type: Date },
  seatsPurchased: { type: Number, default: 0 },   // 0 = fall back to the plan's seat limit
  billingEmail: { type: String, lowercase: true, trim: true },
  // Opaque references from the payment provider (A2). Never a card/account number.
  billing: {
    provider: { type: String },                   // 'paystack' | 'flutterwave' | ...
    customerRef: { type: String },
    subscriptionRef: { type: String },
  },
  // Per-tenant entitlement overrides layered on top of the plan (C2).
  featureFlags: {
    enable: { type: [String], default: [] },
    disable: { type: [String], default: [] },
  },
  modules: { type: [String], default: [] },
  branding: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
}, { minimize: false, collection: 'tenants' });

module.exports = { schema, modelName: 'Tenant' };
