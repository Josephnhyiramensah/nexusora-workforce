// Platform-admin auth — SEPARATE secret from tenant auth (defence in depth).
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function platformProtect(req, res, next) {
  const h = req.headers.authorization;
  const token = (h && h.startsWith('Bearer ')) ? h.slice(7) : (req.cookies && req.cookies.token);
  if (!token) return res.status(401).json({ message: 'Platform authentication required' });
  try {
    const payload = jwt.verify(token, env.PLATFORM_ADMIN_SECRET);
    if (payload.scope !== 'platform') return res.status(401).json({ message: 'Not a platform token' });
    req.platform = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid platform token' });
  }
}
module.exports = { platformProtect };
