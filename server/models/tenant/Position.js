// A Position — a distinct organizational seat, independent of the person filling it.
// "IT Director" exists whether or not someone holds it. Employees reference a position
// via employment.positionId. Vacancy = positions whose assigned-employee count < headcount.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, trim: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgUnit', default: null },
  grade: String,
  // Reuse the Employee enums so a position and its holder stay consistent.
  workerClass: { type: String, enum: ['staff', 'field_worker', 'tapper', 'operator'], default: 'staff' },
  employmentType: { type: String, enum: ['permanent', 'contract', 'casual', 'seasonal', 'probation'], default: 'permanent' },
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', default: null },
  headcount: { type: Number, default: 1 },   // authorised number of seats
  description: String,
  // Structured job description for this seat (edited on the Job Descriptions page).
  jobDescription: {
    summary: String,
    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    competencies: { type: [String], default: [] },
    // Optional uploaded soft copy (existing JD document).
    file: { name: String, url: String, publicId: String, format: String, bytes: Number, uploadedAt: Date },
    updatedAt: Date,
  },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
}, { collection: 'positions', minimize: false });

schema.index({ code: 1 }, { unique: true, sparse: true });
schema.index({ title: 1 });

module.exports = { schema, modelName: 'Position' };