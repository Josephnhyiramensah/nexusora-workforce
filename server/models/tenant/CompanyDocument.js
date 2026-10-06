// A CompanyDocument — a controlled document in the central library: policies, handbooks,
// forms, notices, templates, certificates. Professional-grade controls:
//   • Lifecycle status (draft → published → archived) — staff only ever see published docs.
//   • Version history — every re-upload is kept; the newest is "current".
//   • Read & acknowledge — staff formally acknowledge a policy; acks are stamped with the
//     version they read, so publishing a new version flags everyone for re-acknowledgement.
//   • Effective / review / expiry dates for renewal & governance tracking.
const mongoose = require('mongoose');

// One stored file revision.
const versionSchema = new mongoose.Schema({
  version: { type: String, default: '' },          // "1", "2", "3.0" …
  file: { name: String, url: String, publicId: String, format: String, bytes: Number },
  note: { type: String, default: '' },             // what changed
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  uploadedByName: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

// One acknowledgement (a person confirming they have read the document).
const ackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  name: { type: String, default: '' },             // snapshot of who acknowledged
  role: { type: String, default: '' },
  version: { type: String, default: '' },          // the version they acknowledged
  acknowledgedAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: { type: String, enum: ['policy', 'handbook', 'form', 'notice', 'contract_template', 'certificate', 'report', 'other'], default: 'other', index: true },
  description: { type: String, default: '' },

  // Governance / lifecycle
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published', index: true },
  publishedAt: { type: Date, default: null },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },   // responsible person

  // Current file (mirror of the latest entry in `versions` for quick access)
  file: { name: String, url: String, publicId: String, format: String, bytes: Number, uploadedAt: Date },
  version: { type: String, default: '' },          // current version label
  versions: { type: [versionSchema], default: [] },

  // Acknowledgement / compliance
  requireAcknowledgement: { type: Boolean, default: false },
  acknowledgements: { type: [ackSchema], default: [] },

  // Who may see it: ['all'] or a list of role codes.
  visibility: { type: [String], default: ['all'] },

  effectiveDate: { type: Date, default: null },
  reviewDate: { type: Date, default: null, index: true },     // next scheduled review
  expiryDate: { type: Date, default: null, index: true },
  tags: { type: [String], default: [] },

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'company_documents' });

module.exports = { schema, modelName: 'CompanyDocument' };