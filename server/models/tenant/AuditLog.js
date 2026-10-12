// Audit trail (C1): who did what, when. One entry per mutating action. Lives on
// the tenant connection for in-tenant activity, and is also registered on the
// master connection for platform/admin-console actions. Append-only by
// convention — nothing in the app updates or deletes entries.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  actor: {
    id: { type: String },                 // user _id / platform admin id (string for both DBs)
    name: { type: String },
    email: { type: String },
    role: { type: String },
    type: { type: String, enum: ['user', 'platform', 'system'], default: 'user' },
  },
  action: { type: String, index: true },  // e.g. 'employee.update', 'tenant.suspend'
  method: { type: String },               // HTTP verb (generic capture)
  path: { type: String },                 // request path, query stripped
  entity: { type: String },               // resource type, when known
  entityId: { type: String },
  statusCode: { type: Number },
  summary: { type: String },              // human-readable line for the viewer
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String },
  at: { type: Date, default: Date.now, index: true },
}, { minimize: false, collection: 'auditlogs' });

schema.index({ at: -1 });
schema.index({ 'actor.id': 1, at: -1 });

module.exports = { schema, modelName: 'AuditLog' };
