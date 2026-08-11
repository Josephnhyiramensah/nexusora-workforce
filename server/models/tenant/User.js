// Per-tenant user (login identity). Registered ONLY on tenant connections.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DEFAULT_LOCALE } = require('../../i18n/locales');

const ROLES = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'employee' },
  permissions: { type: [String], default: [] },     // granular grants on top of role
  locale: { type: String, default: DEFAULT_LOCALE }, // user's preferred UI language
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'users' });

schema.index({ email: 1 }, { unique: true });
schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
schema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = { schema, modelName: 'User', ROLES };
