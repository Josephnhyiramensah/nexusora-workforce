// Master model: Nexusora-side platform administrators (separate from tenant users).
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['platform_admin'], default: 'platform_admin' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'platform_users' });

schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
schema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = { schema, modelName: 'PlatformUser' };
