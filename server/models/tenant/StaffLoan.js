// A StaffLoan — a staff loan or salary advance: requested → approved → active (being repaid)
// → completed. On approval the total repayable, monthly deduction and opening balance are
// computed; each repayment reduces the outstanding balance until the loan is cleared.
const mongoose = require('mongoose');

const repaymentSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['payroll_deduction', 'cash', 'bank', 'other'], default: 'payroll_deduction' },
  reference: { type: String, default: '' },
  note: { type: String, default: '' },
  balanceAfter: { type: Number, default: 0 },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true });

const schema = new mongoose.Schema({
  loanNumber: { type: String, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  type: { type: String, enum: ['loan', 'salary_advance'], default: 'loan', index: true },

  principal: { type: Number, required: true },
  interestRatePct: { type: Number, default: 0 },     // flat interest over the whole term
  totalRepayable: { type: Number, default: 0 },       // principal + interest (set on approval)
  termMonths: { type: Number, default: 1 },
  monthlyDeduction: { type: Number, default: 0 },     // computed on approval
  currency: { type: String, default: 'GHS' },

  startDate: { type: Date, default: null },
  status: { type: String, enum: ['requested', 'approved', 'active', 'completed', 'rejected', 'cancelled'], default: 'requested', index: true },
  reason: { type: String, default: '' },

  balance: { type: Number, default: 0 },              // outstanding
  repayments: { type: [repaymentSchema], default: [] },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedDate: { type: Date, default: null },
  decisionNote: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'staff_loans' });

module.exports = { schema, modelName: 'StaffLoan' };
