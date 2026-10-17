const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const { escapeRegex } = require('../../utils/searchRegex');

// Verbs the audit trail records (middleware/auditTrail maps HTTP → these).
const VERBS = ['create', 'update', 'delete'];
const METHOD_VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// Resolve ?from / ?to into a date window. `to` with a bare date (no time) is
// treated as end-of-day so "to=2026-10-17" includes everything on the 17th.
function dateWindow(from, to) {
  const at = {};
  if (from) { const d = new Date(from); if (!isNaN(d)) at.$gte = d; }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d)) { if (/^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) d.setHours(23, 59, 59, 999); at.$lte = d; }
  }
  return Object.keys(at).length ? at : null;
}

// Build the Mongo filter shared by list + count from the query string.
// Filters: actor, action (exact or prefix), entity/resource (action prefix),
// method/verb, impersonated, q (free text), from/to (date window).
function buildFilter(q) {
  const { actor, action, entity, resource, method, verb, impersonated, q: text, from, to } = q;
  const filter = {};

  if (actor) filter['actor.id'] = String(actor);

  // `resource`/`entity` narrows to a module by the action prefix
  // (e.g. resource=employee → action starts with "employee."). `action`, when
  // it carries no dot, is also treated as a prefix; a full "resource.verb"
  // matches exactly. The two combine with $and so both can apply.
  const and = [];
  const res = resource || entity;
  if (res) and.push({ action: new RegExp('^' + escapeRegex(String(res)) + '\\.') });
  if (action) {
    const a = String(action);
    and.push(a.includes('.') ? { action: a } : { action: new RegExp('^' + escapeRegex(a)) });
  }
  if (and.length) filter.$and = and;

  // Narrow by HTTP method directly, or by the verb the action suffix encodes
  // (create/update/delete). `method` wins when both are present.
  const m = method ? String(method).toUpperCase() : null;
  if (m && METHOD_VERB[m]) filter.method = m;
  else if (verb && VERBS.includes(verb)) filter.action = new RegExp('\\.' + escapeRegex(verb) + '$');

  if (impersonated === 'true' || impersonated === '1') filter['meta.impersonated'] = true;

  if (text && String(text).trim()) {
    const rx = new RegExp(escapeRegex(String(text).trim()), 'i');
    filter.$or = [{ summary: rx }, { path: rx }, { 'actor.name': rx }, { 'actor.email': rx }, { action: rx }, { entityId: rx }];
  }

  const at = dateWindow(from, to);
  if (at) filter.at = at;

  return filter;
}

// Attach actor name/email/role from the tenant User collection (ids are strings).
async function enrichActors(conn, items) {
  const ids = [...new Set(items.map((i) => i.actor && i.actor.id).filter((id) => id && mongoose.Types.ObjectId.isValid(id)))];
  let umap = {};
  if (ids.length) {
    const users = await conn.model('User').find({ _id: { $in: ids } }).select('name email role').lean();
    umap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  }
  return items.map((i) => {
    const u = umap[i.actor && i.actor.id];
    const a = i.actor || {};
    return { ...i, actor: { ...a, name: a.name || (u && u.name) || null, email: a.email || (u && u.email) || null, role: a.role || (u && u.role) || null } };
  });
}

// GET /api/audit — the tenant's own activity trail (admin / HR manager).
const listAudit = asyncHandler(async (req, res) => {
  const AuditLog = req.tenantConn.model('AuditLog');
  const filter = buildFilter(req.query);
  const pg = Math.max(1, parseInt(req.query.page, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    AuditLog.countDocuments(filter),
  ]);

  const enriched = await enrichActors(req.tenantConn, items);
  res.json({ items: enriched, total, page: pg, pages: Math.ceil(total / lim) || 1, limit: lim });
});

// GET /api/audit/facets — distinct actors and action/resource values present in
// this tenant's log, so the viewer can populate its filter dropdowns without
// guessing. Cheap: distinct over indexed-ish fields, capped lists.
const auditFacets = asyncHandler(async (req, res) => {
  const AuditLog = req.tenantConn.model('AuditLog');

  const [actorIds, actions] = await Promise.all([
    AuditLog.distinct('actor.id'),
    AuditLog.distinct('action'),
  ]);

  // Resolve actor ids → {id,name,email,role}; keep only the ones we can name,
  // plus any system/platform ids, so the dropdown is human-readable.
  const validIds = actorIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id));
  let users = [];
  if (validIds.length) {
    users = await req.tenantConn.model('User').find({ _id: { $in: validIds } }).select('name email role').lean();
  }
  const umap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const actors = actorIds
    .filter(Boolean)
    .map((id) => { const u = umap[id]; return { id: String(id), name: (u && u.name) || null, email: (u && u.email) || null, role: (u && u.role) || null }; })
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  // Split actions into resources (prefix) and the full action list.
  const cleanActions = actions.filter(Boolean).sort();
  const resources = [...new Set(cleanActions.map((a) => String(a).split('.')[0]).filter(Boolean))].sort();

  res.json({ actors, actions: cleanActions, resources, verbs: VERBS });
});

// GET /api/audit/:id — a single entry, actor-enriched (tray detail view).
const getAuditEntry = asyncHandler(async (req, res) => {
  const AuditLog = req.tenantConn.model('AuditLog');
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
  const entry = await AuditLog.findById(req.params.id).lean();
  if (!entry) return res.status(404).json({ message: 'Audit entry not found' });
  const [enriched] = await enrichActors(req.tenantConn, [entry]);
  res.json(enriched);
});

module.exports = { listAudit, auditFacets, getAuditEntry, buildFilter, dateWindow };
