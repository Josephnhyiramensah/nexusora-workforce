const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { signToken } = require('../../utils/generateToken');
const { verifyTotp } = require('../../utils/twoFactor');
const emailSvc = require('../../services/email.service');
const { resolveEntitlements } = require('../../config/plans');
const { seatLimit } = require('../../services/subscription.service');
const { isValidPermission, isValidScope } = require('../../config/permissions');

// Keep only well-formed ACL overrides (E4): a grant needs a valid permission AND
// scope; a revoke needs a valid permission (scope ignored). Anything else is
// dropped so a bad payload can never corrupt a user's effective permissions.
function sanitizeOverrides(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const o of arr) {
    if (!o || !isValidPermission(o.permission)) continue;
    if (o.effect === 'grant' && isValidScope(o.scope)) out.push({ permission: o.permission, effect: 'grant', scope: o.scope });
    else if (o.effect === 'revoke') out.push({ permission: o.permission, effect: 'revoke' });
  }
  return out;
}

function safeUser(u) {
  // `employee` may be a bare id or a populated doc (in listUsers). Always expose the id
  // as `employee` (so pickers preselect correctly), plus a readable name when populated.
  const linked = u.employee && typeof u.employee === 'object' && u.employee._id ? u.employee : null;
  return {
    id: u._id, name: u.name, email: u.email, role: u.role,
    permissions: u.permissions, permissionOverrides: u.permissionOverrides || [], locale: u.locale, isActive: u.isActive,
    mustChangePassword: !!u.mustChangePassword, createdAt: u.createdAt,
    employee: linked ? linked._id : (u.employee || null),   // linked employee id
    employeeName: linked ? [linked.firstName, linked.lastName].filter(Boolean).join(' ') : undefined,
    employeeStaffId: linked ? linked.staffId : undefined,
  };
}
function tenantInfo(t) {
  return {
    name: t.name, subdomain: t.subdomain, countryCode: t.countryCode, baseCurrency: t.baseCurrency,
    defaultLocale: t.defaultLocale, enabledLocales: t.enabledLocales, plan: t.plan, modules: t.modules,
    branding: t.branding || {},   // letterhead / logo / company details — used on every printed report
    // Plan-based entitlements (C2) — the client gates modules/features off this.
    entitlements: resolveEntitlements(t),
    subscription: {
      status: t.status || 'active',
      trialEndsAt: t.trialEndsAt || null,
      currentPeriodEnd: t.currentPeriodEnd || null,
      graceEndsAt: t.graceEndsAt || null,
      seatLimit: resolveEntitlements(t).seatLimit,
    },
  };
}

function issueSession(res, user, tenant, extra = {}) {
  const token = signToken({ userId: user._id, tenant: tenant.subdomain, role: user.role, permissions: user.permissions || [] });
  res.json({ token, user: safeUser(user), tenant: tenantInfo(tenant), ...extra });
}

// Brute-force lockout (E2): after MAX_FAILS consecutive failures, lock the
// account for LOCK_MINUTES. Resets on a successful sign-in.
const MAX_FAILS = 6;
const LOCK_MINUTES = 15;

// Email-verification gate (C4). Pure + testable. A sign-in is blocked only when
// enforcement is on, SMTP is configured (so we CAN send a link — otherwise a
// workspace could be permanently locked out), and the account is explicitly
// unverified. Admin-created members are pre-verified, so this only affects
// unverified self-signup owners.
function needsEmailVerification(user, { enforce, smtpConfigured } = {}) {
  return !!(enforce && smtpConfigured && user && user.emailVerified === false);
}

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const User = req.tenantConn.model('User');
  const user = await User.findOne({ email: (email || '').toLowerCase(), isActive: true })
    .select('+password +failedLoginAttempts +lockUntil');
  // Locked? Refuse without revealing whether the password was right.
  if (user && user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return res.status(429).json({ message: `Too many attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` });
  }
  const matched = user && await user.matchPassword(password || '');
  if (!matched) {
    if (user) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILS) { user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000); user.failedLoginAttempts = 0; }
      await user.save({ validateBeforeSave: false });
    }
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  // Successful credential check — clear any failure state.
  if (user.failedLoginAttempts || user.lockUntil) {
    user.failedLoginAttempts = 0; user.lockUntil = undefined;
    await user.save({ validateBeforeSave: false });
  }
  // Email-verification gate (C4): block unverified self-signup owners and send a
  // fresh link so they can confirm and come back. Never blocks when SMTP is off.
  if (needsEmailVerification(user, { enforce: env.REQUIRE_EMAIL_VERIFICATION, smtpConfigured: emailSvc.isConfigured() })) {
    issueEmailVerification(user, req.tenant).catch((e) => console.error('[email] verification resend failed:', e && e.message));
    return res.status(403).json({ code: 'email_unverified', message: "Please verify your email to sign in — we've just sent you a fresh verification link." });
  }
  // If the user has 2FA enabled, don't issue a session yet — return a short-lived
  // challenge and require the second factor via POST /auth/2fa/login.
  if (user.twoFactorEnabled) {
    const challengeToken = signToken(
      { userId: user._id, tenant: req.tenant.subdomain, type: '2fa_pending' },
      { expiresIn: '10m' },
    );
    return res.json({ twoFactorRequired: true, challengeToken });
  }
  issueSession(res, user, req.tenant);
});

// POST /api/auth/2fa/login — step 2 for users with 2FA enabled (PUBLIC, tenant-resolved).
// Body: { challengeToken, token?, backupCode? }
const loginVerify = asyncHandler(async (req, res) => {
  const { challengeToken, token, backupCode } = req.body;
  if (!challengeToken) return res.status(400).json({ message: 'Login session expired. Please sign in again.' });
  if (!token && !backupCode) return res.status(400).json({ message: 'Enter an authenticator code or a backup code.' });

  let decoded;
  try { decoded = jwt.verify(challengeToken, env.JWT_SECRET); }
  catch (e) {
    const expired = e.name === 'TokenExpiredError';
    return res.status(401).json({ message: expired ? 'Login session expired. Please sign in again.' : 'Invalid login session.' });
  }
  if (decoded.type !== '2fa_pending') return res.status(401).json({ message: 'Invalid login session.' });
  if (decoded.tenant && decoded.tenant !== req.tenant.subdomain) {
    return res.status(401).json({ message: 'Login session is not valid for this workspace.' });
  }

  const User = req.tenantConn.model('User');
  const user = await User.findById(decoded.userId).select('+twoFactorSecret +twoFactorBackupCodes');
  if (!user || !user.isActive) return res.status(401).json({ message: 'Account not available.' });
  if (!user.twoFactorEnabled) return res.status(400).json({ message: 'Two-factor authentication is not enabled for this account.' });

  let verified = false; let usedBackup = false;
  if (token) verified = verifyTotp(token, user.twoFactorSecret);
  if (!verified && backupCode) { verified = await user.verifyAndBurnBackupCode(backupCode); usedBackup = verified; }
  if (!verified) return res.status(401).json({ message: 'Incorrect code. Please try again.' });

  const backupCodesRemaining = Array.isArray(user.twoFactorBackupCodes) ? user.twoFactorBackupCodes.length : 0;
  issueSession(res, user, req.tenant, { usedBackupCode: usedBackup, backupCodesRemaining });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const user = await req.tenantConn.model('User').findById(req.auth.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: safeUser(user), tenant: tenantInfo(req.tenant) });
});

// POST /api/auth/users — admin creates a user; they must change the password at first login.
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions, locale, employee } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const User = req.tenantConn.model('User');
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already exists' });
  // Seat limit (A2): block adding a user beyond the plan's seat cap.
  const limit = seatLimit(req.tenant);
  if (limit != null) {
    const activeCount = await User.countDocuments({ isActive: true });
    if (activeCount >= limit) {
      return res.status(403).json({
        code: 'seat_limit_reached',
        message: `Your plan includes ${limit} seats and all are in use. Upgrade your plan or purchase more seats to add another user.`,
        seatLimit: limit,
      });
    }
  }
  const user = await User.create({
    name, email: email.toLowerCase(), password, role: role || 'employee',
    permissions: permissions || [], locale: locale || req.tenant.defaultLocale,
    employee: employee || undefined,   // optional link to an employee record
    mustChangePassword: true,
    // Admin-created members are vouched for by the admin and get a temp password,
    // not a verification link — so they're pre-verified (never email-gated).
    emailVerified: true,
  });
  res.status(201).json({ user: safeUser(user) });
  // Fire-and-forget welcome email (never blocks the response; skips if SMTP off).
  emailSvc.sendWelcome({ to: user.email, name: user.name, tenant: req.tenant, tempPassword: password })
    .catch((e) => console.error('[email] welcome failed:', e && e.message));
});

// GET /api/auth/users  (optional ?employee=<id> — used to check if a person has a login)
const listUsers = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  req.tenantConn.model('Employee'); // ensure registered for populate
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  const users = await User.find(filter)
    .populate('employee', 'firstName lastName staffId')
    .sort({ createdAt: -1 });
  res.json(users.map(safeUser));
});

// PUT /api/auth/users/:id — edit name/role/locale/permissions and the linked employee (not password).
const updateUser = asyncHandler(async (req, res) => {
  const { name, role, locale, permissions, permissionOverrides, employee } = req.body;
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (locale !== undefined) user.locale = locale;
  if (permissions !== undefined) user.permissions = permissions;
  if (permissionOverrides !== undefined) user.permissionOverrides = sanitizeOverrides(permissionOverrides);
  if (employee !== undefined) user.employee = employee || null;   // '' / null clears the link
  await user.save();
  res.json({ user: safeUser(user) });
});

// POST /api/auth/users/:id/status — activate / deactivate. Cannot deactivate yourself.
const setUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;
  if (String(req.params.id) === String(req.auth.userId)) {
    return res.status(409).json({ message: 'You cannot deactivate your own account' });
  }
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Reactivating consumes a seat — enforce the cap here too, not just on create.
  if (isActive && !user.isActive) {
    const limit = seatLimit(req.tenant);
    if (limit != null) {
      const activeCount = await User.countDocuments({ isActive: true });
      if (activeCount >= limit) {
        return res.status(403).json({ code: 'seat_limit_reached', message: `Your plan includes ${limit} seats and all are in use. Upgrade or purchase more seats to reactivate this user.`, seatLimit: limit });
      }
    }
  }
  user.isActive = !!isActive;
  await user.save();
  res.json({ user: safeUser(user) });
});

// POST /api/auth/users/:id/reset-password — admin sets a temporary password.
const adminResetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.password = password;
  user.mustChangePassword = true;
  await user.save();
  res.json({ message: 'Temporary password set. The user must change it at next login.' });
  // Fire-and-forget reset notice (never blocks the response; skips if SMTP off).
  emailSvc.sendPasswordReset({ to: user.email, name: user.name, tenant: req.tenant, tempPassword: password, byAdmin: true })
    .catch((e) => console.error('[email] reset notice failed:', e && e.message));
});

// POST /api/auth/change-password — the signed-in user changes their own password.
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (!(await user.matchPassword(currentPassword || ''))) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }
  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: 'Password changed', user: safeUser(user) });
});

// --------------------------------------------------------------------------- //
//  Password reset + email verification (C4)
//  Tokens are random (32 bytes) and stored hashed (sha256); only the raw token
//  travels in the emailed link. Expiries: reset 1h, verification 24h.
// --------------------------------------------------------------------------- //
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
function makeToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}
function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}
function appLink(tenant, path, raw) {
  // D3: when a base domain is configured, link straight to the tenant's own
  // subdomain (the host carries the workspace); otherwise use APP_URL + a
  // ?workspace= hint for local/dev where there is no subdomain.
  if (tenant && tenant.subdomain && env.APP_BASE_DOMAIN) {
    return `https://${tenant.subdomain}.${env.APP_BASE_DOMAIN}${path}?token=${raw}`;
  }
  const base = env.APP_URL.replace(/\/+$/, '');
  return `${base}${path}?token=${raw}&workspace=${encodeURIComponent(tenant.subdomain)}`;
}

// Generate + persist a verification token and email it. Reused by resend and by
// A2 self-signup. Fire-and-forget email; never throws.
async function issueEmailVerification(user, tenant) {
  const { raw, hash } = makeToken();
  user.emailVerifyToken = hash;
  user.emailVerifyExpires = new Date(Date.now() + VERIFY_TTL_MS);
  await user.save({ validateBeforeSave: false });
  emailSvc.sendEmailVerification({
    to: user.email, name: user.name, tenant,
    verifyUrl: appLink(tenant, '/verify-email', raw), expiresText: 'expires in 24 hours',
  }).catch((e) => console.error('[email] verification failed:', e && e.message));
}

// POST /api/auth/forgot-password  (public, tenant-resolved). Always returns the
// same message so email addresses can't be probed for existence.
const forgotPassword = asyncHandler(async (req, res) => {
  const emailInput = String(req.body.email || '').toLowerCase().trim();
  const generic = { message: 'If that email is registered, a reset link is on its way.' };
  if (!emailInput) return res.json(generic);
  const User = req.tenantConn.model('User');
  const user = await User.findOne({ email: emailInput, isActive: true });
  if (!user) return res.json(generic);
  const { raw, hash } = makeToken();
  user.resetPasswordToken = hash;
  user.resetPasswordExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save({ validateBeforeSave: false });
  res.json(generic);
  emailSvc.sendPasswordReset({
    to: user.email, name: user.name, tenant: req.tenant,
    resetUrl: appLink(req.tenant, '/reset-password', raw), expiresText: 'expires in 1 hour',
  }).catch((e) => console.error('[email] reset link failed:', e && e.message));
});

// POST /api/auth/reset-password  (public, tenant-resolved). { token, password }
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ message: 'Token and new password are required' });
  if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const User = req.tenantConn.model('User');
  const user = await User.findOne({
    resetPasswordToken: hashToken(token),
    resetPasswordExpires: { $gt: new Date() },
  }).select('+password +resetPasswordToken +resetPasswordExpires');
  if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: 'Your password has been reset. You can now sign in.' });
});

// POST /api/auth/verify-email  (public, tenant-resolved). { token }
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'Verification token is required' });
  const User = req.tenantConn.model('User');
  const user = await User.findOne({
    emailVerifyToken: hashToken(token),
    emailVerifyExpires: { $gt: new Date() },
  }).select('+emailVerifyToken +emailVerifyExpires');
  if (!user) return res.status(400).json({ message: 'This verification link is invalid or has expired.' });
  user.emailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpires = undefined;
  await user.save({ validateBeforeSave: false });
  res.json({ message: 'Email verified — thank you.' });
});

// POST /api/auth/resend-verification  (signed-in). Re-sends the link to self.
const resendVerification = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.emailVerified) return res.json({ message: 'Your email is already verified.' });
  await issueEmailVerification(user, req.tenant);
  res.json({ message: 'Verification email sent.' });
});

// PUT /api/auth/profile — the signed-in user edits their own name/locale.
const updateProfile = asyncHandler(async (req, res) => {
  const { name, locale } = req.body;
  const user = await req.tenantConn.model('User').findById(req.auth.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (name !== undefined) user.name = name;
  if (locale !== undefined) user.locale = locale;
  await user.save();
  res.json({ user: safeUser(user) });
});

module.exports = {
  login, loginVerify, me, createUser, listUsers, updateUser, setUserStatus,
  adminResetPassword, changePassword, updateProfile,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  // reused by A2 self-signup
  issueEmailVerification,
  // exported for tests
  needsEmailVerification, sanitizeOverrides,
};