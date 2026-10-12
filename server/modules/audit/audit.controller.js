const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

// GET /api/audit — the tenant's own activity trail (admin/HR manager).
// Filters: ?actor=<userId>&action=<prefix>&from=&to=&page=&limit=
const listAudit = asyncHandler(async (req, res) => {
  const AuditLog = req.tenantConn.model('AuditLog');
  const { actor, action, from, to, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (actor) filter['actor.id'] = String(actor);
  if (action) filter.action = new RegExp('^' + String(action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (from || to) { filter.at = {}; if (from) filter.at.$gte = new Date(from); if (to) filter.at.$lte = new Date(to); }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    AuditLog.countDocuments(filter),
  ]);

  // Enrich actor names from the User collection (ids stored as strings).
  const ids = [...new Set(items.map((i) => i.actor && i.actor.id).filter((id) => id && mongoose.Types.ObjectId.isValid(id)))];
  let umap = {};
  if (ids.length) {
    const users = await req.tenantConn.model('User').find({ _id: { $in: ids } }).select('name email role').lean();
    umap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  }
  const enriched = items.map((i) => {
    const u = umap[i.actor && i.actor.id];
    return { ...i, actor: { ...(i.actor || {}), name: (i.actor && i.actor.name) || (u && u.name), email: u && u.email, role: (i.actor && i.actor.role) || (u && u.role) } };
  });
  res.json({ items: enriched, total, page: pg, pages: Math.ceil(total / lim) || 1 });
});

module.exports = { listAudit };
