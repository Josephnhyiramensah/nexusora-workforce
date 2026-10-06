// A Review — one employee's appraisal within a cycle. Carries goals and competencies
// each rated by the employee (self) and their manager, with a status flow:
//   draft -> self_submitted -> manager_review -> completed -> acknowledged
const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  weight: { type: Number, default: 0 },                        // % weighting, optional
  selfRating: { type: Number, default: null },
  managerRating: { type: Number, default: null },
  selfComment: { type: String, default: '' },
  managerComment: { type: String, default: '' },
}, { _id: true });

const compSchema = new mongoose.Schema({
  name: { type: String, required: true },
  selfRating: { type: Number, default: null },
  managerRating: { type: Number, default: null },
  comment: { type: String, default: '' },
}, { _id: true });

const schema = new mongoose.Schema({
  cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'AppraisalCycle', required: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },

  goals: { type: [goalSchema], default: [] },
  competencies: { type: [compSchema], default: [] },

  overall: {
    selfRating: { type: Number, default: null },
    managerRating: { type: Number, default: null },
  },
  selfComments: { type: String, default: '' },
  managerComments: { type: String, default: '' },

  status: { type: String, enum: ['draft', 'self_submitted', 'manager_review', 'completed', 'acknowledged'], default: 'draft', index: true },
  selfSubmittedAt: { type: Date, default: null },
  managerSubmittedAt: { type: Date, default: null },
  acknowledgedAt: { type: Date, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'reviews' });

// One review per employee per cycle.
schema.index({ cycle: 1, employee: 1 }, { unique: true });

module.exports = { schema, modelName: 'Review' };