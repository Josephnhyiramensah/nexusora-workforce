// A WorkforcePlan — strategic (SAP SuccessFactors-style) headcount planning.
// Lines state DEMAND (target headcount) and SUPPLY assumptions (attrition, cost per head).
// The controller projects supply YEAR BY YEAR across the horizon and nets it against a
// phased demand to produce a time-phased hiring plan and cost forecast — per SCENARIO.
const mongoose = require('mongoose');

const lineSchema = new mongoose.Schema({
  department: { type: String, required: true, trim: true },
  positionTitle: { type: String, default: '' },
  targetHeadcount: { type: Number, default: 0, min: 0 },       // DEMAND at end of horizon
  attritionRatePct: { type: Number, default: null },           // annual attrition for this group
  costPerHead: { type: Number, default: null },                // fully-loaded annual cost per person
  currency: { type: String, default: '' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  notes: { type: String, default: '' },
}, { _id: true });

// A planning scenario (SAP "version"): scales demand and/or overrides attrition to model
// Baseline vs Growth vs Conservative etc. against the same set of lines.
const scenarioSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  demandFactorPct: { type: Number, default: 100 },             // 100 = as planned; 115 = +15% demand
  attritionPctOverride: { type: Number, default: null },       // null = use each line's / plan default
  isBaseline: { type: Boolean, default: false },
  notes: { type: String, default: '' },
}, { _id: true });

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  year: { type: Number, default: () => new Date().getFullYear() },
  horizonYears: { type: Number, default: 1, min: 1, max: 5 },
  defaultAttritionPct: { type: Number, default: null },
  status: { type: String, enum: ['draft', 'active', 'closed'], default: 'active', index: true },
  assumptions: { type: String, default: '' },
  lines: { type: [lineSchema], default: [] },
  scenarios: { type: [scenarioSchema], default: [] },          // empty → an implicit Baseline is used
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'workforce_plans' });

module.exports = { schema, modelName: 'WorkforcePlan' };