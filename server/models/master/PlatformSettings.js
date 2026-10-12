// Master singleton: platform-wide settings edited in the admin console (A3) —
// company contact, branding, and SMTP display config. Mirrors Nexusora Books.
// Secrets (SMTP password, API keys) stay in server/.env, never here.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, default: 'singleton', unique: true },
  company: {
    name: { type: String, default: 'Nexusora Technologies' },
    developer: { type: String, default: '' },
    email: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    website: { type: String, default: '' },
    address: { type: String, default: '' },
    tagline: { type: String, default: 'People · Performance · Progress' },
  },
  branding: {
    platformName: { type: String, default: 'Nexusora Workforce' },
    primaryColor: { type: String, default: '#012158' },
    accentColor: { type: String, default: '#168eff' },
  },
  smtp: {
    host: { type: String, default: '' },
    port: { type: Number, default: 2525 },
    user: { type: String, default: '' },
    fromName: { type: String, default: 'Nexusora Workforce' },
  },
  updatedAt: { type: Date, default: Date.now },
}, { minimize: false, collection: 'platform_settings' });

module.exports = { schema, modelName: 'PlatformSettings' };
