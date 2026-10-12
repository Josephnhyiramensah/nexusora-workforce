// Global audit capture (C1). Records every successful authenticated mutation
// across all modules without touching each controller. Mounted BEFORE the
// routers, but it logs on res 'finish' — by then the per-route protect/
// resolveTenant have populated req.auth and req.tenantConn.
const { record, summarizeBody } = require('../services/audit.service');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths not worth trailing (auth handshakes, read-ish helpers, the webhook).
const SKIP = [
  /^\/api\/auth\/(login|2fa|me|forgot-password|reset-password|verify-email|change-password)/,
  /^\/api\/fx\//,
  /^\/api\/billing\/webhook/,
  /^\/api\/notifications\/.*\/read/,
];

const VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// Derive 'resource.verb' from the URL, e.g. POST /api/employees -> employee.create.
function deriveAction(method, path) {
  const seg = path.replace(/^\/api\//, '').split('/')[0] || 'request';
  const resource = seg.replace(/s$/, '');           // crude singularise
  return `${resource}.${VERB[method] || method.toLowerCase()}`;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || '';
}

function auditTrail(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  const path = (req.originalUrl || req.url).split('?')[0];
  res.on('finish', () => {
    try {
      if (res.statusCode >= 400) return;                // only successful changes
      if (!req.tenantConn || !req.auth) return;         // authenticated tenant actions only
      if (SKIP.some((rx) => rx.test(path))) return;
      record(req.tenantConn, {
        actor: { id: String(req.auth.userId || ''), role: req.auth.role, type: 'user' },
        action: deriveAction(req.method, path),
        method: req.method,
        path,
        statusCode: res.statusCode,
        ip: clientIp(req),
        meta: { body: summarizeBody(req.body) },
      });
    } catch { /* never affect the response */ }
  });
  return next();
}

module.exports = { auditTrail, deriveAction };
