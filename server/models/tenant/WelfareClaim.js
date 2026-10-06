// A WelfareClaim — a staff welfare/benefit claim (medical, bereavement, hardship, marriage,
// maternity, education, …), submitted → reviewed → approved/rejected → paid. Can be linked to
// a welfare scheme it is paid from, carries the amount requested vs approved, and supporting
// documents.
const mongoose = require('mongoose');

const docSchema = new mongoose.Schema({
  name: String, url: String, publicId: String, format: String, bytes: Number,
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const schema = new mongoose.Schema({
  claimNumber: { type: String, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  category: { type: String, enum: ['medical', 'bereavement', 'hardship', 'marriage', 'maternity', 'education', 'accident', 'other'], default: 'other', index: true },
  scheme: { type: mongoose.Schema.Types.ObjectId, ref: 'WelfareScheme', default: null }, // paid from this fund

  amountRequested: { type: Number, default: 0 },
  amountApproved: { type: Number, default: 0 },
  currency: { type: String, default: 'GHS' },

  status: { type: String, enum: ['submitted', 'under_review', 'approved', 'rejected', 'paid'], default: 'submitted', index: true },
  description: { type: String, default: '' },
  relationship: { type: String, default: '' },        // e.g. bereavement — relation to deceased
  incidentDate: { type: Date, default: null },

  documents: { type: [docSchema], default: [] },

  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedDate: { type: Date, default: null },
  decisionNote: { type: String, default: '' },

  paidDate: { type: Date, default: null },
  paymentReference: { type: String, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'welfare_claims' });

module.exports = { schema, modelName: 'WelfareClaim' };
