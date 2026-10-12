const asyncHandler = require('express-async-handler');
const { getMasterConnection } = require('../../config/db');
const { provisionTenant } = require('../../services/provisioning.service');
const { startTrial, trialDaysLeft } = require('../../services/subscription.service');
const { MODULES, FEATURES } = require('../../config/plans');
const billing = require('../../config/billing');
const emailSvc = require('../../services/email.service');
const pricing = require('../../services/pricing.service');
const { issueEmailVerification } = require('../auth/auth.controller');

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

module.exports = { listPlans, checkAvailability, registerCompany };
