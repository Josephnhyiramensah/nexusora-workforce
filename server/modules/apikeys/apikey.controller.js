// API keys for external integrations — management + the authentication
// middleware that guards the public /api/v1 surface.
//
// Security model: the raw key (nxw_live_<64 hex>) is generated server-side,
// shown to the admin ONCE, and never stored. We persist only sha256(rawKey).
// Incoming requests present the raw key as a Bearer token; we hash it and match.
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');

const VALID_SCOPES = ['read', 'write', 'employees', 'payroll', 'leave', 'attendance', 'documents'];
const MAX_ACTIVE_KEYS = 10;

const generateApiKey = () => `nxw_live_${crypto.randomBytes(32).toString('hex')}`;
const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

// GET /settings/api-keys — list keys (hash never returned).
const getApiKeys = asyncHandler(async (req, res) => {
  const ApiKey = req.tenantConn.model('ApiKey');
  const keys = await ApiKey.find().select('-hashedKey').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: keys });
});

// POST /settings/api-keys — create a key, returning the raw value once.
const createApiKey = asyncHandler(async (req, res) => {
  const ApiKey = req.tenantConn.model('ApiKey');
  const { name, permissions = ['read'], expiresInDays } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'A key name is required.' });
  }
  const scopes = (Array.isArray(permissions) ? permissions : ['read']).filter((p) => VALID_SCOPES.includes(p));
  if (!scopes.length) scopes.push('read');

  const activeCount = await ApiKey.countDocuments({ isActive: true });
  if (activeCount >= MAX_ACTIVE_KEYS) {
    return res.status(400).json({ success: false, message: `Maximum of ${MAX_ACTIVE_KEYS} active API keys allowed. Revoke one first.` });
  }

  const rawKey = generateApiKey();
  const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000) : null;

  const doc = await ApiKey.create({
    name: String(name).trim(),
    hashedKey: hashKey(rawKey),
    keyPrefix: rawKey.slice(0, 20) + '…',
    permissions: scopes,
    expiresAt,
    createdBy: req.auth.userId,
  });

  res.status(201).json({
    success: true,
    message: 'API key created. Copy it now — it will not be shown again.',
    data: {
      _id: doc._id, name: doc.name, key: rawKey, keyPrefix: doc.keyPrefix,
      permissions: doc.permissions, expiresAt: doc.expiresAt, createdAt: doc.createdAt,
    },
  });
});

// DELETE /settings/api-keys/:id — revoke (soft; key stops authenticating).
const revokeApiKey = asyncHandler(async (req, res) => {
  const ApiKey = req.tenantConn.model('ApiKey');
  const key = await ApiKey.findById(req.params.id);
  if (!key) return res.status(404).json({ success: false, message: 'API key not found.' });
  key.isActive = false;
  key.revokedAt = new Date();
  key.revokedBy = req.auth.userId;
  await key.save();
  res.json({ success: true, message: `API key "${key.name}" revoked.` });
});

// Middleware: authenticate a public /api/v1 request with an API key.
// Runs AFTER resolveTenant (so req.tenantConn is the right tenant DB). On
// success it sets req.apiKey, req.apiPermissions, and a synthetic req.auth so
// downstream tenant helpers that read req.auth.* keep working.
const authenticateApiKey = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const fromHeader = header.startsWith('Bearer ') ? header.slice(7)
    : (req.headers['x-api-key'] || '');
  if (!fromHeader || !fromHeader.startsWith('nxw_')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid API key.' });
  }

  const ApiKey = req.tenantConn.model('ApiKey');
  const key = await ApiKey.findOne({ hashedKey: hashKey(fromHeader), isActive: true });
  if (!key) return res.status(401).json({ success: false, message: 'API key not found or revoked.' });
  if (key.expiresAt && new Date() > key.expiresAt) {
    return res.status(401).json({ success: false, message: 'API key has expired.' });
  }

  // Best-effort usage tracking (never blocks the request).
  key.lastUsed = new Date();
  key.requestCount = (key.requestCount || 0) + 1;
  key.save().catch(() => {});

  req.apiKey = key;
  req.apiPermissions = key.permissions || [];
  req.auth = { userId: key.createdBy, role: 'api', tenant: req.tenant?.subdomain, viaApiKey: true };
  next();
});

// Helper for route handlers: require a scope (or 'read'/'write' umbrella).
const requireScope = (scope) => (req, res, next) => {
  const perms = req.apiPermissions || [];
  const ok = perms.includes(scope)
    || (scope === 'read' && perms.length)                 // any key can read
    || (scope !== 'read' && perms.includes('write'));     // 'write' umbrella covers writes
  if (!ok) return res.status(403).json({ success: false, message: `This API key lacks the "${scope}" scope.` });
  next();
};

module.exports = { getApiKeys, createApiKey, revokeApiKey, authenticateApiKey, requireScope };
