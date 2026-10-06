// Foundation Object — an organizational unit (department, section/estate, cost centre, location).
// One flexible model differentiated by `type`, so new unit kinds are a data change, not a code change.
// `parent` allows nesting (section under department, sub-dept under dept) — the basis of the org tree.
// Employees reference these by _id (employment.departmentId / employment.sectionId), so renaming a
// unit propagates everywhere instead of leaving orphaned free-text.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['department', 'section', 'cost_centre', 'location'],
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },   // display label, e.g. "Information Technology"
  code: { type: String, trim: true, index: true },      // short key, e.g. "IT" / "EST-01"
  description: String,

  // Optional parent unit (e.g. a section belongs to a department). Same collection, self-referential.
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgUnit', default: null },

  // Optional head of this unit (an employee). Kept loose (no hard populate requirement).
  head: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },

  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
}, { collection: 'org_units', minimize: false });

// A code should be unique per type within a tenant (two departments can't both be "IT",
// but a department "IT" and a cost_centre "IT" is allowed). Sparse so blank codes don't collide.
schema.index({ type: 1, code: 1 }, { unique: true, sparse: true });
schema.index({ type: 1, name: 1 });

module.exports = { schema, modelName: 'OrgUnit' };