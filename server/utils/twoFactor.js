// TOTP (RFC 6238) + backup-code primitives for tenant-user two-factor auth.
// Adapted from Nexusora Books. This module is the ONLY place that knows how 2FA
// secrets and backup codes are encoded; the canonical backup-code form here
// (uppercase, hyphen-free) MUST stay in lockstep with User.verifyAndBurnBackupCode().
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const TOTP_ISSUER = 'Nexusora Workforce';

// Accept the adjacent 30s window each side (±1 step) to absorb clock skew.
authenticator.options = { window: 1 };

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;                       // chars per code (excludes hyphen)
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no confusable glyphs; uppercase only
const BACKUP_CODE_SALT_ROUNDS = 10;

const generateTotpSecret = () => authenticator.generateSecret();
const buildOtpauthUri = (secret, accountName) => authenticator.keyuri(accountName, TOTP_ISSUER, secret);
const generateQrDataUrl = async (otpauthUri) => QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M', margin: 2, width: 240 });

// Verify a 6-digit TOTP. Defensive: strips whitespace, rejects non-numeric, never throws.
const verifyTotp = (token, secret) => {
  if (!secret) return false;
  const cleaned = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  try { return authenticator.verify({ token: cleaned, secret }); }
  catch { return false; }
};

const randomChar = () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
const prettyFormat = (raw) => { const mid = Math.floor(raw.length / 2); return `${raw.slice(0, mid)}-${raw.slice(mid)}`; };

// Returns { display: string[] (show once), hashed: string[] (persist) }.
const generateBackupCodes = async (count = BACKUP_CODE_COUNT) => {
  const display = []; const hashed = [];
  for (let i = 0; i < count; i += 1) {
    let raw = '';
    for (let j = 0; j < BACKUP_CODE_LENGTH; j += 1) raw += randomChar();
    // eslint-disable-next-line no-await-in-loop
    const hash = await bcrypt.hash(raw, BACKUP_CODE_SALT_ROUNDS); // raw is already canonical
    display.push(prettyFormat(raw));
    hashed.push(hash);
  }
  return { display, hashed };
};

module.exports = { TOTP_ISSUER, generateTotpSecret, buildOtpauthUri, generateQrDataUrl, verifyTotp, generateBackupCodes };
