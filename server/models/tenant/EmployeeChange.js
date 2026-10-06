const mongoose = require('mongoose');

// One field-level change within an event, e.g. { field:'employment.jobTitle',
// label:'Job title', from:'Officer', to:'IT Director' }.
const changeFieldSchema = new mongoose.Schema({
  field: String,
  label: String,
  from: mongoose.Schema.Types.Mixed,
  to: mongoose.Schema.Types.Mixed,
}, { _id: false });

// An effective-dated change event for one employee.
// Written automatically by the employee update flow when job or compensation
// fields change. The live Employee doc still holds the CURRENT values; this
// collection is the additive, non-destructive history behind the SF-style
// "Effective as of…" timeline.
const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true, required: true },
  category: { type: String, enum: ['job', 'compensation'], required: true },
  effectiveDate: { type: Date, required: true },
  changes: [changeFieldSchema],
  snapshot: { type: mongoose.Schema.Types.Mixed, default: {} }, // new value of the changed section
  note: String,
  changedBy: String,   // user id / name that made the change
  changedAt: { type: Date, default: Date.now },
}, { collection: 'employee_changes', minimize: false });

schema.index({ employee: 1, effectiveDate: -1, changedAt: -1 });

module.exports = { schema, modelName: 'EmployeeChange' };