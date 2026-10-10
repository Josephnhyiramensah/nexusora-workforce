// Resolve the tenant for this request and attach its DB connection + record.
// SECURITY: tenant identity comes from the verified token (req.auth.tenant) or the request
// host subdomain — NEVER from a client-supplied body/query value. No hard-coded fallback.
const env = require('../config/env');
const { getMasterConnection, getTenantConnection } = require('../config/db');

// Tenant records change rarely but `resolveTenant` runs on EVERY request, so an
// uncached lookup adds a full master-DB round-trip to every API call — costly on
// a high-latency link. Cache the (lean) tenant record briefly so repeated calls
// skip that round-trip. TTL-bounded so status changes (e.g. suspension) still
// take effect quickly; clearTenantCache lets admin ops invalidate immediately.
const TENANT_TTL_MS = Number(process.env.TENANT_CACHE_TTL_MS || 60000);
const tenantCache = new Map(); // subdomain -> { tenant, exp }

function clearTenantCache(subdomain) {
  if (subdomain) tenantCache.delete(String(subdomain).toLowerCase());
  else tenantCache.clear();
}

async function lookupTenant(master, subdomain) {
  const key = String(subdomain).toLowerCase();
  const now = Date.now();
  const hit = tenantCache.get(key);
  if (hit && hit.exp > now) return hit.tenant;
  const tenant = await master.model('Tenant').findOne({ subdomain: key }).lean();
  if (tenant) tenantCache.set(key, { tenant, exp: now + TENANT_TTL_MS });
  return tenant;
}

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

    const t0 = Date.now();
    const tenant = await lookupTenant(master, subdomain);
    if (!tenant) return res.status(404).json({ message: 'Unknown tenant' });
    if (tenant.status === 'suspended') return res.status(403).json({ message: 'Tenant suspended' });

    req.tenant = tenant;
    req.tenantConn = await getTenantConnection(tenant.dbName);
    req._tenantMs = Date.now() - t0;   // for the perf logger
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { resolveTenant, subdomainFromHost, clearTenantCache };
