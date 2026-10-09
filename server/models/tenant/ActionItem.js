const mongoose = require('mongoose');

// A follow-up action from an engagement survey — assigned to an owner, tracked
// to completion. Optionally linked to the survey that prompted it.
const schema = new mongoose.Schema({
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', default: null },
  title: { type: String, required: true, trim: true },
  detail: String,
  owner: String,                 // free-text name or team
  dueDate: Date,
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_progress', 'done'], default: 'open' },
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  completedAt: Date,
}, { collection: 'action_items', minimize: false });

module.exports = { schema, modelName: 'ActionItem' };
