// Cloudinary client — configured once from the central env config.
// SECRET stays server-side only; never import this into client/.
const cloudinary = require('cloudinary').v2;
const env = require('./env');

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true, // return https URLs
});

if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
  console.warn('[cloudinary] Missing one or more CLOUDINARY_* env vars — uploads will fail until set.');
}

module.exports = cloudinary;