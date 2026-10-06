// Per-tenant leave request with a pending -> approved/rejected/cancelled state machine.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number },                    // computed server-side (working days)
  reason: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decisionNote: String,
  decidedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'leave_requests' });

schema.index({ employee: 1, startDate: -1 });
schema.index({ status: 1 });

module.exports = { schema, modelName: 'LeaveRequest' };
