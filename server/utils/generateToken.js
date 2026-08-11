const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Sign a JWT. Tenant tokens use JWT_SECRET; platform tokens pass the platform secret.
function signToken(payload, { secret = env.JWT_SECRET, expiresIn = env.JWT_EXPIRE } = {}) {
  return jwt.sign(payload, secret, { expiresIn });
}
module.exports = { signToken };
