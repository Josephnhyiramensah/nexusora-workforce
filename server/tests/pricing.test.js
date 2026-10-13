const { test } = require('node:test');
const assert = require('node:assert/strict');
const { priceForCurrency } = require('../services/pricing.service');

const doc = (over = {}) => ({ plan: 'professional', baseCurrency: 'GHS', basePrice: 300, seatPrice: 10, interval: 'month', prices: {}, ...over });

test('same base currency returns the base price unconverted', async () => {
  const p = await priceForCurrency(doc(), 'GHS');
  assert.equal(p.amount, 300);
  assert.equal(p.currency, 'GHS');
  assert.equal(p.source, 'converted'); // base->base path still reports converted:true
  assert.equal(p.interval, 'month');
});

test('explicit per-currency override wins over conversion', async () => {
  const p = await priceForCurrency(doc({ prices: { USD: 20 } }), 'USD');
  assert.equal(p.amount, 20);
  assert.equal(p.currency, 'USD');
  assert.equal(p.source, 'override');
});

test('no override + feed down → bills in the base currency, never a guessed amount', async () => {
  const p = await priceForCurrency(doc(), 'USD'); // feed unreachable here
  assert.equal(p.source, 'base');
  assert.equal(p.currency, 'GHS');   // falls back to base currency, not a wrong USD number
  assert.equal(p.amount, 300);
});

test('zero base price stays zero (unpriced plan)', async () => {
  const p = await priceForCurrency(doc({ basePrice: 0, seatPrice: 0 }), 'GHS');
  assert.equal(p.amount, 0);
});
