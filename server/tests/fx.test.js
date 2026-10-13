const { test } = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../services/fx.service');

// Hermetic: never touch the real exchange-rate feed. We stub global fetch and
// use throwaway base codes so the module cache can't leak between cases.
const stub = (impl) => { globalThis.fetch = impl; };

test('round2 rounds to 2 decimals', () => {
  assert.equal(fx.round2(2.345), 2.35);
  assert.equal(fx.round2('3.14159'), 3.14);
  assert.equal(fx.round2(null), 0);
});

test('same-currency convert is identity, rate 1, converted (no network)', async () => {
  const r = await fx.convert(300, 'GHS', 'GHS');
  assert.deepEqual(r, { amount: 300, currency: 'GHS', rate: 1, converted: true });
});

test('zero amount short-circuits to converted (no network)', async () => {
  const r = await fx.convert(0, 'GHS', 'USD');
  assert.equal(r.converted, true);
  assert.equal(r.amount, 0);
});

test('converts when a rate is available', async () => {
  stub(async () => ({ json: async () => ({ result: 'success', rates: { USD: 0.065 } }) }));
  const r = await fx.convert(100, 'AAA', 'USD'); // fresh base 'AAA' -> stubbed rate
  assert.equal(r.converted, true);
  assert.equal(r.currency, 'USD');
  assert.equal(r.amount, fx.round2(100 * 0.065));
});

test('no rate available → does NOT invent a number, stays in source currency', async () => {
  stub(async () => { throw new Error('feed down'); });
  const r = await fx.convert(300, 'BBB', 'USD'); // fresh base 'BBB', feed throws
  assert.equal(r.converted, false);
  assert.equal(r.currency, 'BBB');
  assert.equal(r.amount, 300);
  assert.equal(r.rate, null);
});

test('currency codes are case-insensitive', async () => {
  const r = await fx.convert(100, 'ghs', 'ghs');
  assert.equal(r.converted, true);
  assert.equal(r.currency, 'GHS');
});
