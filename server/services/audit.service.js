// Audit recording (C1). Non-throwing — a failed audit write must never break the
// request it describes.
const SENSITIVE = ['password', 'newPassword', 'currentPassword', 'token', 'secret', 'apiKey', 'code', 'backupCode'];

// Keys-only, redacted summary of a request body for the trail.
function summarizeBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const out = {};
  for (const k of Object.keys(body)) {
    if (SENSITIVE.includes(k)) { out[k] = '***'; continue; }
    const v = body[k];
    if (v == null) continue;
    if (typeof v === 'object') out[k] = Array.isArray(v) ? `[${v.length}]` : '{…}';
    else out[k] = String(v).slice(0, 120);
  }
  return out;
}

async function record(conn, entry) {
  if (!conn) return;
  try {
    const AuditLog = conn.models.AuditLog || conn.model('AuditLog', require('../models/tenant/AuditLog').schema);
    await AuditLog.create({ ...entry, at: new Date() });
  } catch (e) {
    console.error('[audit] write failed:', e && e.message);
  }
}

module.exports = { record, summarizeBody };
