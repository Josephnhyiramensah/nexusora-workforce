// Per-tenant daily attendance / field-muster record. One row per employee per day.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true },   // normalised to day start (UTC)
  status: { type: String, enum: ['present', 'absent', 'late', 'half_day', 'leave', 'rest_day', 'holiday'], required: true },

  department: String,   // denormalised for analytics grouping
  section: String,      // plantation section / estate
  shift: String,
  clockIn: String,
  clockOut: String,
  hoursWorked: Number,
  overtimeHours: Number,

  // Plantation output capture (for piece-rate tappers): e.g. kg of latex/cuplump.
  output: { quantity: Number, unit: String },

  // Absenteeism handling
  absenceReason: String,           // sick, unauthorised, etc.
  excused: { type: Boolean, default: false },
  lostManDay: { type: Number, default: 0 },   // computed server-side (1 absent, 0.5 half_day)
  returnToWork: { completed: { type: Boolean, default: false }, date: Date, note: String },

  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'attendance', minimize: false });

schema.index({ employee: 1, date: 1 }, { unique: true });   // one record per employee per day
schema.index({ date: 1, department: 1 });

module.exports = { schema, modelName: 'Attendance' };
