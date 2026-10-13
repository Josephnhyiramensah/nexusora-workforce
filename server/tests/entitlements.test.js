const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireModule, requireFeature, requireActiveSubscription, attachEntitlements } = require('../middleware/entitlements');

// Minimal res/next doubles.
function mk() {
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  let nexted = false;
  const next = () => { nexted = true; };
  return { res, next, nexted: () => nexted };
}

test('requireModule: blocks a plan that lacks the module (403 upgrade), allows one that has it', () => {
  let m = mk();
  requireModule('payroll')({ tenant: { plan: 'starter' } }, m.res, m.next);
  assert.equal(m.res.code, 403);
  assert.equal(m.res.body.code, 'plan_upgrade_required');
  assert.equal(m.nexted(), false);

  m = mk();
  requireModule('payroll')({ tenant: { plan: 'professional' } }, m.res, m.next);
  assert.equal(m.nexted(), true);
});

test('requireFeature: enterprise feature blocked for professional, allowed for enterprise', () => {
  let m = mk();
  requireFeature('workforce_intelligence')({ tenant: { plan: 'professional' } }, m.res, m.next);
  assert.equal(m.res.code, 403);
  assert.equal(m.nexted(), false);

  m = mk();
  requireFeature('workforce_intelligence')({ tenant: { plan: 'enterprise' } }, m.res, m.next);
  assert.equal(m.nexted(), true);
});

test('requireActiveSubscription: active/trial/grace pass; expired/suspended refused 402', () => {
  for (const s of ['active', 'trial', 'grace', 'past_due']) {
    const m = mk();
    requireActiveSubscription({ tenant: { status: s } }, m.res, m.next);
    assert.equal(m.nexted(), true, `${s} should pass`);
  }
  for (const s of ['expired', 'suspended']) {
    const m = mk();
    requireActiveSubscription({ tenant: { status: s } }, m.res, m.next);
    assert.equal(m.res.code, 402, `${s} should be 402`);
    assert.equal(m.res.body.code, 'subscription_inactive');
    assert.equal(m.nexted(), false);
  }
});

test('attachEntitlements populates req.entitlements', () => {
  const req = { tenant: { plan: 'professional' } };
  const m = mk();
  attachEntitlements(req, m.res, m.next);
  assert.ok(Array.isArray(req.entitlements.modules));
  assert.ok(req.entitlements.modules.includes('payroll'));
  assert.equal(m.nexted(), true);
});
