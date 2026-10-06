// An Onboarding record — the new-hire journey for one employee: a checklist of tasks
// (owned by HR / IT / manager / etc.), documents to collect, and probation tracking.
// Usually created right after a hire, but can be started for any employee.
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'hr' },
  phase: { type: String, enum: ['pre_boarding', 'first_day', 'first_week', 'first_month', 'probation', 'other'], default: 'first_week' },
  owner: { type: String, default: '' },                       // free label e.g. "IT", "Line Manager"
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'done', 'na'], default: 'pending' },
  completedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  order: { type: Number, default: 0 },
}, { _id: true });

const docSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  required: { type: Boolean, default: false },
  received: { type: Boolean, default: false },
  note: { type: String, default: '' },
  file: { name: String, url: String, publicId: String, format: String, bytes: Number, uploadedAt: Date },
  order: { type: Number, default: 0 },
}, { _id: true });

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', default: null }, // link back to the hire, if any

  startDate: { type: Date, default: null },
  status: { type: String, enum: ['not_started', 'in_progress', 'completed', 'cancelled'], default: 'in_progress', index: true },
  program: { type: String, default: '' },                     // name of the template/program applied
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingTemplate', default: null },
  buddy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },  // mentor / buddy

  tasks: { type: [taskSchema], default: [] },
  documents: { type: [docSchema], default: [] },

  probation: {
    endDate: { type: Date, default: null },
    review: { type: String, enum: ['pending', 'passed', 'failed', 'extended'], default: 'pending' },
    note: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },

  note: { type: String, default: '' },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'onboardings' });

module.exports = { schema, modelName: 'Onboarding' };