const { test } = require('node:test');
const assert = require('node:assert/strict');
const { can, scopeFor } = require('../utils/acl');
const { sanitizeOverrides } = require('../modules/auth/auth.controller');

test('role defaults: hr_officer cannot approve leave; hr_manager can', () => {
  assert.equal(can({ role: 'hr_officer' }, 'leave.approve'), false);
  assert.equal(can({ role: 'hr_manager' }, 'leave.approve'), true);
});

test('grant override adds a permission the role lacks', () => {
  const u = { role: 'hr_officer', permissionOverrides: [{ permission: 'leave.approve', effect: 'grant', scope: 'all' }] };
  assert.equal(can(u, 'leave.approve'), true);
  assert.equal(scopeFor(u, 'leave.approve'), 'all');
});

test('revoke override removes a role default', () => {
  const u = { role: 'line_manager', permissionOverrides: [{ permission: 'leave.approve', effect: 'revoke' }] };
  assert.equal(can(u, 'leave.approve'), false);  // line_manager has leave.approve:team by default
});

test('revoke wins over grant on the same permission', () => {
  const u = { role: 'hr_officer', permissionOverrides: [
    { permission: 'payroll.run', effect: 'grant', scope: 'all' },
    { permission: 'payroll.run', effect: 'revoke' },
  ] };
  assert.equal(can(u, 'payroll.run'), false);
});

test('resolver ignores malformed overrides (bad perm / bad scope)', () => {
  const u = { role: 'hr_officer', permissionOverrides: [
    { permission: 'not.real', effect: 'grant', scope: 'all' },
    { permission: 'leave.approve', effect: 'grant', scope: 'bogus' },
  ] };
  assert.equal(can(u, 'not.real'), false);
  assert.equal(can(u, 'leave.approve'), false);
});

test('super_admin has everything; unknown role denies all', () => {
  assert.equal(can({ role: 'super_admin' }, 'payroll.approve'), true);
  assert.equal(can({ role: 'nope' }, 'leave.read'), false);
});

test('sanitizeOverrides keeps well-formed entries and drops the rest', () => {
  const out = sanitizeOverrides([
    { permission: 'leave.approve', effect: 'grant', scope: 'team' },  // keep
    { permission: 'leave.approve', effect: 'grant' },                 // drop: grant needs a scope
    { permission: 'bad.perm', effect: 'grant', scope: 'all' },        // drop: invalid permission
    { permission: 'payroll.run', effect: 'revoke', scope: 'all' },    // keep (scope dropped on revoke)
    null,                                                             // drop
  ]);
  assert.deepEqual(out, [
    { permission: 'leave.approve', effect: 'grant', scope: 'team' },
    { permission: 'payroll.run', effect: 'revoke' },
  ]);
});
