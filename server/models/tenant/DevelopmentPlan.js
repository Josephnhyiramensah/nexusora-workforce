// A DevelopmentPlan — an Individual Development Plan (IDP) for one employee: a set of
// development goals, each optionally linked to a competency (to close a gap) and/or a
// course from the Learning module, with a target date and progress. One row per employee
// per cycle (an employee may have historical plans across cycles).
const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  action: { type: String, default: '' },               // how it will be developed
  method: { type: String, enum: ['course', 'on_the_job', 'mentoring', 'coaching', 'stretch_assignment', 'reading', 'other'], default: 'on_the_job' },
  competency: { type: mongoose.Schema.Types.ObjectId, ref: 'Competency', default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  targetDate: { type: Date, default: null },
  status: { type: String, enum: ['not_started', 'in_progress', 'completed', 'deferred'], default: 'not_started' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  notes: { type: String, default: '' },
}, { _id: true });

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  cycle: { type: String, default: '' },                 // e.g. "2026"
  title: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'active', 'completed', 'archived'], default: 'active', index: true },

  goals: { type: [goalSchema], default: [] },

  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  reviewDate: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'development_plans' });

module.exports = { schema, modelName: 'DevelopmentPlan' };
