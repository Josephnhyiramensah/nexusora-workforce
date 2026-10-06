// A Certification — a professional certification, licence, membership or qualification that
// an employee holds (issued by an external body), tracked for compliance with an expiry date
// and renewal reminders. Compliance-critical in regulated industries.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },

  name: { type: String, required: true, trim: true }, // e.g. "ACCA", "Driver's Licence C", "PMP"
  type: { type: String, enum: ['certification', 'license', 'membership', 'qualification'], default: 'certification', index: true },
  issuingBody: { type: String, default: '' },
  certificateNumber: { type: String, default: '' },

  issueDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null, index: true }, // null = does not expire

  verified: { type: Boolean, default: false },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedDate: { type: Date, default: null },

  file: { name: String, url: String, publicId: String, format: String, bytes: Number, uploadedAt: Date },
  notes: { type: String, default: '' },
}, { timestamps: true, collection: 'certifications' });

// Virtual status derived from expiryDate (valid / expiring / expired / no_expiry).
schema.methods.computedStatus = function computedStatus(soonDays = 60) {
  if (!this.expiryDate) return 'no_expiry';
  const now = Date.now();
  const exp = new Date(this.expiryDate).getTime();
  if (exp < now) return 'expired';
  if (exp - now <= soonDays * 864e5) return 'expiring';
  return 'valid';
};

module.exports = { schema, modelName: 'Certification' };