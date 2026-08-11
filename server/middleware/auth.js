// Auth middleware. Token payload = { userId, tenant: <subdomain>, role }.
// protect: require a valid token. optionalProtect: attach if present, else continue.
// authorise(...roles): role gate (default-deny). Granular permission check also provided.
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function readToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

function protect(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Not authorised: no token' });
  try {
    req.auth = jwt.verify(token, env.JWT_SECRET);   // { userId, tenant, role }
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Not authorised: invalid token' });
  }
}

function optionalProtect(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try { req.auth = jwt.verify(token, env.JWT_SECRET); } catch (e) { /* ignore */ }
  return next();
}

function authorise(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Not authorised' });
    if (roles.length && !roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

// Passes if the user has the role OR an explicit granular permission grant.
function requirePermission(permission, ...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Not authorised' });
    const hasRole = allowedRoles.includes(req.auth.role);
    const hasGrant = Array.isArray(req.auth.permissions) && req.auth.permissions.includes(permission);
    if (hasRole || hasGrant) return next();
    return res.status(403).json({ message: 'Forbidden: missing permission' });
  };
}

module.exports = { protect, optionalProtect, authorise, requirePermission };
