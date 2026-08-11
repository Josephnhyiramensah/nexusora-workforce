// Resolve the tenant for this request and attach its DB connection + record.
// SECURITY: tenant identity comes from the verified token (req.auth.tenant) or the request
// host subdomain — NEVER from a client-supplied body/query value. No hard-coded fallback.
const env = require('../config/env');
const { getMasterConnection, getTenantConnection } = require('../config/db');

function subdomainFromHost(host) {
  if (!host) return null;
  const name = host.split(':')[0];
  const parts = name.split('.');
  // e.g. acme.nexusora-workforce.app -> 'acme'; ignore localhost / bare hosts
  if (parts.length < 3) return null;
  const sub = parts[0].toLowerCase();
  if (['www', 'api', 'app'].includes(sub)) return null;
  return sub;
}

async function resolveTenant(req, res, next) {
  try {
    // 1) trusted sources only
    let subdomain = (req.auth && req.auth.tenant) || subdomainFromHost(req.headers.host);
    // dev convenience: allow an explicit header ONLY in non-production
    if (!subdomain && env.NODE_ENV !== 'production') {
      subdomain = req.headers['x-tenant-subdomain'];
    }
    if (!subdomain) return res.status(400).json({ message: 'Tenant could not be resolved' });

    const master = getMasterConnection();
    if (!master) return res.status(503).json({ message: 'Registry unavailable' });

    const Tenant = master.model('Tenant');
    const tenant = await Tenant.findOne({ subdomain });
    if (!tenant) return res.status(404).json({ message: 'Unknown tenant' });
    if (tenant.status === 'suspended') return res.status(403).json({ message: 'Tenant suspended' });

    req.tenant = tenant;
    req.tenantConn = await getTenantConnection(tenant.dbName);
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { resolveTenant, subdomainFromHost };
