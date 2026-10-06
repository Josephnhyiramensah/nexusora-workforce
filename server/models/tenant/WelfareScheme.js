// A WelfareScheme — a staff welfare fund or society (welfare fund, benevolent fund, sports,
// social, savings…). Holds an opening balance and an embedded ledger of member contributions;
// its live balance is opening + contributions − claims paid from it (computed in the controller).
const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  name: { type: String, default: '' },                // snapshot of contributor
  amount: { type: Number, required: true },
  period: { type: String, default: '' },              // e.g. "2026-09"
  date: { type: Date, default: Date.now },
  method: { type: String, enum: ['payroll_deduction', 'cash', 'bank', 'other'], default: 'payroll_deduction' },
  note: { type: String, default: '' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true });

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '' },
  type: { type: String, enum: ['welfare_fund', 'benevolent', 'sports', 'social', 'savings', 'other'], default: 'welfare_fund', index: true },
  description: { type: String, default: '' },

  contributionAmount: { type: Number, default: 0 },   // standard per-member contribution
  frequency: { type: String, enum: ['monthly', 'weekly', 'quarterly', 'annual', 'voluntary'], default: 'monthly' },
  currency: { type: String, default: 'GHS' },
  openingBalance: { type: Number, default: 0 },

  active: { type: Boolean, default: true, index: true },
  contributions: { type: [contributionSchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'welfare_schemes' });

module.exports = { schema, modelName: 'WelfareScheme' };
