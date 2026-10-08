require('dotenv').config();
const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5002,
  DEFAULT_LOCALE: process.env.DEFAULT_LOCALE || 'en',
  MASTER_DB_URI: process.env.MASTER_DB_URI || '',
  MONGO_CLUSTER_URI: process.env.MONGO_CLUSTER_URI || '',
  TENANT_DB_PREFIX: process.env.TENANT_DB_PREFIX || 'nexusora_wf_',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_me',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
  PLATFORM_ADMIN_SECRET: process.env.PLATFORM_ADMIN_SECRET || 'dev_platform_secret_change_me',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // Outbound email (optional). If SMTP_HOST is unset, email is skipped
  // gracefully and only in-app notifications are sent.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_SECURE: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || 'Nexusora Workforce <no-reply@nexusora.app>',
  APP_URL: process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173',

  // Overdue reminder sweep.
  REMINDERS_ENABLED: String(process.env.REMINDERS_ENABLED || 'true').toLowerCase() !== 'false',
  REMINDER_HOUR: parseInt(process.env.REMINDER_HOUR, 10) || 7, // local server hour, 0–23
};
module.exports = env;