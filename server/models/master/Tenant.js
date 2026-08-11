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
  status: { type: String, enum: ['active', 'suspended', 'trial', 'expired'], default: 'trial' },
  modules: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
}, { minimize: false, collection: 'tenants' });

module.exports = { schema, modelName: 'Tenant' };
