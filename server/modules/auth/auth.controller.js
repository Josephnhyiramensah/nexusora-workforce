const asyncHandler = require('express-async-handler');
const { signToken } = require('../../utils/generateToken');

function safeUser(u) {
  return { id: u._id, name: u.name, email: u.email, role: u.role, permissions: u.permissions, locale: u.locale, isActive: u.isActive };
}
function tenantInfo(t) {
  return { name: t.name, subdomain: t.subdomain, countryCode: t.countryCode, baseCurrency: t.baseCurrency, defaultLocale: t.defaultLocale, enabledLocales: t.enabledLocales, plan: t.plan, modules: t.modules };
}

// POST /api/auth/login  (resolveTenant has set req.tenant + req.tenantConn)
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const User = req.tenantConn.model('User');
  const user = await User.findOne({ email: (email || '').toLowerCase(), isActive: true }).select('+password');
  if (!user || !(await user.matchPassword(password || ''))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken({ userId: user._id, tenant: req.tenant.subdomain, role: user.role, permissions: user.permissions || [] });
  res.json({ token, user: safeUser(user), tenant: tenantInfo(req.tenant) });
});

// GET /api/auth/me  (protect + resolveTenant)
const me = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: safeUser(user), tenant: tenantInfo(req.tenant) });
});

// POST /api/auth/users  (admin creates a user; gated in routes)
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions, locale } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
  const User = req.tenantConn.model('User');
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already exists' });
  const user = await User.create({
    name, email: email.toLowerCase(), password, role: role || 'employee',
    permissions: permissions || [], locale: locale || req.tenant.defaultLocale,
  });
  res.status(201).json({ user: safeUser(user) });
});

// GET /api/auth/users
const listUsers = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map(safeUser));
});

module.exports = { login, me, createUser, listUsers };
