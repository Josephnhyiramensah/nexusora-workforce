const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const env = require('../../config/env');
const { getMasterConnection } = require('../../config/db');
const { provisionTenant } = require('../../services/provisioning.service');
const subscription = require('../../services/subscription.service');
const { startTrial, trialDaysLeft } = subscription;
const { MODULES, FEATURES, isValidPlan } = require('../../config/plans');
const billing = require('../../config/billing');
const emailSvc = require('../../services/email.service');
const pricing = require('../../services/pricing.service');
const fx = require('../../services/fx.service');
const paystack = require('../../services/payments/paystack.service');
const { clearTenantCache } = require('../../middleware/tenant');
const { issueEmailVerification } = require('../auth/auth.controller');

const round2 = fx.round2;
async function nextInvoiceNumber(Invoice) {
  const year = new Date().getFullYear();
  const count = await Invoice.countDocuments({});
  return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
}

// GET /api/billing/plans?currency=USD — public catalog. Prices are DB-backed and
// converted into the requested currency (falls back to the base currency).
const listPlans = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const currency = req.query.currency ? String(req.query.currency).toUpperCase() : billing.PRICING_BASE_CURRENCY;
  const plans = await pricing.catalog(master, currency);
  res.json({
    plans,
    moduleLabels: MODULES,
    featureLabels: FEATURES,
    baseCurrency: billing.PRICING_BASE_CURRENCY,
    trialDays: billing.TRIAL_DAYS,
    // false until an admin sets non-zero prices — the client hides amounts then.
    pricesConfigured: plans.some((p) => Number(p.price) > 0),
  });
});

// GET /api/billing/availability?subdomain=acme — is this workspace name free?
const checkAvailability = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const sub = String(req.query.subdomain || '').toLowerCase().trim();
  if (!/^[a-z0-9-]{2,}$/.test(sub)) return res.json({ subdomain: sub, available: false, reason: 'invalid' });
  const exists = await master.model('Tenant').findOne({ subdomain: sub }).select('_id').lean();
  res.json({ subdomain: sub, available: !exists });
});

// POST /api/billing/register — public self-serve signup. Creates the tenant on a
// free trial, provisions its super_admin, and sends welcome + verification email.
const registerCompany = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { company, subdomain, countryCode, baseCurrency, defaultLocale, enabledLocales, plan, admin } = req.body;
  const r = await provisionTenant(master, {
    name: company, subdomain, countryCode, baseCurrency, defaultLocale, enabledLocales, plan,
    admin,
    subscription: startTrial(),
    adminEmailVerified: false,     // self-signup must verify their email
  });
  if (!r.ok) return res.status(r.status).json({ message: r.message });
  const { tenant, adminUser } = r;
  res.status(201).json({
    ok: true,
    tenant: {
      name: tenant.name, subdomain: tenant.subdomain, plan: tenant.plan,
      status: tenant.status, trialEndsAt: tenant.trialEndsAt,
    },
    trialDaysLeft: trialDaysLeft(tenant),
    message: 'Workspace created. Check your email to verify your address, then sign in.',
  });
  // Fire-and-forget welcome + verification (never blocks; skips if SMTP off).
  emailSvc.sendWelcome({ to: adminUser.email, name: adminUser.name, tenant })
    .catch((e) => console.error('[email] welcome failed:', e && e.message));
  issueEmailVerification(adminUser, tenant)
    .catch((e) => console.error('[email] verification failed:', e && e.message));
});

// GET /api/billing/subscription — the signed-in tenant's subscription summary.
const getSubscription = asyncHandler(async (req, res) => {
  const t = req.tenant;
  res.json({
    plan: t.plan,
    pendingPlan: t.pendingPlan || null,
    status: t.status || 'active',
    trialEndsAt: t.trialEndsAt || null,
    trialDaysLeft: trialDaysLeft(t),
    currentPeriodEnd: t.currentPeriodEnd || null,
    graceEndsAt: t.graceEndsAt || null,
    seatLimit: subscription.seatLimit(t),
    seatsPurchased: t.seatsPurchased || 0,
    baseCurrency: t.baseCurrency,
    tax: t.tax || { rate: 0, label: 'Tax' },
    paymentsEnabled: paystack.isConfigured(),
  });
});

// GET /api/billing/invoices — this tenant's invoices (newest first).
const listInvoices = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const Invoice = master.model('Invoice');
  const items = await Invoice.find({ subdomain: req.tenant.subdomain }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items });
});

// POST /api/billing/checkout — start a Paystack payment for a plan. Raises an
// open invoice, applies the tenant's configured tax, picks a chargeable
// currency, and returns the Paystack authorization URL.
const startCheckout = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  if (!paystack.isConfigured()) {
    return res.status(503).json({ message: 'Payments are not configured yet. Add your Paystack keys to enable checkout.' });
  }
  const Tenant = master.model('Tenant');
  const Invoice = master.model('Invoice');
  const tenant = await Tenant.findById(req.tenant._id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  const plan = isValidPlan(req.body.plan) ? req.body.plan : tenant.plan;
  const price = await pricing.priceFor(master, plan, tenant.baseCurrency);
  if (!price || Number(price.amount) <= 0) {
    return res.status(400).json({ message: 'This plan has no price set yet. Set it in the admin console first.' });
  }
  const billingCurrency = price.currency;                 // tenant currency (or base fallback)
  const seats = Math.max(0, Number(req.body.seats) || tenant.seatsPurchased || 0);
  const seatCost = round2((Number(price.seatAmount) || 0) * seats);
  const subtotal = round2(Number(price.amount) + seatCost);
  const taxRate = Number(tenant.tax && tenant.tax.rate) || 0;
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);

  const items = [{ label: `${plan} plan (${price.interval || 'month'})`, qty: 1, unitAmount: Number(price.amount), amount: Number(price.amount) }];
  if (seatCost > 0) items.push({ label: `${seats} seats`, qty: seats, unitAmount: Number(price.seatAmount), amount: seatCost });

  const number = await nextInvoiceNumber(Invoice);
  const reference = `${number}-${crypto.randomBytes(4).toString('hex')}`;
  const invoice = await Invoice.create({
    number, tenant: tenant._id, subdomain: tenant.subdomain, plan,
    interval: price.interval || 'month',
    currency: billingCurrency, items, subtotal, taxRate, tax, total,
    status: 'open', provider: 'paystack', providerRef: reference,
    dueDate: new Date(Date.now() + 7 * 86400000),
  });

  // Charge in a Paystack-supported currency (convert if the tenant's isn't).
  const chargeCur = paystack.chargeableCurrency(billingCurrency);
  let chargeTotal = total;
  if (chargeCur !== billingCurrency) {
    const c = await fx.convert(total, billingCurrency, chargeCur);
    if (!c.converted) {
      // Refuse rather than charge the wrong amount in the wrong currency.
      invoice.status = 'void'; await invoice.save();
      return res.status(503).json({ message: 'Exchange rate unavailable right now — please try again shortly.' });
    }
    chargeTotal = c.amount;
  }

  const init = await paystack.initializeTransaction({
    email: tenant.billingEmail || req.body.email,
    amountMajor: chargeTotal, currency: chargeCur, reference,
    metadata: { subdomain: tenant.subdomain, plan, invoice: number },
    callbackUrl: `${env.APP_URL.replace(/\/+$/, '')}/settings?tab=billing&ref=${encodeURIComponent(reference)}`,
    channels: ['card', 'mobile_money'],
  });
  if (!init.ok) {
    invoice.status = 'void';
    await invoice.save();
    return res.status(502).json({ message: `Could not start payment: ${init.error}` });
  }
  res.json({
    authorizationUrl: init.authorizationUrl,
    reference,
    invoice: { number, total, currency: billingCurrency, chargeCurrency: chargeCur, chargeTotal },
  });
});

// POST /api/billing/change-plan { plan } — upgrade (prorated charge now) or
// downgrade (scheduled for period end). Free + immediate during a trial.
const changePlan = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const Tenant = master.model('Tenant');
  const Invoice = master.model('Invoice');
  const tenant = await Tenant.findById(req.tenant._id);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  const target = req.body.plan;
  if (!isValidPlan(target)) return res.status(400).json({ message: 'Unknown plan' });
  if (target === tenant.plan && !tenant.pendingPlan) return res.status(400).json({ message: 'You are already on this plan.' });

  // During a trial, switching is free and immediate.
  if (tenant.status === 'trial') {
    tenant.plan = target; tenant.pendingPlan = undefined;
    await tenant.save(); clearTenantCache(tenant.subdomain);
    return res.json({ changed: true, plan: target, effective: 'now', message: `Switched to the ${target} plan for your trial.` });
  }

  const [cur, nxt] = await Promise.all([
    pricing.priceFor(master, tenant.plan, tenant.baseCurrency),
    pricing.priceFor(master, target, tenant.baseCurrency),
  ]);
  const curPrice = cur ? Number(cur.amount) : 0;
  const nxtPrice = nxt ? Number(nxt.amount) : 0;

  // Fraction of the current paid period still remaining.
  let remaining = 1;
  if (tenant.currentPeriodStart && tenant.currentPeriodEnd) {
    const span = new Date(tenant.currentPeriodEnd) - new Date(tenant.currentPeriodStart);
    const left = new Date(tenant.currentPeriodEnd) - Date.now();
    remaining = span > 0 ? Math.max(0, Math.min(1, left / span)) : 0;
  }

  // Downgrade (or same/cheaper): schedule for the end of the paid period.
  if (nxtPrice <= curPrice) {
    tenant.pendingPlan = target;
    await tenant.save(); clearTenantCache(tenant.subdomain);
    const when = tenant.currentPeriodEnd ? new Date(tenant.currentPeriodEnd).toLocaleDateString() : 'the next renewal';
    return res.json({ changed: true, plan: tenant.plan, pendingPlan: target, effective: 'period_end',
      message: `Your plan will change to ${target} on ${when}. You keep your current features until then.` });
  }

  // Upgrade: charge the prorated difference now.
  if (!paystack.isConfigured()) return res.status(503).json({ message: 'Payments are not configured yet. Add your Paystack keys to enable upgrades.' });
  const billingCurrency = nxt.currency;
  const delta = round2((nxtPrice - curPrice) * remaining);
  if (delta <= 0) {
    tenant.plan = target; tenant.pendingPlan = undefined;
    await tenant.save(); clearTenantCache(tenant.subdomain);
    return res.json({ changed: true, plan: target, effective: 'now' });
  }
  const taxRate = Number(tenant.tax && tenant.tax.rate) || 0;
  const tax = round2(delta * taxRate);
  const total = round2(delta + tax);
  const number = await nextInvoiceNumber(Invoice);
  const reference = `${number}-${crypto.randomBytes(4).toString('hex')}`;
  await Invoice.create({
    number, tenant: tenant._id, subdomain: tenant.subdomain, plan: target, kind: 'proration',
    interval: nxt.interval || 'month', currency: billingCurrency,
    items: [{ label: `Upgrade to ${target} (prorated ${Math.round(remaining * 100)}% of period)`, qty: 1, unitAmount: delta, amount: delta }],
    subtotal: delta, taxRate, tax, total, status: 'open', provider: 'paystack', providerRef: reference,
    dueDate: new Date(Date.now() + 7 * 86400000),
  });
  const chargeCur = paystack.chargeableCurrency(billingCurrency);
  let chargeTotal = total;
  if (chargeCur !== billingCurrency) {
    const c = await fx.convert(total, billingCurrency, chargeCur);
    if (!c.converted) { await Invoice.updateOne({ providerRef: reference }, { $set: { status: 'void' } }); return res.status(503).json({ message: 'Exchange rate unavailable right now — please try again shortly.' }); }
    chargeTotal = c.amount;
  }
  const init = await paystack.initializeTransaction({
    email: tenant.billingEmail, amountMajor: chargeTotal, currency: chargeCur, reference,
    metadata: { subdomain: tenant.subdomain, plan: target, invoice: number, kind: 'proration' },
    callbackUrl: `${env.APP_URL.replace(/\/+$/, '')}/settings?tab=billing&ref=${encodeURIComponent(reference)}`,
    channels: ['card', 'mobile_money'],
  });
  if (!init.ok) {
    await Invoice.updateOne({ providerRef: reference }, { $set: { status: 'void' } });
    return res.status(502).json({ message: `Could not start payment: ${init.error}` });
  }
  res.json({ changed: false, requiresPayment: true, authorizationUrl: init.authorizationUrl, reference,
    prorated: { amount: delta, total, currency: billingCurrency, remainingPct: Math.round(remaining * 100) } });
});

// Process a successful charge: mark the invoice paid, start the paid period,
// and email a receipt. Idempotent (skips an already-paid invoice).
async function processChargeSuccess(reference, channel) {
  const master = getMasterConnection();
  if (!master) return;
  const Invoice = master.model('Invoice');
  const Tenant = master.model('Tenant');
  const invoice = await Invoice.findOne({ providerRef: reference });
  if (!invoice || invoice.status === 'paid') return;
  // Double-check with Paystack when reachable; trust the signed webhook otherwise.
  const v = await paystack.verifyTransaction(reference);
  if (v.ok && v.status && v.status !== 'success') return;

  invoice.status = 'paid';
  invoice.paidAt = new Date();
  invoice.paymentMethod = channel || (v.ok ? v.channel : undefined);
  await invoice.save();

  const tenant = await Tenant.findById(invoice.tenant);
  if (!tenant) return;
  const months = invoice.interval === 'year' ? 12 : 1;
  // A proration top-up keeps the existing period; a subscription charge (re)starts it.
  if (invoice.kind !== 'proration') Object.assign(tenant, subscription.beginPaidPeriod(new Date(), months));
  else tenant.status = 'active';
  // Apply the paid plan, and clear any scheduled downgrade it fulfils.
  if (invoice.plan) tenant.plan = invoice.plan;
  if (tenant.pendingPlan && tenant.pendingPlan === invoice.plan) { tenant.pendingPlan = undefined; }
  await tenant.save();
  clearTenantCache(tenant.subdomain);

  emailSvc.sendInvoice({
    to: tenant.billingEmail, tenant,
    invoice: {
      number: invoice.number, status: 'paid', currency: invoice.currency, total: invoice.total,
      items: invoice.items.map((i) => ({ label: i.label, amount: i.amount })),
      periodLabel: new Date().toLocaleDateString(),
    },
  }).catch((e) => console.error('[email] receipt failed:', e && e.message));
}

// POST /api/billing/webhook — Paystack events (public; HMAC-verified via rawBody).
const webhook = (req, res) => {
  const sig = req.headers['x-paystack-signature'];
  if (!paystack.verifyWebhookSignature(req.rawBody, sig)) {
    return res.status(401).send('invalid signature');
  }
  res.sendStatus(200);   // acknowledge fast; process out of band
  const event = req.body || {};
  if (event.event === 'charge.success' && event.data && event.data.reference) {
    processChargeSuccess(event.data.reference, event.data.channel).catch((e) => console.error('[billing] webhook:', e && e.message));
  }
};

module.exports = {
  listPlans, checkAvailability, registerCompany,
  getSubscription, listInvoices, startCheckout, changePlan, webhook,
};
