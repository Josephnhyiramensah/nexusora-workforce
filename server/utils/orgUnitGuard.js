// server/utils/orgUnitGuard.js
// Strict server-side de-duplication for org units / departments.
// Uses the canonical taxonomy so "IT" is refused when "Information Technology"
// (or "I.T.", "ICT", …) already exists, and every saved name is stored in its
// clean canonical form.
const { validateNewUnit, canonicalize } = require('./orgTaxonomy');

// Check a proposed unit name against the tenant's existing units.
//   Model       — the Mongoose model (e.g. req.tenantConn.model('OrgUnit'))
//   proposed    — the incoming name string
//   opts.excludeId    — pass on update so a unit doesn't clash with itself
//   opts.extraFilter  — extra query to scope the comparison set (e.g. { type: 'department' })
// Returns { ok:true, canonical } or { ok:false, reason:'empty'|'duplicate', existing?, canonical }.
async function checkUnit(Model, proposed, opts = {}) {
  const { excludeId, extraFilter } = opts;
  const filter = { ...(extraFilter || {}) };
  if (excludeId) filter._id = { $ne: excludeId };
  const rows = await Model.find(filter, 'name').lean();
  return validateNewUnit(proposed, rows.map((r) => r.name).filter(Boolean));
}

module.exports = { checkUnit, canonicalize };