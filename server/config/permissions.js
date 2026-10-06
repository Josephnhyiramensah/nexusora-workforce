// server/config/permissions.js
// ACL catalog for Nexusora Workforce — pure config, no imports, no DB.
// Single source of truth for: valid permissions, the four scopes, and the
// default permission set each role receives. Per-user overrides (grant/revoke)
// live on the User document and are layered on top of these defaults by the
// resolver (file 2). Nothing here executes logic.
//
// A permission is a `resource.action` string, granted at a SCOPE that answers
// "which records?" — not just yes/no. Scope enforcement is staged:
//   - action-level ("has leave.approve at all?")  -> enforced now, every route
//   - scope-level  ("which leave requests?")       -> woven into queries per module
// This config carries scope from day one so nothing needs re-migrating later.
//
// NOTE: the role keys in ROLE_PERMISSIONS must stay in sync with the ROLES
// enum in the User model.

// ---- Scopes -----------------------------------------------------------------
// all  : every record in the tenant
// unit : records in the user's own OrgUnit (descendant handling decided at query time)
// team : records where the user is the manager (their reports)
// self : only the user's own record
const SCOPES = ['all', 'unit', 'team', 'self'];

// Scope strength — used by the resolver when a grant override widens or narrows
// a permission the role already carries. Higher = sees more records.
const SCOPE_RANK = { self: 1, team: 2, unit: 3, all: 4 };

// ---- Resources & actions ----------------------------------------------------
// Resources map to modules/entities; actions to verbs. Extend as modules land.
const RESOURCE_ACTIONS = {
  employee:   ['read', 'create', 'update', 'delete', 'export'],
  orgunit:    ['read', 'create', 'update', 'delete'],
  position:   ['read', 'create', 'update', 'delete'],
  picklist:   ['read', 'create', 'update', 'delete'],
  attendance: ['read', 'create', 'update', 'export'],
  leave:      ['read', 'create', 'update', 'approve'],
  payroll:    ['read', 'run', 'approve', 'export'],
  user:       ['read', 'create', 'update', 'delete'],
  settings:   ['read', 'update'],
};

// Flattened list of every valid `resource.action`, e.g. 'employee.read'.
const PERMISSIONS = Object.entries(RESOURCE_ACTIONS)
  .flatMap(([resource, actions]) => actions.map((a) => `${resource}.${a}`));

const PERMISSION_SET = new Set(PERMISSIONS);
const isValidPermission = (p) => p === '*' || PERMISSION_SET.has(p);
const isValidScope = (s) => SCOPES.includes(s);

// ---- Default role -> permission map -----------------------------------------
// Shape: { role: { 'resource.action': scope, ... } }
// The wildcard '*' means "every permission" and is expanded by the resolver;
// only super_admin uses it. These defaults are STARTING POINTS — pure data,
// safe to tune. Per-user overrides refine them without editing this file.
const ROLE_PERMISSIONS = {
  super_admin: {
    '*': 'all',
  },

  hr_manager: {
    'employee.read': 'all', 'employee.create': 'all', 'employee.update': 'all',
    'employee.delete': 'all', 'employee.export': 'all',
    'orgunit.read': 'all', 'orgunit.create': 'all', 'orgunit.update': 'all', 'orgunit.delete': 'all',
    'position.read': 'all', 'position.create': 'all', 'position.update': 'all', 'position.delete': 'all',
    'picklist.read': 'all', 'picklist.update': 'all',
    'attendance.read': 'all', 'attendance.update': 'all', 'attendance.export': 'all',
    'leave.read': 'all', 'leave.update': 'all', 'leave.approve': 'all',
    'payroll.read': 'all', 'payroll.export': 'all',
    'user.read': 'all',
    'settings.read': 'all',
  },

  hr_officer: {
    'employee.read': 'all', 'employee.create': 'all', 'employee.update': 'all', 'employee.export': 'all',
    'orgunit.read': 'all',
    'position.read': 'all',
    'picklist.read': 'all',
    'attendance.read': 'all', 'attendance.create': 'all', 'attendance.update': 'all',
    'leave.read': 'all', 'leave.update': 'all',
    'settings.read': 'all',
  },

  line_manager: {
    'employee.read': 'team', 'employee.update': 'team',
    'orgunit.read': 'unit',
    'position.read': 'unit',
    'attendance.read': 'team',
    'leave.read': 'team', 'leave.approve': 'team',
  },

  payroll_officer: {
    'employee.read': 'all',
    'attendance.read': 'all', 'attendance.export': 'all',
    'leave.read': 'all',
    'payroll.read': 'all', 'payroll.run': 'all', 'payroll.approve': 'all', 'payroll.export': 'all',
    'settings.read': 'all',
  },

  ir_officer: {
    'employee.read': 'all',
    'orgunit.read': 'all',
    'position.read': 'all',
    'attendance.read': 'all',
    'leave.read': 'all',
  },

  employee: {
    'employee.read': 'self',
    'attendance.read': 'self',
    'leave.read': 'self', 'leave.create': 'self',
  },

  viewer: {
    'employee.read': 'all',
    'orgunit.read': 'all',
    'position.read': 'all',
    'attendance.read': 'all',
    'leave.read': 'all',
  },
};

module.exports = {
  SCOPES,
  SCOPE_RANK,
  RESOURCE_ACTIONS,
  PERMISSIONS,
  PERMISSION_SET,
  isValidPermission,
  isValidScope,
  ROLE_PERMISSIONS,
};