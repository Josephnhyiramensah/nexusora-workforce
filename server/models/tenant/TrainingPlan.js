// A TrainingPlan — an annual (or periodic) plan for a department/company, holding the
// identified training NEEDS as line items. Needs can originate from appraisals, gap
// analysis, compliance, or direct requests, and carry priority, timing, cost and status
// so HR can track budget and delivery through the year.
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }, // optional (can be role-wide)
  audienceLabel: { type: String, default: '' },       // e.g. "All supervisors" when not a single employee
  competency: { type: mongoose.Schema.Types.ObjectId, ref: 'Competency', default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  title: { type: String, default: '' },               // free-text need when no linked course

  needSource: { type: String, enum: ['appraisal', 'gap_analysis', 'manager_request', 'self_request', 'compliance', 'induction', 'other'], default: 'manager_request' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  targetQuarter: { type: String, enum: ['', 'Q1', 'Q2', 'Q3', 'Q4'], default: '' },

  estimatedCost: { type: Number, default: 0 },
  actualCost: { type: Number, default: 0 },
  status: { type: String, enum: ['identified', 'planned', 'approved', 'scheduled', 'completed', 'deferred', 'cancelled'], default: 'identified' },
  notes: { type: String, default: '' },
}, { _id: true });

const schema = new mongoose.Schema({
  year: { type: Number, required: true, index: true },
  title: { type: String, default: '' },
  department: { type: String, default: '' },           // free-text or canonical unit name; '' = company-wide

  status: { type: String, enum: ['draft', 'submitted', 'approved', 'in_progress', 'completed'], default: 'draft', index: true },
  budget: { type: Number, default: 0 },
  currency: { type: String, default: 'GHS' },

  items: { type: [itemSchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedDate: { type: Date, default: null },
}, { timestamps: true, collection: 'training_plans' });

module.exports = { schema, modelName: 'TrainingPlan' };