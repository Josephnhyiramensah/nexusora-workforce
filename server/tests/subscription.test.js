const { test } = require('node:test');
const assert = require('node:assert/strict');
const sub = require('../services/subscription.service');

const day = (n) => new Date(Date.now() + n * 86400000);

test('startTrial sets a trial with a future end date', () => {
  const t = sub.startTrial();
  assert.equal(t.status, 'trial');
  assert.ok(new Date(t.trialEndsAt) > new Date());
});

test('beginPaidPeriod: monthly vs annual period length + grace after end', () => {
  const now = new Date('2026-01-15T00:00:00Z');
  const m = sub.beginPaidPeriod(now, 1);
  assert.equal(m.status, 'active');
  assert.equal(new Date(m.currentPeriodEnd).toISOString().slice(0, 10), '2026-02-15');
  assert.ok(new Date(m.graceEndsAt) > new Date(m.currentPeriodEnd));
  const y = sub.beginPaidPeriod(now, 12);
  assert.equal(new Date(y.currentPeriodEnd).toISOString().slice(0, 10), '2027-01-15');
});

test('deriveStatus: suspended is sticky', () => {
  assert.equal(sub.deriveStatus({ status: 'suspended' }), 'suspended');
});

test('startFree: active with no dates → never expires', () => {
  const f = sub.startFree();
  assert.equal(f.status, 'active');
  assert.equal(f.trialEndsAt, undefined);
  assert.equal(f.currentPeriodEnd, undefined);
  // A free tenant with these fields stays active forever.
  assert.equal(sub.deriveStatus({ status: 'active' }), 'active');
  assert.equal(sub.trialDaysLeft(f), 0);
});

test('deriveStatus: trial → expired once trial end passes', () => {
  assert.equal(sub.deriveStatus({ status: 'trial', trialEndsAt: day(-1) }), 'expired');
  assert.equal(sub.deriveStatus({ status: 'trial', trialEndsAt: day(5) }), 'trial');
});

test('deriveStatus: active → grace within window, → expired past grace', () => {
  assert.equal(sub.deriveStatus({ status: 'active', currentPeriodEnd: day(-1), graceEndsAt: day(5) }), 'grace');
  assert.equal(sub.deriveStatus({ status: 'active', currentPeriodEnd: day(-10), graceEndsAt: day(-3) }), 'expired');
});

test('deriveStatus: active with no period dates stays active (admin-granted)', () => {
  assert.equal(sub.deriveStatus({ status: 'active' }), 'active');
});

test('isUsable: trial/active/grace/past_due usable; expired/suspended not', () => {
  for (const s of ['trial', 'active', 'grace', 'past_due']) assert.equal(sub.isUsable({ status: s }), true, s);
  for (const s of ['expired', 'suspended']) assert.equal(sub.isUsable({ status: s }), false, s);
});

test('seatLimit: purchased seats override the plan default; 0 = plan default', () => {
  assert.equal(sub.seatLimit({ plan: 'starter', seatsPurchased: 0 }), 25);
  assert.equal(sub.seatLimit({ plan: 'starter', seatsPurchased: 50 }), 50);
  assert.equal(sub.seatLimit({ plan: 'enterprise', seatsPurchased: 0 }), null); // unlimited
});

test('trialDaysLeft: 0 when no trial or already past', () => {
  assert.equal(sub.trialDaysLeft({}), 0);
  assert.equal(sub.trialDaysLeft({ trialEndsAt: day(-2) }), 0);
  assert.ok(sub.trialDaysLeft({ trialEndsAt: day(10) }) >= 9);
});
