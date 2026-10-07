// Foreign-exchange rates for the per-user display-currency feature.
//
// Convention (matches client CurrencyContext.convert): rate = units of
// `currency` per 1 unit of `base`, so the response rates[X] = X per 1 base.
//
// GET /fx/rates auto-refreshes live rates when they are stale (>12h), so the
// display-currency switch works out of the box. Manual admin rates always win.
// Every external call is guarded — if the feed is unavailable the endpoint
// still returns 200 with whatever is known (at minimum base = 1), so it never
// 404s or breaks page load.
const asyncHandler = require('express-async-handler');
const { CURRENCIES } = require('../../config/currencies');

const SUPPORTED = CURRENCIES.map((c) => c.code);
const FRESH_MS = 12 * 60 * 60 * 1000; // 12 hours

const baseOf = (req) => String(req.query.base || req.tenant?.baseCurrency || 'USD').toUpperCase();

// Pull live rates from the free open.er-api.com feed and cache them. Returns
// the number of rows stored. Safe: any failure returns 0 and stores nothing.
async function refreshLive(ExchangeRate, base) {
  if (typeof fetch !== 'function') return 0; // Node < 18 without global fetch
  try {
    const resp = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await resp.json();
    if (!data || data.result !== 'success' || !data.rates) return 0;
    const asOf = new Date();
    const docs = SUPPORTED
      .filter((cur) => cur !== base && typeof data.rates[cur] === 'number')
      .map((cur) => ({ base, currency: cur, rate: data.rates[cur], source: 'live', asOf }));
    if (!docs.length) return 0;
    await ExchangeRate.deleteMany({ base, source: 'live' }); // keep only the latest snapshot
    await ExchangeRate.insertMany(docs);
    return docs.length;
  } catch {
    return 0;
  }
}

// GET /fx/rates?base=XXX
const getRates = asyncHandler(async (req, res) => {
  const base = baseOf(req);
  const ExchangeRate = req.tenantConn.model('ExchangeRate');

  // Refresh live rates if the newest live snapshot is stale or missing.
  let newestLive = await ExchangeRate.findOne({ base, source: 'live' }).sort({ asOf: -1 }).lean();
  const stale = !newestLive || (Date.now() - new Date(newestLive.asOf).getTime() > FRESH_MS);
  if (stale) {
    const n = await refreshLive(ExchangeRate, base);
    if (n) newestLive = await ExchangeRate.findOne({ base, source: 'live' }).sort({ asOf: -1 }).lean();
  }

  // Build the rate map, manual winning over live.
  const rows = await ExchangeRate.find({ base }).sort({ asOf: -1 }).lean();
  const manual = {}; const live = {};
  for (const r of rows) {
    if (r.source === 'manual') { if (manual[r.currency] === undefined) manual[r.currency] = r.rate; }
    else if (live[r.currency] === undefined) live[r.currency] = r.rate;
  }
  const out = { [base]: 1 };
  for (const cur of SUPPORTED) {
    const r = manual[cur] !== undefined ? manual[cur] : live[cur];
    if (typeof r === 'number') out[cur] = r;
  }

  res.json({ base, rates: out, updatedAt: newestLive?.asOf || null });
});

// POST /fx/rates/manual  { currency, rate }  (admin) — rate = currency per 1 base.
const setManualRate = asyncHandler(async (req, res) => {
  const base = baseOf(req);
  const currency = String(req.body.currency || '').toUpperCase();
  const rate = Number(req.body.rate);
  if (!currency || !(rate > 0)) {
    return res.status(400).json({ success: false, message: 'currency and a positive rate are required.' });
  }
  const ExchangeRate = req.tenantConn.model('ExchangeRate');
  const doc = await ExchangeRate.create({ base, currency, rate, source: 'manual', asOf: new Date(), setBy: req.auth.userId });
  res.status(201).json({ success: true, data: doc });
});

// POST /fx/rates/fetch  (admin) — force a live refresh now.
const fetchLiveRates = asyncHandler(async (req, res) => {
  const base = baseOf(req);
  const ExchangeRate = req.tenantConn.model('ExchangeRate');
  const n = await refreshLive(ExchangeRate, base);
  if (!n) return res.status(502).json({ success: false, message: 'Live rate service unavailable. You can set rates manually.' });
  res.json({ success: true, message: `Fetched ${n} live rate(s) for ${base}.`, data: { fetched: n } });
});

module.exports = { getRates, setManualRate, fetchLiveRates };
