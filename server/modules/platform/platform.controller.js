const asyncHandler = require('express-async-handler');
const env = require('../../config/env');
const { getMasterConnection } = require('../../config/db');
const { signToken } = require('../../utils/generateToken');
const { provisionTenant } = require('../../services/provisioning.service');

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

// POST /api/platform/tenants  (admin create — tenant is active immediately)
const createTenant = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const r = await provisionTenant(master, { ...req.body, subscription: { status: 'active' } });
  if (!r.ok) return res.status(r.status).json({ message: r.message });
  const { tenant } = r;
  res.status(201).json({
    tenant: { id: tenant._id, name: tenant.name, subdomain: tenant.subdomain, countryCode: tenant.countryCode, baseCurrency: tenant.baseCurrency, plan: tenant.plan },
    adminEmail: r.adminUser.email,
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
