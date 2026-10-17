const { test } = require('node:test');
const assert = require('node:assert/strict');
const { needsEmailVerification } = require('../modules/auth/auth.controller');

const on = { enforce: true, smtpConfigured: true };

test('blocks an explicitly unverified account when enforcing + SMTP on', () => {
  assert.equal(needsEmailVerification({ emailVerified: false }, on), true);
});

test('allows verified accounts', () => {
  assert.equal(needsEmailVerification({ emailVerified: true }, on), false);
});

test('never blocks when SMTP is off (no way to send a link → no lockout)', () => {
  assert.equal(needsEmailVerification({ emailVerified: false }, { enforce: true, smtpConfigured: false }), false);
});

test('never blocks when enforcement is disabled', () => {
  assert.equal(needsEmailVerification({ emailVerified: false }, { enforce: false, smtpConfigured: true }), false);
});

test('legacy users without the field (undefined) are NOT blocked', () => {
  // Only an explicit `false` gates; undefined/null is grandfathered.
  assert.equal(needsEmailVerification({}, on), false);
  assert.equal(needsEmailVerification({ emailVerified: undefined }, on), false);
  assert.equal(needsEmailVerification(null, on), false);
});
