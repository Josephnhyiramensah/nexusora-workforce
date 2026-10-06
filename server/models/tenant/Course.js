// A Course — one item in the training catalog (internal or external): induction,
// mandatory/compliance training, technical, leadership, soft-skills, etc.
// Completing a course can grant a certification that expires (validForMonths),
// which drives renewal/refresher tracking.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  code: { type: String, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  category: { type: String, enum: ['induction', 'mandatory', 'compliance', 'technical', 'leadership', 'soft_skills', 'health_safety', 'other'], default: 'other', index: true },
  deliveryMode: { type: String, enum: ['classroom', 'online', 'on_the_job', 'external', 'webinar', 'blended'], default: 'classroom' },
  provider: { type: String, default: '' },            // internal dept or external body
  isExternal: { type: Boolean, default: false },

  durationHours: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  currency: { type: String, default: 'GHS' },

  mandatory: { type: Boolean, default: false },
  validForMonths: { type: Number, default: 0 },        // 0 = no expiry; else completion + N months
  passMark: { type: Number, default: 0 },              // % required to pass, if scored

  competencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Competency' }], // what it develops
  targetRoles: { type: [String], default: [] },
  targetGrades: { type: [String], default: [] },

  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'courses' });

schema.index({ title: 'text', code: 'text', provider: 'text' });

module.exports = { schema, modelName: 'Course' };