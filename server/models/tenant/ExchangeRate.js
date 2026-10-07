// Tenant-scoped exchange rate. `rate` is how many units of `currency` equal 1
// unit of `base` (currency-per-1-base) — the convention the client's
// CurrencyContext.convert() expects (rates[X] = X per 1 base).
//   source 'manual' = set by an admin (wins over live)
//   source 'live'   = fetched from the free rate feed
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  base: { type: String, required: true, uppercase: true, trim: true },
  currency: { type: String, required: true, uppercase: true, trim: true },
  rate: { type: Number, required: true },            // currency per 1 base
  source: { type: String, enum: ['manual', 'live'], default: 'live' },
  asOf: { type: Date, default: Date.now },
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'exchangerates' });

schema.index({ base: 1, currency: 1, source: 1, asOf: -1 });

module.exports = { schema, modelName: 'ExchangeRate' };
