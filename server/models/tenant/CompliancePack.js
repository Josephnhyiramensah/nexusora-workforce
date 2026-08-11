// Per-tenant effective-dated compliance OVERRIDES (optional).
// The base rules live in code (compliance/packs/*). A tenant may store overrides here
// (e.g. a negotiated rate, or a rate change effective a certain date) which the engine
// merges over the code pack. Keeps statutory values as data, never hard-coded.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  countryCode: { type: String, required: true, uppercase: true },
  effectiveFrom: { type: Date, required: true },
  overrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'compliance_packs' });

module.exports = { schema, modelName: 'CompliancePack' };
