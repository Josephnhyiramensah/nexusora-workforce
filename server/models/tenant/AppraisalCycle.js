// An AppraisalCycle — a performance review round (e.g. "2026 Annual Review").
// Reviews are generated against a cycle for each employee.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },          // "2026 Annual Review"
  type: { type: String, enum: ['annual', 'half_year', 'quarter', 'probation', 'project'], default: 'annual' },
  periodLabel: { type: String, default: '' },                  // free label e.g. "FY2026"
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },

  ratingMax: { type: Number, default: 5, min: 3, max: 10 },
  ratingLabels: { type: [String], default: [] },               // optional 1..max descriptions
  competencies: { type: [String], default: ['Job knowledge', 'Quality of work', 'Productivity', 'Communication', 'Teamwork', 'Reliability'] },
  instructions: { type: String, default: '' },

  status: { type: String, enum: ['draft', 'active', 'closed'], default: 'draft', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'appraisal_cycles' });

module.exports = { schema, modelName: 'AppraisalCycle' }; 