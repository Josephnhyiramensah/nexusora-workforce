// A saved Data Scientist analysis — the audit record for AI-written code that
// ran in the sandbox. Captures exactly what was asked, the code that executed,
// the computed result, charts, who ran it and when. Governance for "AI ran code
// against our data": every run is reviewable after the fact.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  dataset: { type: String, default: 'employees' },      // dataset key
  datasetLabel: { type: String, default: '' },
  source: { type: String, enum: ['system', 'upload'], default: 'system' },

  code: { type: String, default: '' },                  // the exact code that ran
  narrative: { type: String, default: '' },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },  // capped JSON result
  charts: { type: [String], default: [] },              // base64 PNGs (capped count)
  stdout: { type: String, default: '' },

  rowsAnalyzed: { type: Number, default: 0 },
  ok: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false },
  error: { type: String, default: '' },

  // Conversational threading: a follow-up links to the analysis it built on.
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'DataAnalysis', default: null },
  step: { type: Number, default: 1 },

  author: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, default: '' },
  },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'data_analyses', minimize: false });

schema.index({ createdAt: -1 });
schema.index({ parent: 1 });

module.exports = { schema, modelName: 'DataAnalysis' };
