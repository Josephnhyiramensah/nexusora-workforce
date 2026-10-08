// Per-tenant user (login identity). Registered ONLY on tenant connections.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DEFAULT_LOCALE } = require('../../i18n/locales');

const ROLES = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'employee' },
  permissions: { type: [String], default: [] },     // granular grants on top of role
  locale: { type: String, default: DEFAULT_LOCALE }, // user's preferred UI language
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  // Provisional secret held during enrolment; promoted to twoFactorSecret only
  // once the user proves possession by verifying a code against it.
  twoFactorPendingSecret: { type: String, select: false },
  // bcrypt hashes of single-use recovery codes (never the plaintext).
  twoFactorBackupCodes: { type: [String], select: false, default: undefined },
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'users' });

schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
schema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Verify a candidate backup code and, on success, BURN it (single-use).
// The doc must be fetched with .select('+twoFactorBackupCodes'). Normalisation
// (strip non-alphanumerics, uppercase) mirrors the canonical hashed form.
schema.methods.verifyAndBurnBackupCode = async function (candidate) {
  const codes = this.twoFactorBackupCodes;
  if (!Array.isArray(codes) || codes.length === 0) return false;
  const normalised = String(candidate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!normalised) return false;
  for (let i = 0; i < codes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const match = await bcrypt.compare(normalised, codes[i]);
    if (match) {
      codes.splice(i, 1);
      this.markModified('twoFactorBackupCodes');
      await this.save({ validateBeforeSave: false });
      return true;
    }
  }
  return false;
};

module.exports = { schema, modelName: 'User', ROLES };
