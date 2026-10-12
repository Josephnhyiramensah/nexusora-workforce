// Shared tenant provisioning (A2). One code path for creating + provisioning a
// tenant, used by both the platform admin console (platform.createTenant) and
// public self-serve signup (billing.registerCompany). Returns a discriminated
// result so callers map errors to HTTP status without throwing.
const env = require('../config/env');
const { getTenantConnection } = require('../config/db');
const { isSupportedCountry } = require('../compliance/registry');
const { isSupportedCurrency } = require('../config/currencies');
const { isSupportedLocale } = require('../i18n/locales');
const { isValidPlan } = require('../config/plans');

function fail(status, message) { return { ok: false, status, message }; }

// opts: { name, subdomain, countryCode, baseCurrency, defaultLocale,
//   enabledLocales, plan, admin:{ name,email,password }, subscription, billingEmail,
//   adminEmailVerified }
// `subscription` is a plain object of extra Tenant fields (e.g. from
// subscription.service.startTrial()); defaults to an active status.
async function provisionTenant(master, opts = {}) {
  const { name, subdomain, countryCode, baseCurrency, defaultLocale, enabledLocales, plan, admin } = opts;

  if (!name || !subdomain || !countryCode || !baseCurrency || !admin || !admin.email || !admin.password) {
    return fail(400, 'Missing required fields');
  }
  const sub = String(subdomain).toLowerCase().trim();
  if (!/^[a-z0-9-]+$/.test(sub)) return fail(400, 'Invalid subdomain (a-z, 0-9, - only)');
  if (String(admin.password).length < 8) return fail(400, 'Admin password must be at least 8 characters');
  const cc = String(countryCode).toUpperCase();
  if (!isSupportedCountry(cc)) return fail(400, `No compliance pack for ${cc}`);
  const cur = String(baseCurrency).toUpperCase();
  if (!isSupportedCurrency(cur)) return fail(400, `Unsupported currency ${cur}`);
  const dloc = defaultLocale || 'en';
  const locales = (enabledLocales && enabledLocales.length) ? enabledLocales : [dloc];
  for (const l of locales) if (!isSupportedLocale(l)) return fail(400, `Unsupported locale ${l}`);
  const planKey = isValidPlan(plan) ? plan : 'starter';

  const Tenant = master.model('Tenant');
  if (await Tenant.findOne({ subdomain: sub })) return fail(409, 'Subdomain already exists');

  const dbName = `${env.TENANT_DB_PREFIX}${sub}`;
  const tenant = await Tenant.create({
    name, subdomain: sub, dbName, countryCode: cc, baseCurrency: cur,
    defaultLocale: dloc, enabledLocales: locales, plan: planKey,
    billingEmail: opts.billingEmail || admin.email.toLowerCase(),
    ...(opts.subscription || { status: 'active' }),
  });

  // Provision the tenant DB: create its super_admin.
  const conn = await getTenantConnection(dbName);
  const User = conn.model('User');
  const adminUser = await User.create({
    name: admin.name || 'Administrator', email: admin.email.toLowerCase(),
    password: admin.password, role: 'super_admin', locale: dloc,
    emailVerified: opts.adminEmailVerified !== undefined ? opts.adminEmailVerified : true,
  });

  return { ok: true, tenant, adminUser, conn };
}

module.exports = { provisionTenant };
