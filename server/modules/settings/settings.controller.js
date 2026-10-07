const asyncHandler = require('express-async-handler');
const { getMasterConnection } = require('../../config/db');

// Branding used on every printed report: letterhead image, or company details + logo, or nothing
// (the client then falls back to the Nexusora mark).
const getBranding = asyncHandler(async (req, res) => {
  const t = req.tenant || {};
  res.json({
    branding: t.branding || {},
    tenant: { name: t.name, subdomain: t.subdomain, countryCode: t.countryCode, baseCurrency: t.baseCurrency },
  });
});

const updateBranding = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });

  const { letterhead, logo, companyName, address, phone, email, website, footerNote } = req.body;

  // Guard against oversized inline images (data URLs are stored directly).
  for (const [label, val] of [['letterhead', letterhead], ['logo', logo]]) {
    if (typeof val === 'string' && val.length > 1400000) {
      return res.status(413).json({ message: `${label} image is too large — please use an image under ~1MB.` });
    }
  }

  const branding = {
    ...(req.tenant.branding || {}),
    ...(letterhead !== undefined ? { letterhead } : {}),
    ...(logo !== undefined ? { logo } : {}),
    ...(companyName !== undefined ? { companyName } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(website !== undefined ? { website } : {}),
    ...(footerNote !== undefined ? { footerNote } : {}),
    updatedAt: new Date(),
  };

  await master.model('Tenant').findByIdAndUpdate(req.tenant._id, { branding }, { new: true });
  res.json({ message: 'Branding saved', branding });
});

/* ------------------------------------------------------------------ *
 *  Company settings — the tenant-level base currency.
 *  Payroll is always calculated and stored in the base currency, so this
 *  is a significant, super-admin-only setting. The Tenant model validates
 *  the code against the supported-currency catalogue (isSupportedCurrency),
 *  so an unknown code is rejected automatically.
 * ------------------------------------------------------------------ */
const updateCompany = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });

  const patch = {};
  if (req.body.baseCurrency !== undefined) {
    patch.baseCurrency = String(req.body.baseCurrency || '').toUpperCase();
  }
  if (!Object.keys(patch).length) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  try {
    const t = await master.model('Tenant')
      .findByIdAndUpdate(req.tenant._id, patch, { new: true, runValidators: true });
    if (!t) return res.status(404).json({ message: 'Workspace not found' });
    res.json({
      message: 'Company settings saved',
      tenant: { name: t.name, subdomain: t.subdomain, countryCode: t.countryCode, baseCurrency: t.baseCurrency },
    });
  } catch (e) {
    // Mongoose validation error (e.g. unsupported currency) → 400 not 500.
    return res.status(400).json({ message: e?.errors?.baseCurrency?.message || e.message || 'Could not save company settings' });
  }
});

/* ------------------------------------------------------------------ *
 *  Users & Roles (admin). Lets HR manage logins and — the key bit —
 *  LINK a login to an employee (User.employee), which powers Self-Service.
 * ------------------------------------------------------------------ */

// GET /settings/users — all tenant logins (no secrets), with their linked employee.
const listUsers = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  req.tenantConn.model('Employee'); // ensure registered for populate
  const items = await User.find()
    .select('-password -twoFactorSecret')
    .populate('employee', 'firstName lastName staffId')
    .sort({ name: 1 });
  res.json({ items, total: items.length });
});

// PUT /settings/users/:id — update role, active state, and/or the linked employee.
const updateUser = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const { role, employee, isActive } = req.body;

  const patch = {};
  if (role !== undefined) patch.role = role;
  if (isActive !== undefined) patch.isActive = !!isActive;
  if (employee !== undefined) patch.employee = employee || null; // '' / null clears the link

  const u = await User.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true })
    .select('-password -twoFactorSecret')
    .populate('employee', 'firstName lastName staffId');
  if (!u) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User updated', user: u });
});

module.exports = { getBranding, updateBranding, updateCompany, listUsers, updateUser };