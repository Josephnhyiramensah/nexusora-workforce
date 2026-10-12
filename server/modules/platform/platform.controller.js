const asyncHandler = require('express-async-handler');
const env = require('../../config/env');
const { getMasterConnection } = require('../../config/db');
const { signToken } = require('../../utils/generateToken');
const { provisionTenant } = require('../../services/provisioning.service');
const { clearTenantCache } = require('../../middleware/tenant');
const { isValidPlan } = require('../../config/plans');
const pricing = require('../../services/pricing.service');

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

// GET /api/platform/pricing — editable plan prices (seeds on first read).
const getPricing = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const docs = await pricing.ensurePricing(master);
  res.json({ pricing: docs });
});

// PUT /api/platform/pricing/:plan — edit a plan's price (admin console).
const updatePricing = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  if (!isValidPlan(req.params.plan)) return res.status(400).json({ message: 'Unknown plan' });
  const Pricing = master.model('Pricing');
  const allowed = ['baseCurrency', 'basePrice', 'seatPrice', 'interval', 'prices', 'active'];
  const update = { updatedAt: new Date() };
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
  if (update.baseCurrency) update.baseCurrency = String(update.baseCurrency).toUpperCase();
  const doc = await Pricing.findOneAndUpdate({ plan: req.params.plan }, { $set: update }, { new: true, upsert: true });
  res.json({ pricing: doc });
});

// PUT /api/platform/tenants/:id — admin edits a tenant's plan/billing/flags.
const updateTenant = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const Tenant = master.model('Tenant');
  const t = await Tenant.findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const b = req.body || {};
  if (b.plan !== undefined && isValidPlan(b.plan)) t.plan = b.plan;
  if (b.status !== undefined) t.status = b.status;
  if (b.seatsPurchased !== undefined) t.seatsPurchased = Number(b.seatsPurchased) || 0;
  if (b.billingEmail !== undefined) t.billingEmail = String(b.billingEmail).toLowerCase();
  if (b.tax !== undefined) t.tax = { rate: Number(b.tax.rate) || 0, label: b.tax.label || 'Tax' };
  if (b.featureFlags !== undefined) {
    t.featureFlags = {
      enable: Array.isArray(b.featureFlags.enable) ? b.featureFlags.enable : [],
      disable: Array.isArray(b.featureFlags.disable) ? b.featureFlags.disable : [],
    };
  }
  await t.save();
  clearTenantCache(t.subdomain);   // so entitlement/status changes take effect now
  res.json({ tenant: { id: t._id, name: t.name, subdomain: t.subdomain, plan: t.plan, status: t.status, seatsPurchased: t.seatsPurchased, tax: t.tax, featureFlags: t.featureFlags } });
});

module.exports = { platformLogin, createTenant, listTenants, getPricing, updatePricing, updateTenant };
