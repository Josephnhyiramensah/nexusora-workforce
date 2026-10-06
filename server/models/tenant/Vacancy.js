// A Vacancy — a job opening in the recruitment pipeline. It may be tied to an existing
// Position (a seat to fill) or stand alone (a brand-new role). Applications reference a Vacancy.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, trim: true, index: true },            // e.g. VAC-2026-0001

  // Optional links into the org so a hire lands in the right place.
  position: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', default: null },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgUnit', default: null },
  hiringManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },

  grade: String,
  // Reuse the Employee/Position enums so a hire stays consistent with the rest of the system.
  workerClass: { type: String, enum: ['staff', 'field_worker', 'tapper', 'operator'], default: 'staff' },
  employmentType: { type: String, enum: ['permanent', 'contract', 'casual', 'seasonal', 'probation'], default: 'permanent' },
  location: String,

  openings: { type: Number, default: 1, min: 1 },             // how many people to hire
  description: String,
  responsibilities: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  salaryRange: {
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    currency: { type: String, default: '' },
  },

  // draft -> open (accepting applications) -> on_hold / closed / filled
  status: { type: String, enum: ['draft', 'open', 'on_hold', 'closed', 'filled'], default: 'draft', index: true },
  openDate: { type: Date, default: null },
  closeDate: { type: Date, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'vacancies' });

module.exports = { schema, modelName: 'Vacancy' };