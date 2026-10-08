// Two-factor authentication — enrolment & management (behind protect).
// The login step-2 (loginVerify) lives in auth.controller so it can reuse the
// token/safeUser helpers. 2FA is optional for every role.
const asyncHandler = require('express-async-handler');
const {
  generateTotpSecret, buildOtpauthUri, generateQrDataUrl, verifyTotp, generateBackupCodes,
} = require('../../utils/twoFactor');

// POST /auth/2fa/setup — begin enrolment: issue a pending secret + QR.
const setup = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId).select('+twoFactorSecret +twoFactorPendingSecret');
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  const secret = generateTotpSecret();
  const otpauthUri = buildOtpauthUri(secret, user.email);
  const qrDataUrl = await generateQrDataUrl(otpauthUri);

  user.twoFactorPendingSecret = secret;
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Scan the QR code with your authenticator app, then verify a code to finish setup.',
    data: { qrDataUrl, manualEntryKey: secret, alreadyEnabled: user.twoFactorEnabled },
  });
});

// POST /auth/2fa/verify-setup { token } — confirm the code, enable 2FA, return backup codes once.
const verifySetup = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'Verification code is required.' });

  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId).select('+twoFactorPendingSecret +twoFactorBackupCodes');
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  if (!user.twoFactorPendingSecret) return res.status(400).json({ success: false, message: 'No pending 2FA setup found. Start setup again.' });
  if (!verifyTotp(token, user.twoFactorPendingSecret)) {
    return res.status(401).json({ success: false, message: 'Incorrect code. Check your authenticator app and try again.' });
  }

  const { display, hashed } = await generateBackupCodes();
  user.twoFactorSecret = user.twoFactorPendingSecret;
  user.twoFactorPendingSecret = undefined;
  user.twoFactorEnabled = true;
  user.twoFactorBackupCodes = hashed;
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Two-factor authentication is now enabled. Save your backup codes.',
    data: { backupCodes: display },
  });
});

// POST /auth/2fa/disable { password, token } — both required, so a hijacked session can't strip 2FA.
const disable = asyncHandler(async (req, res) => {
  const { password, token } = req.body;
  if (!password || !token) {
    return res.status(400).json({ success: false, message: 'Password and a current authenticator code are both required to disable 2FA.' });
  }
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId).select('+password +twoFactorSecret');
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  if (!user.twoFactorEnabled) return res.status(400).json({ success: false, message: '2FA is not currently enabled.' });
  if (!(await user.matchPassword(password))) return res.status(401).json({ success: false, message: 'Incorrect password.' });
  if (!verifyTotp(token, user.twoFactorSecret)) return res.status(401).json({ success: false, message: 'Incorrect authenticator code.' });

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  user.twoFactorPendingSecret = undefined;
  user.twoFactorBackupCodes = undefined;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: 'Two-factor authentication has been disabled.' });
});

// POST /auth/2fa/regenerate-backup-codes { token } — rotate codes; requires a current TOTP.
const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'A current authenticator code is required.' });
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId).select('+twoFactorSecret +twoFactorBackupCodes');
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  if (!user.twoFactorEnabled) return res.status(400).json({ success: false, message: '2FA is not enabled.' });
  if (!verifyTotp(token, user.twoFactorSecret)) return res.status(401).json({ success: false, message: 'Incorrect authenticator code.' });

  const { display, hashed } = await generateBackupCodes();
  user.twoFactorBackupCodes = hashed;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: 'New backup codes generated. Your previous codes no longer work.', data: { backupCodes: display } });
});

// GET /auth/2fa/status — is 2FA on, and how many backup codes remain.
const status = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId).select('twoFactorEnabled +twoFactorBackupCodes');
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
  res.json({
    success: true,
    data: {
      enabled: !!user.twoFactorEnabled,
      backupCodesRemaining: Array.isArray(user.twoFactorBackupCodes) ? user.twoFactorBackupCodes.length : 0,
    },
  });
});

module.exports = { setup, verifySetup, disable, regenerateBackupCodes, status };
