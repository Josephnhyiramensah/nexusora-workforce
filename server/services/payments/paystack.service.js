// Paystack adapter (A2). Thin wrapper over the Paystack REST API + webhook
// signature verification. Keys come from env (reuse the Nexusora Books account)
// — never hardcoded. Supports cards and Mobile Money via the `channels` param.
//
// Amounts are passed to Paystack in the currency SUBUNIT (pesewa/kobo/cent),
// i.e. major * 100 for the 2-decimal currencies we charge in.
const crypto = require('crypto');
const billing = require('../../config/billing');

const API = 'https://api.paystack.co';

const isConfigured = () => Boolean(billing.PAYSTACK_SECRET_KEY);

function authHeaders() {
  return { Authorization: `Bearer ${billing.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' };
}

// Pick the currency to actually charge in: the requested one if Paystack can
// charge it for this account, otherwise the configured fallback.
function chargeableCurrency(currency) {
  const c = String(currency || '').toUpperCase();
  return billing.PAYSTACK_CHARGE_CURRENCIES.includes(c) ? c : billing.PAYSTACK_FALLBACK_CURRENCY;
}

// Initialize a transaction. Returns { ok, authorizationUrl, accessCode, reference }
// or { ok:false, error }. Never throws.
async function initializeTransaction({ email, amountMajor, currency, reference, metadata, callbackUrl, channels }) {
  if (!isConfigured()) return { ok: false, error: 'Paystack not configured' };
  if (typeof fetch !== 'function') return { ok: false, error: 'fetch unavailable (Node < 18)' };
  try {
    const body = {
      email,
      amount: Math.round(Number(amountMajor) * 100),   // subunit
      currency: String(currency).toUpperCase(),
      reference,
      metadata: metadata || {},
      channels: channels || ['card', 'mobile_money'],
      callback_url: callbackUrl,
    };
    const resp = await fetch(`${API}/transaction/initialize`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    const data = await resp.json();
    if (!data || !data.status) return { ok: false, error: (data && data.message) || 'Paystack init failed' };
    return { ok: true, authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code, reference: data.data.reference };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Verify a transaction by reference (used after redirect, and to double-check a
// webhook). Returns { ok, status, amountMajor, currency, channel, paidAt, raw }.
async function verifyTransaction(reference) {
  if (!isConfigured()) return { ok: false, error: 'Paystack not configured' };
  if (typeof fetch !== 'function') return { ok: false, error: 'fetch unavailable' };
  try {
    const resp = await fetch(`${API}/transaction/verify/${encodeURIComponent(reference)}`, { headers: authHeaders() });
    const data = await resp.json();
    if (!data || !data.status) return { ok: false, error: (data && data.message) || 'verify failed' };
    const d = data.data;
    return {
      ok: true, status: d.status, amountMajor: Number(d.amount) / 100, currency: d.currency,
      channel: d.channel, paidAt: d.paid_at, raw: d,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Verify the x-paystack-signature header: HMAC-SHA512 of the raw body with the
// secret key. `rawBody` must be the exact bytes Paystack sent.
function verifyWebhookSignature(rawBody, signature) {
  if (!isConfigured() || !signature || !rawBody) return false;
  const hash = crypto.createHmac('sha512', billing.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

module.exports = { isConfigured, chargeableCurrency, initializeTransaction, verifyTransaction, verifyWebhookSignature };
