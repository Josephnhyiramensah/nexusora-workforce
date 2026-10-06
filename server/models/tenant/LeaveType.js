// Per-tenant leave type. The "annual" type draws its entitlement from the Compliance Pack
// (tenure-banded); others are fixed days/year or unlimited (e.g. unpaid).
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },   // annual, sick, maternity, paternity, compassionate, unpaid
  paid: { type: Boolean, default: true },
  entitlementSource: { type: String, enum: ['compliance_pack', 'fixed', 'unlimited'], default: 'fixed' },
  daysPerYear: { type: Number },             // used when entitlementSource = 'fixed'
  requiresApproval: { type: Boolean, default: true },
  color: { type: String, default: '#2E75B6' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'leave_types' });

schema.index({ code: 1 }, { unique: true });

module.exports = { schema, modelName: 'LeaveType' };
