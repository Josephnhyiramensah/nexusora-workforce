// A managed picklist entry — one flexible model for worker classes, employment types, grades,
// and any future customer-managed list. Differentiated by `type`. Behavior flags
// (defaultPayBasis / defaultPaymentMethod / showsFieldWork) are meaningful only for
// type 'worker_class'; they're ignored for other types. This is what lets any industry
// configure their own worker types without the code hardcoding plantation-specific strings.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['worker_class', 'employment_type', 'grade'],
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },   // display label, e.g. "Tapper" / "Nurse"
  code: { type: String, trim: true },                   // short key, e.g. "tapper" / "nurse"

  // Behavior flags — worker_class only. Drive the employee form's smart defaults.
  defaultPayBasis: { type: String, enum: ['salary', 'daily', 'hourly', 'piece_rate', 'task'], default: 'salary' },
  defaultPaymentMethod: { type: String, enum: ['bank', 'mobile_money', 'cash'], default: 'bank' },
  showsFieldWork: { type: Boolean, default: false },    // does this type do field work (tapping/harvesting)?

  order: { type: Number, default: 0 },                  // display order within a type
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
}, { collection: 'picklists', minimize: false });

// A code is unique per type within a tenant (sparse so blank codes don't collide).
schema.index({ type: 1, code: 1 }, { unique: true, sparse: true });
schema.index({ type: 1, order: 1, name: 1 });

module.exports = { schema, modelName: 'Picklist' };