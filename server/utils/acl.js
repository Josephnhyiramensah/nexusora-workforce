// server/utils/acl.js
// ACL resolver for Nexusora Workforce — PURE and SYNCHRONOUS. No DB, no async.
// Turns a user (role + per-user overrides) into an effective permission map,
// and answers the action-level question the middleware asks on every request:
// "does this user have <permission> at all?"
//
// It deliberately does NOT translate a scope into a set of record IDs — that is
// an async, DB-touching job (using employment.lineManager for `team`,
// employment.departmentId/sectionId for `unit`, user.employee for `self`) and
// lives in a separate util that phases in per module. Keeping THIS file pure
// means the middleware can gate a request with zero database round-trips.
//
// Override shape this resolver reads off the user document (defined here so the
// User model extension in the next step matches it exactly):
//   permissionOverrides: [ { permission: 'leave.approve', effect: 'grant'|'revoke', scope: 'team' } ]
// Semantics: expand role defaults, apply all GRANTS (explicit scope set),
// then apply all REVOKES (remove) — so revoke wins on conflict.

const {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isValidPermission,
  isValidScope,
} = require('../config/permissions');

// Build the effective { 'resource.action': scope } map for a user.
// Unknown/absent role -> {} (deny-all, the safe default).
function resolvePermissions(user) {
  if (!user || !user.role) return {};

  const roleMap = ROLE_PERMISSIONS[user.role];
  if (!roleMap) return {}; // role not in catalog -> deny everything

  // 1) Expand role defaults. '*' means "every permission at this scope".
  const effective = {};
  for (const [perm, scope] of Object.entries(roleMap)) {
    if (perm === '*') {
      for (const p of PERMISSIONS) effective[p] = scope;
    } else if (isValidPermission(perm)) {
      effective[perm] = scope;
    }
  }

  // 2) Apply per-user overrides. Grants first, then revokes (revoke wins).
  const overrides = Array.isArray(user.permissionOverrides) ? user.permissionOverrides : [];

  for (const o of overrides) {
    if (!o || o.effect !== 'grant') continue;
    if (!isValidPermission(o.permission)) continue;   // skip stale/renamed perms
    if (!isValidScope(o.scope)) continue;             // grant must carry a valid scope
    effective[o.permission] = o.scope;                // explicit set
  }

  for (const o of overrides) {
    if (!o || o.effect !== 'revoke') continue;
    delete effective[o.permission];                   // remove entirely
  }

  return effective;
}

// Action-level check: does the user hold <permission> at any scope?
function can(user, permission) {
  const effective = resolvePermissions(user);
  return Object.prototype.hasOwnProperty.call(effective, permission);
}

// Scope-level lookup: the scope at which the user holds <permission>, or null.
// Used later by controllers to filter records; harmless to call now.
function scopeFor(user, permission) {
  const effective = resolvePermissions(user);
  return effective[permission] || null;
}

module.exports = { resolvePermissions, can, scopeFor };