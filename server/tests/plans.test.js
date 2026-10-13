const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveEntitlements, getPlan, isValidPlan, CORE_MODULES, planHasModule, planHasFeature } = require('../config/plans');

test('plan tiers nest: starter ⊂ professional ⊂ enterprise (modules)', () => {
  const s = new Set(resolveEntitlements({ plan: 'starter' }).modules);
  const p = new Set(resolveEntitlements({ plan: 'professional' }).modules);
  const e = new Set(resolveEntitlements({ plan: 'enterprise' }).modules);
  for (const m of s) assert.ok(p.has(m), `professional missing starter module ${m}`);
  for (const m of p) assert.ok(e.has(m), `enterprise missing professional module ${m}`);
});

test('seat limits: starter 25, professional 200, enterprise unlimited', () => {
  assert.equal(resolveEntitlements({ plan: 'starter' }).seatLimit, 25);
  assert.equal(resolveEntitlements({ plan: 'professional' }).seatLimit, 200);
  assert.equal(resolveEntitlements({ plan: 'enterprise' }).seatLimit, null);
});

test('payroll/analytics are NOT in starter but ARE in professional', () => {
  assert.equal(planHasModule({ plan: 'starter' }, 'payroll'), false);
  assert.equal(planHasModule({ plan: 'professional' }, 'payroll'), true);
  assert.equal(planHasModule({ plan: 'starter' }, 'analytics'), false);
});

test('workforce_intelligence + external_api are enterprise-only features', () => {
  assert.equal(planHasFeature({ plan: 'professional' }, 'workforce_intelligence'), false);
  assert.equal(planHasFeature({ plan: 'enterprise' }, 'workforce_intelligence'), true);
  assert.equal(planHasFeature({ plan: 'enterprise' }, 'external_api'), true);
});

test('per-tenant override can unlock a module above the plan', () => {
  const ent = resolveEntitlements({ plan: 'starter', featureFlags: { enable: ['payroll'], disable: [] } });
  assert.ok(ent.modules.includes('payroll'));
});

test('core modules can NEVER be disabled by an override', () => {
  const ent = resolveEntitlements({ plan: 'starter', featureFlags: { enable: [], disable: CORE_MODULES } });
  for (const m of CORE_MODULES) assert.ok(ent.modules.includes(m), `core module ${m} was wrongly removed`);
});

test('unknown override keys are ignored (no crash, no bogus grant)', () => {
  const ent = resolveEntitlements({ plan: 'starter', featureFlags: { enable: ['not_a_real_module'], disable: ['also_fake'] } });
  assert.ok(!ent.modules.includes('not_a_real_module'));
  assert.ok(!ent.features.includes('also_fake'));
});

test('unknown / missing plan falls back to starter (fail-closed)', () => {
  assert.equal(getPlan('nonsense').key, 'starter');
  assert.equal(getPlan(undefined).key, 'starter');
  assert.equal(isValidPlan('enterprise'), true);
  assert.equal(isValidPlan('nope'), false);
});
