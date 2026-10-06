// An OnboardingTemplate — a reusable onboarding PROGRAM (SAP-style): a named checklist of
// phased tasks and required documents that HR defines once (per role/department) and applies
// to each new hire. Task due dates are set as an OFFSET in days from the hire's start date.
const mongoose = require('mongoose');

const tplTaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'hr' },
  phase: { type: String, enum: ['pre_boarding', 'first_day', 'first_week', 'first_month', 'probation', 'other'], default: 'first_week' },
  owner: { type: String, default: '' },
  dueOffsetDays: { type: Number, default: null },   // due = start date + offset (negative = before start)
  order: { type: Number, default: 0 },
}, { _id: true });

const tplDocSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { _id: true });

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },       // "Field Worker Onboarding", "Management Onboarding"
  description: { type: String, default: '' },
  appliesTo: { type: String, default: '' },                 // free label: role / department / worker class
  isDefault: { type: Boolean, default: false },
  tasks: { type: [tplTaskSchema], default: [] },
  documents: { type: [tplDocSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'onboarding_templates' });

module.exports = { schema, modelName: 'OnboardingTemplate' };