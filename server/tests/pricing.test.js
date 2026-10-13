const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../services/fx.service');
const { priceForCurrency } = require('../services/pricing.service');

const doc = (over = {}) => ({ plan: 'professional', baseCurrency: 'GHS', basePrice: 300, seatPrice: 10, interval: 'month', prices: {}, ...over });

// Hermetic: stub FX so pricing tests never hit the network. Default behaviour =
// same currency converts 1:1, cross-currency "feed down" (converted:false).
beforeEach(() => {
  fx.convert = async (amount, from, to) => (String(from).toUpperCase() === String(to).toUpperCase()
    ? { amount: Number(amount), currency: String(from).toUpperCase(), rate: 1, converted: true }
    : { amount: Number(amount), currency: String(from).toUpperCase(), rate: null, converted: false });
});

test('same base currency returns the base price unconverted', async () => {
  const p = await priceForCurrency(doc(), 'GHS');
  assert.equal(p.amount, 300);
  assert.equal(p.currency, 'GHS');
  assert.equal(p.source, 'converted');
  assert.equal(p.interval, 'month');
});

test('explicit per-currency override wins over conversion', async () => {
  const p = await priceForCurrency(doc({ prices: { USD: 20 } }), 'USD');
  assert.equal(p.amount, 20);
  assert.equal(p.currency, 'USD');
  assert.equal(p.source, 'override');
});

test('no override + feed down → bills in the base currency, never a guessed amount', async () => {
  const p = await priceForCurrency(doc(), 'USD'); // cross-currency, feed down
  assert.equal(p.source, 'base');
  assert.equal(p.currency, 'GHS');
  assert.equal(p.amount, 300);
});

test('converts to the target currency when a rate IS available', async () => {
  fx.convert = async (amount, from, to) => ({ amount: fx.round2(Number(amount) * 0.065), currency: String(to).toUpperCase(), rate: 0.065, converted: true });
  const p = await priceForCurrency(doc(), 'USD');
  assert.equal(p.source, 'converted');
  assert.equal(p.currency, 'USD');
  assert.equal(p.amount, fx.round2(300 * 0.065));
});

test('zero base price stays zero (unpriced plan)', async () => {
  const p = await priceForCurrency(doc({ basePrice: 0, seatPrice: 0 }), 'GHS');
  assert.equal(p.amount, 0);
});
