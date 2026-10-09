const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  // scale = 1–5 Likert, nps = 0–10 recommend score, choice = pick an option, text = free text
  kind: { type: String, enum: ['scale', 'nps', 'choice', 'text'], default: 'scale' },
  options: [String],
}, { _id: true });

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  type: { type: String, enum: ['pulse', 'enps', 'custom'], default: 'pulse' },
  questions: [questionSchema],
  audience: {
    scope: { type: String, enum: ['all', 'department'], default: 'all' },
    department: String,
  },
  anonymous: { type: Boolean, default: true },
  status: { type: String, enum: ['draft', 'open', 'closed'], default: 'draft' },
  createdBy: String,
  openedAt: Date,
  closedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
}, { collection: 'surveys', minimize: false });

module.exports = { schema, modelName: 'Survey' };
