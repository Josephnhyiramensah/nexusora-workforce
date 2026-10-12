// Plan pricing (A2). Reads the editable Pricing docs (master DB), converts a
// plan's base price into any currency via FX, and merges with the plan's
// entitlement structure for the catalog. No price is hardcoded here.
const { getPlan, PLAN_KEYS } = require('../config/plans');
const billing = require('../config/billing');
const fx = require('./fx.service');

// Ensure a Pricing doc exists for every plan (seeded at 0 = not yet priced).
async function ensurePricing(master) {
  const Pricing = master.model('Pricing');
  const existing = await Pricing.find().lean();
  const have = new Set(existing.map((d) => d.plan));
  const missing = PLAN_KEYS.filter((k) => !have.has(k)).map((k) => ({
    plan: k, baseCurrency: billing.PRICING_BASE_CURRENCY, basePrice: 0, seatPrice: 0, interval: 'month', prices: {},
  }));
  if (missing.length) await Pricing.insertMany(missing);
  return Pricing.find().lean();
}

// Compute the price of one Pricing doc in a target currency.
// source: 'override' (explicit per-currency), 'converted' (FX), 'base' (feed
// unavailable → billed in the base currency so we never invent a number).
async function priceForCurrency(doc, currency) {
  const target = String(currency || doc.baseCurrency).toUpperCase();
  const overrides = doc.prices || {};
  if (overrides[target] != null) {
    const seat = await fx.convert(doc.seatPrice, doc.baseCurrency, target);
    return { amount: Number(overrides[target]), seatAmount: seat.converted ? seat.amount : Number(doc.seatPrice || 0),
      currency: target, interval: doc.interval, source: 'override', converted: true };
  }
  const base = await fx.convert(doc.basePrice, doc.baseCurrency, target);
  if (!base.converted) {
    return { amount: Number(doc.basePrice || 0), seatAmount: Number(doc.seatPrice || 0),
      currency: doc.baseCurrency, interval: doc.interval, source: 'base', converted: false };
  }
  const seat = await fx.convert(doc.seatPrice, doc.baseCurrency, target);
  return { amount: base.amount, seatAmount: seat.converted ? seat.amount : 0,
    currency: target, interval: doc.interval, source: 'converted', rate: base.rate, converted: true };
}

// Full catalog: plan structure + computed price in `currency`.
async function catalog(master, currency) {
  const docs = await ensurePricing(master);
  const byPlan = Object.fromEntries(docs.map((d) => [d.plan, d]));
  const out = [];
  for (const key of PLAN_KEYS) {
    const p = getPlan(key);
    const doc = byPlan[key] || { plan: key, baseCurrency: billing.PRICING_BASE_CURRENCY, basePrice: 0, seatPrice: 0, interval: 'month', prices: {} };
    const price = await priceForCurrency(doc, currency || doc.baseCurrency);
    out.push({
      key: p.key, label: p.label, order: p.order, seatLimit: p.seatLimit,
      modules: p.modules, features: p.features,
      price: price.amount, seatPrice: price.seatAmount, currency: price.currency,
      interval: price.interval, priceSource: price.source,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

// One plan's price in a tenant's currency — used at checkout.
async function priceFor(master, plan, currency) {
  const docs = await ensurePricing(master);
  const doc = docs.find((d) => d.plan === plan);
  if (!doc) return null;
  return priceForCurrency(doc, currency);
}

module.exports = { ensurePricing, priceForCurrency, catalog, priceFor };
