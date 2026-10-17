// server/middleware/authorize.js
// ACL gate for Nexusora Workforce. Runs AFTER `protect` (auth.js), which verifies
// the JWT and puts its payload on req.auth = { userId, tenant, role }.
// Asks only the action-level question: "does this user hold <permission> at all?"
// — synchronous, no DB round-trip.
//
// OVERRIDES (E4): the JWT carries only `role`, so to apply per-user
// permissionOverrides we load the acting user's { role, permissionOverrides }
// from the tenant DB — once per request, cached on req — and resolve against
// that. Changes an admin makes take effect immediately (no token refresh), and
// the common path (routes with no authorize() gate) still pays zero DB cost.
// Falls back to the token's role only if the tenant connection is unavailable.
//
// Scope enforcement ("WHICH records?") is NOT done here — it is woven into each
// controller's queries as modules are touched. This middleware is the yes/no gate.
//
// Usage:  router.post('/:id/approve', protect, resolveTenant, authorize('leave.approve'), handler)

const { can } = require('../utils/acl');

// Load the acting user's ACL fields once per request. Returns the lean user doc,
// or null when it can't be loaded (then callers fall back to the token role).
async function loadAclUser(req) {
  if (Object.prototype.hasOwnProperty.call(req, '_aclUser')) return req._aclUser;
  let user = null;
  try {
    if (req.tenantConn && req.auth && req.auth.userId) {
      user = await req.tenantConn.model('User')
        .findById(req.auth.userId).select('role permissionOverrides isActive').lean();
    }
  } catch { user = null; }
  req._aclUser = user;
  return user;
}

function authorize(permission) {
  if (typeof permission !== 'string' || !permission) {
    throw new Error('authorize() requires a permission string, e.g. authorize("leave.approve")');
  }

  return async function (req, res, next) {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ message: 'Not authenticated' });
    try {
      const user = await loadAclUser(req);
      // A loaded-but-deactivated account is refused even with a still-valid token.
      if (user && user.isActive === false) {
        return res.status(403).json({ message: 'Account is inactive' });
      }
      // Resolve against the DB user (role + overrides) when available, else the
      // token's role only.
      const subject = user || { role: auth.role };
      if (can(subject, permission)) return next();
    } catch (e) { return next(e); }

    return res.status(403).json({
      message: 'You do not have permission to perform this action',
      required: permission,
    });
  };
}

module.exports = authorize;
module.exports.loadAclUser = loadAclUser;