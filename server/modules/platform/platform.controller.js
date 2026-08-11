const asyncHandler = require('express-async-handler');
const env = require('../../config/env');
const { getMasterConnection, getTenantConnection } = require('../../config/db');
const { signToken } = require('../../utils/generateToken');
const { isSupportedCountry } = require('../../compliance/registry');
const { isSupportedCurrency } = require('../../config/currencies');
const { isSupportedLocale } = require('../../i18n/locales');

// POST /api/platform/login
const platformLogin = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { email, password } = req.body;
  const PlatformUser = master.model('PlatformUser');
  const user = await PlatformUser.findOne({ email: (email || '').toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password || ''))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken({ id: user._id, scope: 'platform', role: 'platform_admin' }, { secret: env.PLATFORM_ADMIN_SECRET });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
});

// POST /api/platform/tenants  (create + provision a tenant)
const createTenant = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { name, subdomain, countryCode, baseCurrency, defaultLocale, enabledLocales, plan, admin } = req.body;

  if (!name || !subdomain || !countryCode || !baseCurrency || !admin || !admin.email || !admin.password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  const sub = String(subdomain).toLowerCase().trim();
  if (!/^[a-z0-9-]+$/.test(sub)) return res.status(400).json({ message: 'Invalid subdomain (a-z, 0-9, - only)' });
  const cc = String(countryCode).toUpperCase();
  if (!isSupportedCountry(cc)) return res.status(400).json({ message: `No compliance pack for ${cc}` });
  const cur = String(baseCurrency).toUpperCase();
  if (!isSupportedCurrency(cur)) return res.status(400).json({ message: `Unsupported currency ${cur}` });
  const dloc = defaultLocale || 'en';
  const locales = (enabledLocales && enabledLocales.length) ? enabledLocales : [dloc];
  for (const l of locales) if (!isSupportedLocale(l)) return res.status(400).json({ message: `Unsupported locale ${l}` });

  const Tenant = master.model('Tenant');
  if (await Tenant.findOne({ subdomain: sub })) return res.status(409).json({ message: 'Subdomain already exists' });

  const dbName = `${env.TENANT_DB_PREFIX}${sub}`;
  const tenant = await Tenant.create({
    name, subdomain: sub, dbName, countryCode: cc, baseCurrency: cur,
    defaultLocale: dloc, enabledLocales: locales, plan: plan || 'starter', status: 'active',
  });

  // Provision the tenant DB: create its super_admin.
  const conn = await getTenantConnection(dbName);
  const User = conn.model('User');
  await User.create({
    name: admin.name || 'Administrator', email: admin.email.toLowerCase(),
    password: admin.password, role: 'super_admin', locale: dloc,
  });

  res.status(201).json({
    tenant: { id: tenant._id, name: tenant.name, subdomain: tenant.subdomain, countryCode: tenant.countryCode, baseCurrency: tenant.baseCurrency, plan: tenant.plan },
    adminEmail: admin.email.toLowerCase(),
  });
});

// GET /api/platform/tenants
const listTenants = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const Tenant = master.model('Tenant');
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  res.json(tenants.map((t) => ({
    id: t._id, name: t.name, subdomain: t.subdomain, countryCode: t.countryCode,
    baseCurrency: t.baseCurrency, plan: t.plan, status: t.status, createdAt: t.createdAt,
  })));
});

module.exports = { platformLogin, createTenant, listTenants };
