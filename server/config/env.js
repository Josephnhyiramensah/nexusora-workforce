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
};
module.exports = env;