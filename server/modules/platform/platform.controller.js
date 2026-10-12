const asyncHandler = require('express-async-handler');
const env = require('../../config/env');
const { getMasterConnection, getTenantConnection, masterReady } = require('../../config/db');
const { signToken } = require('../../utils/generateToken');
const { provisionTenant } = require('../../services/provisioning.service');
const { clearTenantCache } = require('../../middleware/tenant');
const { isValidPlan } = require('../../config/plans');
const pricing = require('../../services/pricing.service');
const billing = require('../../config/billing');
const audit = require('../../services/audit.service');
const { trialDaysLeft, seatLimit } = require('../../services/subscription.service');
const paystack = require('../../services/payments/paystack.service');

// Record a platform-admin action to the master audit log (never throws).
async function logPlatform(master, req, action, meta) {
  audit.record(master, {
    actor: { id: String((req.platform && req.platform.id) || ''), type: 'platform', role: 'platform_admin' },
    action, method: req.method, path: (req.originalUrl || '').split('?')[0], statusCode: 200,
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip, meta: meta || {},
  }).catch(() => {});
}

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
  await logPlatform(master, req, 'pricing.update', { plan: req.params.plan, ...update });
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
  if (b.supportNote !== undefined) t.supportNote = String(b.supportNote);
  if (b.tax !== undefined) t.tax = { rate: Number(b.tax.rate) || 0, label: b.tax.label || 'Tax' };
  if (b.featureFlags !== undefined) {
    t.featureFlags = {
      enable: Array.isArray(b.featureFlags.enable) ? b.featureFlags.enable : [],
      disable: Array.isArray(b.featureFlags.disable) ? b.featureFlags.disable : [],
    };
  }
  await t.save();
  clearTenantCache(t.subdomain);   // so entitlement/status changes take effect now
  await logPlatform(master, req, 'tenant.update', { subdomain: t.subdomain, plan: t.plan, status: t.status });
  res.json({ tenant: { id: t._id, name: t.name, subdomain: t.subdomain, plan: t.plan, status: t.status, seatsPurchased: t.seatsPurchased, tax: t.tax, featureFlags: t.featureFlags } });
});

// GET /api/platform/tenants/:id — full detail incl. usage + recent invoices.
const getTenant = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const t = await master.model('Tenant').findById(req.params.id).lean();
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const usage = { users: null, employees: null };
  try {
    const conn = await getTenantConnection(t.dbName);
    usage.users = await conn.model('User').countDocuments({ isActive: true });
    usage.employees = await conn.model('Employee').countDocuments({});
  } catch (e) { /* tenant DB unreachable — leave counts null */ }
  const invoices = await master.model('Invoice').find({ subdomain: t.subdomain }).sort({ createdAt: -1 }).limit(20).lean();
  res.json({ tenant: t, usage, invoices, trialDaysLeft: trialDaysLeft(t), seatLimit: seatLimit(t) });
});

// POST /api/platform/tenants/:id/suspend  &  /unsuspend
const setSuspend = (suspend) => asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const t = await master.model('Tenant').findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  t.status = suspend ? 'suspended' : 'active';
  await t.save();
  clearTenantCache(t.subdomain);
  await logPlatform(master, req, suspend ? 'tenant.suspend' : 'tenant.unsuspend', { subdomain: t.subdomain });
  res.json({ id: t._id, subdomain: t.subdomain, status: t.status });
});

// DELETE /api/platform/tenants/:id — remove the registry entry. The tenant DB is
// left intact (data preserved); dropping it is a deliberate manual step.
const deleteTenant = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const t = await master.model('Tenant').findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const sub = t.subdomain;
  await t.deleteOne();
  clearTenantCache(sub);
  await logPlatform(master, req, 'tenant.delete', { subdomain: sub });
  res.json({ deleted: true, subdomain: sub, note: 'Registry entry removed. The tenant database was left intact.' });
});

// POST /api/platform/tenants/:id/impersonate — "login as". Issues a tenant
// session token for that tenant's super_admin (or a named user).
const impersonate = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const t = await master.model('Tenant').findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  let user;
  try {
    const conn = await getTenantConnection(t.dbName);
    const User = conn.model('User');
    user = req.body.userId
      ? await User.findById(req.body.userId)
      : await User.findOne({ role: 'super_admin', isActive: true }).sort({ createdAt: 1 });
  } catch (e) { return res.status(503).json({ message: 'Tenant database unreachable' }); }
  if (!user) return res.status(404).json({ message: 'No admin user to impersonate in this tenant' });
  const token = signToken({ userId: user._id, tenant: t.subdomain, role: user.role, permissions: user.permissions || [], impersonated: true });
  await logPlatform(master, req, 'tenant.impersonate', { subdomain: t.subdomain, userId: String(user._id) });
  res.json({ token, subdomain: t.subdomain, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

// GET /api/platform/metrics — overview for the console dashboard.
const metrics = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const Tenant = master.model('Tenant');
  const Invoice = master.model('Invoice');
  const tenants = await Tenant.find().select('name subdomain plan status createdAt').lean();
  const byStatus = {}; const byPlan = {};
  for (const t of tenants) { byStatus[t.status] = (byStatus[t.status] || 0) + 1; byPlan[t.plan] = (byPlan[t.plan] || 0) + 1; }
  const recent = [...tenants].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)
    .map((t) => ({ name: t.name, subdomain: t.subdomain, plan: t.plan, status: t.status, createdAt: t.createdAt }));

  const paid = await Invoice.find({ status: 'paid' }).select('total currency').lean();
  const paidByCurrency = {};
  for (const i of paid) paidByCurrency[i.currency] = Math.round(((paidByCurrency[i.currency] || 0) + Number(i.total || 0)) * 100) / 100;
  const openInvoices = await Invoice.countDocuments({ status: 'open' });

  // MRR estimate in the base currency from paying tenants' plan prices.
  const base = billing.PRICING_BASE_CURRENCY;
  const cat = await pricing.catalog(master, base);
  const planPrice = Object.fromEntries(cat.map((p) => [p.key, { price: Number(p.price) || 0, interval: p.interval }]));
  let mrr = 0;
  for (const t of tenants) {
    if (['active', 'grace', 'past_due'].includes(t.status)) {
      const pp = planPrice[t.plan];
      if (pp) mrr += pp.interval === 'year' ? pp.price / 12 : pp.price;
    }
  }
  res.json({
    tenants: { total: tenants.length, byStatus, byPlan, recent },
    billing: { paidInvoices: paid.length, paidTotalByCurrency: paidByCurrency, openInvoices, mrrEstimate: Math.round(mrr * 100) / 100, baseCurrency: base },
  });
});

// GET /api/platform/invoices — billing oversight across all tenants.
const listAllInvoices = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const filter = {};
  if (req.query.subdomain) filter.subdomain = String(req.query.subdomain).toLowerCase();
  if (req.query.status) filter.status = String(req.query.status);
  const items = await master.model('Invoice').find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ items });
});

// GET /api/platform/audit — platform-admin action log (master).
const platformAudit = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const AuditLog = master.model('AuditLog');
  const filter = { 'actor.type': 'platform' };
  if (req.query.action) filter.action = new RegExp('^' + String(req.query.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const items = await AuditLog.find(filter).sort({ at: -1 }).limit(limit).lean();
  res.json({ items });
});

// GET /api/platform/health — system health for the console.
const health = asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    masterDb: masterReady() ? 'connected' : 'down',
    node: process.version,
    env: env.NODE_ENV,
    paymentsEnabled: paystack.isConfigured(),
    time: new Date().toISOString(),
  });
});

// --------------------------------------------------------------------------- //
//  Tenant user management (reach into the tenant DB)
// --------------------------------------------------------------------------- //
async function tenantConnById(master, id) {
  const t = await master.model('Tenant').findById(id).lean();
  if (!t) return { error: 'Tenant not found', status: 404 };
  const conn = await getTenantConnection(t.dbName);
  return { tenant: t, conn };
}

// GET /tenants/:id/users
const getTenantUsers = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const r = await tenantConnById(master, req.params.id);
  if (r.error) return res.status(r.status).json({ message: r.error });
  const users = await r.conn.model('User').find().select('name email role isActive mustChangePassword emailVerified twoFactorEnabled createdAt')
    .sort({ createdAt: 1 }).lean();
  res.json({ users });
});

// PUT /tenants/:id/users/:uid  — role / isActive / name / email
const updateTenantUser = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const r = await tenantConnById(master, req.params.id);
  if (r.error) return res.status(r.status).json({ message: r.error });
  const User = r.conn.model('User');
  const user = await User.findById(req.params.uid);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const b = req.body || {};
  if (b.role !== undefined) user.role = b.role;
  if (b.isActive !== undefined) user.isActive = !!b.isActive;
  if (b.name !== undefined) user.name = b.name;
  if (b.email !== undefined) user.email = String(b.email).toLowerCase();
  await user.save();
  await logPlatform(master, req, 'tenant.user.update', { subdomain: r.tenant.subdomain, userId: req.params.uid, role: user.role, isActive: user.isActive });
  res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
});

// POST /tenants/:id/users/:uid/reset-password  — set a temporary password
const resetTenantUserPassword = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const r = await tenantConnById(master, req.params.id);
  if (r.error) return res.status(r.status).json({ message: r.error });
  const user = await r.conn.model('User').findById(req.params.uid).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.password = newPassword;
  user.mustChangePassword = true;
  await user.save();
  await logPlatform(master, req, 'tenant.user.reset_password', { subdomain: r.tenant.subdomain, userId: req.params.uid });
  res.json({ message: 'Temporary password set. The user must change it at next login.' });
});

// POST /tenants/:id/extend  { days }  — extend the current period / trial
const extendSubscription = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const days = Math.max(1, Math.min(3650, parseInt(req.body.days, 10) || 30));
  const t = await master.model('Tenant').findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Tenant not found' });
  const now = Date.now();
  if (t.status === 'trial') {
    const base = t.trialEndsAt ? Math.max(now, new Date(t.trialEndsAt).getTime()) : now;
    t.trialEndsAt = new Date(base + days * 86400000);
  } else {
    const base = t.currentPeriodEnd ? Math.max(now, new Date(t.currentPeriodEnd).getTime()) : now;
    t.currentPeriodEnd = new Date(base + days * 86400000);
    t.graceEndsAt = new Date(t.currentPeriodEnd.getTime() + 7 * 86400000);
    if (t.status === 'expired' || t.status === 'grace' || t.status === 'past_due') t.status = 'active';
  }
  await t.save();
  clearTenantCache(t.subdomain);
  await logPlatform(master, req, 'tenant.extend', { subdomain: t.subdomain, days });
  res.json({ subdomain: t.subdomain, status: t.status, trialEndsAt: t.trialEndsAt, currentPeriodEnd: t.currentPeriodEnd });
});

// --------------------------------------------------------------------------- //
//  Announcements (broadcast to all tenants)
// --------------------------------------------------------------------------- //
const broadcast = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });
  const tenants = await master.model('Tenant').find({ status: { $ne: 'suspended' } }).select('subdomain dbName').lean();
  const broadcastId = `bc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  let sent = 0; let failed = 0; const reached = [];
  for (const t of tenants) {
    try {
      const conn = await getTenantConnection(t.dbName);
      await conn.model('Notification').create({
        title, message, type: type || 'info', source: 'platform', audience: 'all',
        createdByLabel: 'Nexusora', broadcastId,
      });
      sent += 1; reached.push(t.subdomain);
    } catch (e) { failed += 1; console.error(`[broadcast] ${t.subdomain} failed:`, e.message); }
  }
  await master.model('Broadcast').create({ broadcastId, title, message, type: type || 'info', tenants: reached, sent, failed });
  await logPlatform(master, req, 'announce.broadcast', { broadcastId, sent, failed });
  res.json({ broadcastId, sent, failed });
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const items = await master.model('Broadcast').find().sort({ at: -1 }).limit(50).lean();
  res.json({ items });
});

// DELETE /announcements/:bid — withdraw from every tenant's bell.
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const bc = await master.model('Broadcast').findOne({ broadcastId: req.params.bid });
  if (!bc) return res.status(404).json({ message: 'Announcement not found' });
  const tenants = await master.model('Tenant').find({ subdomain: { $in: bc.tenants } }).select('dbName subdomain').lean();
  for (const t of tenants) {
    try { const conn = await getTenantConnection(t.dbName); await conn.model('Notification').deleteMany({ broadcastId: bc.broadcastId }); }
    catch (e) { console.error(`[broadcast] withdraw ${t.subdomain} failed:`, e.message); }
  }
  await bc.deleteOne();
  await logPlatform(master, req, 'announce.withdraw', { broadcastId: req.params.bid });
  res.json({ withdrawn: true });
});

// --------------------------------------------------------------------------- //
//  Platform settings (company / branding / smtp)
// --------------------------------------------------------------------------- //
async function settingsDoc(master) {
  const PlatformSettings = master.model('PlatformSettings');
  let doc = await PlatformSettings.findOne({ key: 'singleton' });
  if (!doc) doc = await PlatformSettings.create({ key: 'singleton' });
  return doc;
}
const getSettings = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  res.json({ settings: await settingsDoc(master) });
});
const updateSettings = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const doc = await settingsDoc(master);
  const b = req.body || {};
  if (b.company) doc.company = { ...doc.company.toObject(), ...b.company };
  if (b.branding) doc.branding = { ...doc.branding.toObject(), ...b.branding };
  if (b.smtp) doc.smtp = { ...doc.smtp.toObject(), ...b.smtp };
  doc.updatedAt = new Date();
  await doc.save();
  await logPlatform(master, req, 'settings.update', {});
  res.json({ settings: doc });
});

// GET /revenue — paid invoices grouped by month + currency.
const revenue = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const paid = await master.model('Invoice').find({ status: 'paid' }).select('total currency paidAt plan subdomain').sort({ paidAt: -1 }).lean();
  const byMonth = {};
  for (const i of paid) {
    const m = i.paidAt ? new Date(i.paidAt).toISOString().slice(0, 7) : 'unknown';
    byMonth[m] = byMonth[m] || {};
    byMonth[m][i.currency] = Math.round(((byMonth[m][i.currency] || 0) + Number(i.total || 0)) * 100) / 100;
  }
  res.json({ recent: paid.slice(0, 25), byMonth, count: paid.length });
});

module.exports = {
  platformLogin, createTenant, listTenants, getTenant, updateTenant,
  suspendTenant: setSuspend(true), unsuspendTenant: setSuspend(false), deleteTenant, impersonate,
  getTenantUsers, updateTenantUser, resetTenantUserPassword, extendSubscription,
  broadcast, listAnnouncements, deleteAnnouncement,
  getSettings, updateSettings, revenue,
  getPricing, updatePricing, metrics, listAllInvoices, platformAudit, health,
};
