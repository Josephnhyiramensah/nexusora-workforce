// Master/registry model: editable plan pricing (A2). One document per plan.
// Prices are NOT hardcoded in application config — they live here and are edited
// in the admin console. A base price in `baseCurrency` is converted to any
// tenant currency via FX; `prices` holds optional explicit per-currency amounts
// that override the conversion.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  plan: { type: String, required: true, unique: true, index: true }, // starter|professional|enterprise
  baseCurrency: { type: String, uppercase: true, default: 'GHS' },
  basePrice: { type: Number, default: 0 },      // recurring price per interval, in baseCurrency
  seatPrice: { type: Number, default: 0 },      // optional per-seat add-on, in baseCurrency
  interval: { type: String, enum: ['month', 'year'], default: 'month' },
  // Explicit per-currency overrides, e.g. { USD: 20, NGN: 15000 }. When a tenant's
  // currency is present here, it wins over the FX-converted amount.
  prices: { type: mongoose.Schema.Types.Mixed, default: {} },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { minimize: false, collection: 'pricing' });

module.exports = { schema, modelName: 'Pricing' };
