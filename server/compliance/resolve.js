// Resolves the EFFECTIVE compliance pack for a tenant:
//   file pack (seed/fallback)  ⟵ deep-merged with ⟵  the tenant's DB overrides (editable data).
// Statutory numbers thus live as data the client/operator can edit, with the file only a default.
const { getPack } = require('./registry');

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Deep-merge override over base. Arrays (e.g. tax brackets) are REPLACED wholesale when overridden.
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = clone(base);
  for (const k of Object.keys(over)) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

// The effective pack: latest DB override with effectiveFrom <= `at`, merged over the file pack.
async function resolveEffectivePack(tenantConn, countryCode, at = new Date()) {
  const base = getPack(countryCode);
  if (!base) return null;
  let effective = clone(base);
  effective._source = 'file';
  if (tenantConn) {
    try {
      const rec = await tenantConn.model('CompliancePack')
        .findOne({ countryCode: String(countryCode).toUpperCase(), effectiveFrom: { $lte: at } })
        .sort({ effectiveFrom: -1 });
      if (rec && rec.overrides) {
        effective = deepMerge(effective, rec.overrides);
        effective._source = 'db-override';
        effective._effectiveFrom = rec.effectiveFrom;
        effective._overrideNote = rec.note;
      }
    } catch (e) { /* fall back to file pack */ }
  }
  return effective;
}

module.exports = { resolveEffectivePack, deepMerge };