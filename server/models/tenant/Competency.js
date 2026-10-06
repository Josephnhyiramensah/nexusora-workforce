// A Competency — a defined skill/behaviour in the competency framework, rated on a scale
// (default 1–5). Each competency can carry a required proficiency LEVEL per grade and/or
// position, which is what employee ratings are measured against to compute gaps.
const mongoose = require('mongoose');

// Required proficiency for a given grade or position.
const requirementSchema = new mongoose.Schema({
  grade: { type: String, default: '' },               // matches Employee.employment.grade
  position: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', default: null },
  requiredLevel: { type: Number, default: 3 },
}, { _id: true });

const schema = new mongoose.Schema({
  code: { type: String, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  category: { type: String, enum: ['core', 'leadership', 'technical', 'functional', 'behavioural'], default: 'core', index: true },
  scaleMax: { type: Number, default: 5 },
  // Optional labels for each level on the scale, e.g. ['Awareness','Basic','Competent','Advanced','Expert']
  levelLabels: { type: [String], default: [] },

  requirements: { type: [requirementSchema], default: [] },
  defaultRequiredLevel: { type: Number, default: 3 },  // fallback when no grade/position match

  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'competencies' });

module.exports = { schema, modelName: 'Competency' };