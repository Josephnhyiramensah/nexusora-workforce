// An ERCase — one Employee Relations case: a disciplinary matter, a grievance, a dispute or
// a query. It holds the full case file: an audit timeline, the hearing record, the sanction
// (with an expiry date, because warnings lapse), any appeal, and supporting documents.
// caseNumber is assigned per-tenant per-year (ER-YYYY-####).
const mongoose = require('mongoose');

const timelineSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byName: { type: String, default: '' },
  action: { type: String, default: '' },              // e.g. "Case opened", "Investigation started", "Hearing held"
  note: { type: String, default: '' },
}, { _id: true });

const docSchema = new mongoose.Schema({
  name: String, url: String, publicId: String, format: String, bytes: Number,
  kind: { type: String, default: '' },                // e.g. "statement", "evidence", "warning_letter"
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  caseNumber: { type: String, index: true },
  type: { type: String, enum: ['disciplinary', 'grievance', 'dispute', 'query'], default: 'disciplinary', index: true },

  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true }, // subject (or complainant for a grievance)
  against: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },                // respondent (grievance)

  category: { type: String, default: '' },            // offence / issue category
  severity: { type: String, enum: ['na', 'minor', 'serious', 'gross_misconduct'], default: 'minor' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['open', 'investigation', 'hearing', 'awaiting_decision', 'closed', 'appealed', 'withdrawn'], default: 'open', index: true },

  dateOfIncident: { type: Date, default: null },
  dateReported: { type: Date, default: Date.now },
  location: { type: String, default: '' },
  description: { type: String, default: '' },

  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },  // IR/HR officer handling
  confidential: { type: Boolean, default: false },

  timeline: { type: [timelineSchema], default: [] },

  hearing: {
    scheduled: { type: Date, default: null },
    venue: { type: String, default: '' },
    panel: { type: [String], default: [] },
    heldOn: { type: Date, default: null },
    minutes: { type: String, default: '' },
    outcome: { type: String, default: '' },
  },

  sanction: {
    outcome: { type: String, enum: ['none', 'exonerated', 'counseling', 'verbal_warning', 'written_warning', 'final_written_warning', 'suspension', 'demotion', 'dismissal'], default: 'none' },
    issuedDate: { type: Date, default: null },
    effectiveDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null, index: true },   // warnings lapse; null = no expiry / permanent
    suspensionDays: { type: Number, default: 0 },
    details: { type: String, default: '' },
  },

  appeal: {
    lodged: { type: Boolean, default: false },
    lodgedDate: { type: Date, default: null },
    grounds: { type: String, default: '' },
    outcome: { type: String, enum: ['', 'upheld', 'dismissed', 'modified'], default: '' },
    decidedDate: { type: Date, default: null },
    notes: { type: String, default: '' },
  },

  documents: { type: [docSchema], default: [] },

  outcomeSummary: { type: String, default: '' },
  closedDate: { type: Date, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'er_cases' });

module.exports = { schema, modelName: 'ERCase' };