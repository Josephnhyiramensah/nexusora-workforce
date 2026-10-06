// An Application — a candidate in the recruitment pipeline for a Vacancy.
// Interviews, notes, the offer and a stage timeline are embedded so one record tells the
// whole story of a candidate. Hiring an application creates an Employee and links it here.
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
}, { _id: true });

const interviewSchema = new mongoose.Schema({
  round: String,                                              // "Phone screen", "Technical", "Panel"...
  date: Date,
  mode: { type: String, enum: ['in_person', 'phone', 'video'], default: 'in_person' },
  panel: { type: [String], default: [] },                    // interviewer names
  location: String,
  outcome: { type: String, enum: ['pending', 'pass', 'fail', 'hold'], default: 'pending' },
  notes: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
}, { _id: true });

const timelineSchema = new mongoose.Schema({
  stage: String,
  note: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  at: { type: Date, default: Date.now },
}, { _id: false });

const STAGES = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];

const schema = new mongoose.Schema({
  vacancy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vacancy', required: true, index: true },

  // Candidate details
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, trim: true, default: '' },
  email: { type: String, lowercase: true, trim: true, default: '' },
  phone: { type: String, default: '' },
  gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
  source: { type: String, default: '' },                     // referral / website / agency / walk-in
  currentTitle: { type: String, default: '' },
  coverNote: { type: String, default: '' },
  resume: {
    name: String, url: String, publicId: String, format: String, bytes: Number, uploadedAt: Date,
  },

  stage: { type: String, enum: STAGES, default: 'applied', index: true },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  tags: { type: [String], default: [] },
  notes: { type: [noteSchema], default: [] },
  interviews: { type: [interviewSchema], default: [] },

  offer: {
    salary: { type: Number, default: null },
    currency: { type: String, default: '' },
    startDate: { type: Date, default: null },
    status: { type: String, enum: ['none', 'extended', 'accepted', 'declined'], default: 'none' },
    note: { type: String, default: '' },
    letterUrl: { type: String, default: '' },
    extendedAt: { type: Date, default: null },
  },

  rejectionReason: { type: String, default: '' },
  hiredEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  timeline: { type: [timelineSchema], default: [] },

  appliedAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'applications' });

module.exports = { schema, modelName: 'Application' };