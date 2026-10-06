// Per-tenant payroll run for a period, with the computed payslips embedded.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  period: { type: String, required: true },     // 'YYYY-MM'
  label: String,
  status: { type: String, enum: ['draft', 'approved', 'paid'], default: 'draft' },
  currency: String,
  totals: {
    headcount: Number, gross: Number, deductions: Number, net: Number, employerCost: Number,
  },
  payslips: { type: [mongoose.Schema.Types.Mixed], default: [] },  // engine output per employee
  runBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now },
}, { collection: 'payroll_runs', minimize: false });

schema.index({ period: 1 });

module.exports = { schema, modelName: 'PayrollRun' };