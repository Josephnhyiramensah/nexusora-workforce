// Tenant-scoped API key for external integrations. The raw key is shown to the
// admin exactly once at creation; only its SHA-256 hash is stored, so a leaked
// database never exposes usable keys. Scopes (permissions) gate what an
// integration may do through the public /api/v1 surface.
const mongoose = require('mongoose');

const SCOPES = ['read', 'write', 'employees', 'payroll', 'leave', 'attendance', 'documents'];

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  hashedKey: { type: String, required: true, unique: true },   // sha256(rawKey)
  keyPrefix: { type: String },                                  // e.g. "nxw_live_a1b2c3d4…" for display
  permissions: { type: [{ type: String, enum: SCOPES }], default: ['read'] },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  lastUsed: { type: Date, default: null },
  requestCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'apikeys' });

schema.statics.SCOPES = SCOPES;

module.exports = { schema, modelName: 'ApiKey' };
