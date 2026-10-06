// server/middleware/authorize.js
// ACL gate for Nexusora Workforce. Runs AFTER `protect` (auth.js), which verifies
// the JWT and puts its payload on req.auth = { userId, tenant, role }.
// Asks only the action-level question: "does this user hold <permission> at all?"
// — synchronous, no DB round-trip.
//
// NOTE ON OVERRIDES: protect() attaches JWT claims only, not a DB user document,
// so req.auth carries `role` but NOT `permissionOverrides`. Action-level checks
// (role defaults) therefore work today. Per-user overrides will take effect only
// once we decide how protect learns them (bake into JWT, or load user per request)
// — handled at the User-model step, not here. resolvePermissions safely treats a
// missing overrides field as "no overrides", so nothing breaks in the meantime.
//
// Scope enforcement ("WHICH records?") is NOT done here — it is woven into each
// controller's queries as modules are touched. This middleware is the yes/no gate.
//
// Usage:  router.post('/:id/approve', protect, authorize('leave.approve'), handler)

const { can } = require('../utils/acl');

function authorize(permission) {
  if (typeof permission !== 'string' || !permission) {
    throw new Error('authorize() requires a permission string, e.g. authorize("leave.approve")');
  }

  return function (req, res, next) {
    // protect (auth.js) sets req.auth from the token. If absent, auth-order bug.
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // resolvePermissions/can expect an object with `role` and optionally
    // `permissionOverrides`. req.auth has role; overrides are absent for now
    // and safely treated as none.
    if (can(auth, permission)) {
      return next();
    }

    return res.status(403).json({
      message: 'You do not have permission to perform this action',
      required: permission,
    });
  };
}

module.exports = authorize;