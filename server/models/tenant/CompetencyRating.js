// A CompetencyRating — the current assessed proficiency of one employee on one competency
// (self + manager + agreed final), with the required level snapshotted so the gap
// (required − final) can be reported without recomputing. One row per employee+competency.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  competency: { type: mongoose.Schema.Types.ObjectId, ref: 'Competency', required: true, index: true },

  selfRating: { type: Number, default: null },
  managerRating: { type: Number, default: null },
  finalRating: { type: Number, default: null },        // agreed proficiency

  requiredLevel: { type: Number, default: null },      // snapshot at assessment
  gap: { type: Number, default: null },                // requiredLevel − finalRating (>0 = deficit)

  assessedDate: { type: Date, default: Date.now },
  assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cycle: { type: String, default: '' },                // e.g. "2026 Mid-Year"
  notes: { type: String, default: '' },
}, { timestamps: true, collection: 'competency_ratings' });

schema.index({ employee: 1, competency: 1 }, { unique: true });

module.exports = { schema, modelName: 'CompetencyRating' };