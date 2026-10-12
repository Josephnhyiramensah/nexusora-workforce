// Platform-level currency conversion for billing (A2). Plan prices are entered
// in one base currency and converted to a tenant's currency on the fly, so
// nothing is tied to a single nation's currency.
//
// Uses the same free feed as the tenant FX module (open.er-api.com), cached in
// memory with a 12h TTL. Fully graceful: if the feed is unreachable it serves a
// stale cache, and if there's nothing cached it reports converted:false so the
// caller can fall back to the base currency rather than invent a number.
const FRESH_MS = 12 * 60 * 60 * 1000;
const cache = new Map();   // base -> { rates, asOf }

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

async function ratesFor(base) {
  const key = String(base).toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.asOf < FRESH_MS) return hit.rates;
  if (typeof fetch === 'function') {
    try {
      const resp = await fetch(`https://open.er-api.com/v6/latest/${key}`);
      const data = await resp.json();
      if (data && data.result === 'success' && data.rates) {
        cache.set(key, { rates: data.rates, asOf: Date.now() });
        return data.rates;
      }
    } catch { /* fall through to stale cache */ }
  }
  return hit ? hit.rates : null;
}

// convert(amount, from, to) -> { amount, currency, rate, converted }.
// converted:false means no rate was available — amount/currency are returned
// unchanged (in `from`) so the caller can bill in the base currency instead.
async function convert(amount, from, to) {
  const f = String(from).toUpperCase();
  const t = String(to).toUpperCase();
  const amt = Number(amount) || 0;
  if (f === t || amt === 0) return { amount: round2(amt), currency: t, rate: 1, converted: true };
  const rates = await ratesFor(f);
  const rate = rates && typeof rates[t] === 'number' ? rates[t] : null;
  if (rate == null) return { amount: round2(amt), currency: f, rate: null, converted: false };
  return { amount: round2(amt * rate), currency: t, rate, converted: true };
}

module.exports = { convert, ratesFor, round2 };
