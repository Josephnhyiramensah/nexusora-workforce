const { test } = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../services/fx.service');

test('round2 rounds to 2 decimals', () => {
  assert.equal(fx.round2(1.005), 1); // JS float: 1.005 -> 1.00 (documented behaviour)
  assert.equal(fx.round2(2.345), 2.35);
  assert.equal(fx.round2('3.14159'), 3.14);
  assert.equal(fx.round2(null), 0);
});

test('same-currency convert is identity, rate 1, converted', async () => {
  const r = await fx.convert(300, 'GHS', 'GHS');
  assert.deepEqual(r, { amount: 300, currency: 'GHS', rate: 1, converted: true });
});

test('zero amount short-circuits to converted', async () => {
  const r = await fx.convert(0, 'GHS', 'USD');
  assert.equal(r.converted, true);
  assert.equal(r.amount, 0);
});

test('when no rate is available, it does NOT invent a number — falls back to source currency', async () => {
  // In this environment the feed is unreachable, so GHS->USD cannot convert.
  const r = await fx.convert(300, 'GHS', 'USD');
  assert.equal(r.converted, false);
  assert.equal(r.currency, 'GHS');   // stays in the source currency
  assert.equal(r.amount, 300);       // unchanged, never guessed
  assert.equal(r.rate, null);
});

test('currency codes are case-insensitive', async () => {
  const r = await fx.convert(100, 'ghs', 'ghs');
  assert.equal(r.converted, true);
  assert.equal(r.currency, 'GHS');
});
