// A SuccessionPlan — succession cover for one key position: the incumbent, the business
// risk if they leave, and a ranked bench of successors each with a readiness level.
// Bench strength is derived from the number and readiness of successors. One row per position.
const mongoose = require('mongoose');

const successorSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  readiness: { type: String, enum: ['ready_now', '1_2_years', '3_5_years'], default: '1_2_years' },
  rank: { type: Number, default: 1 },
  notes: { type: String, default: '' },
  addedDate: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  position: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', required: true, unique: true, index: true },
  incumbent: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },

  businessCritical: { type: Boolean, default: false, index: true },
  riskOfLoss: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },   // likelihood incumbent leaves
  impactOfLoss: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }, // effect on the business

  successors: { type: [successorSchema], default: [] },

  notes: { type: String, default: '' },
  reviewedDate: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'succession_plans' });

module.exports = { schema, modelName: 'SuccessionPlan' };
