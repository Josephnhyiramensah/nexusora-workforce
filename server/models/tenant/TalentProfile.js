// A TalentProfile — the talent-review record for one employee: their position on the
// 9-box grid (Performance × Potential), flight-risk / impact-of-loss flags, promotion
// readiness and mobility, plus narrative strengths, development areas and aspirations.
// One row per employee. `box` (1–9) is derived from performance × potential.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true, index: true },

  // 9-box axes — 1 (Low), 2 (Medium), 3 (High)
  performanceRating: { type: Number, min: 1, max: 3, default: null },
  potentialRating: { type: Number, min: 1, max: 3, default: null },
  box: { type: Number, min: 1, max: 9, default: null, index: true }, // (potential-1)*3 + performance

  flightRisk: { type: String, enum: ['low', 'medium', 'high'], default: 'low', index: true },
  impactOfLoss: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  promotionReadiness: { type: String, enum: ['not_identified', '3_5_years', '1_2_years', 'ready_now'], default: 'not_identified' },
  mobility: { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'medium' },
  keyTalent: { type: Boolean, default: false, index: true },

  aspirations: { type: String, default: '' },
  strengths: { type: String, default: '' },
  developmentAreas: { type: String, default: '' },

  cycle: { type: String, default: '' },                 // e.g. "2026 Talent Review"
  reviewedDate: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'talent_profiles' });

schema.pre('save', function computeBox(next) {
  if (this.performanceRating && this.potentialRating) {
    this.box = (this.potentialRating - 1) * 3 + this.performanceRating;
  } else {
    this.box = null;
  }
  next();
});

module.exports = { schema, modelName: 'TalentProfile' };
