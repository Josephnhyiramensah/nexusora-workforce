// Multi-tenant connection factory.
// Supports BOTH connection-string styles via MONGO_CLUSTER_URI:
//   - SRV:      mongodb+srv://user:pass@cluster.mongodb.net
//   - Non-SRV:  mongodb://user:pass@host1:27017,host2:27017,host3:27017/?replicaSet=...&authSource=admin
// For non-SRV we must PRESERVE the ?query options (replicaSet/authSource/ssl), so we split the
// base (hosts+creds) from the options and re-attach the options after inserting the DB name.
const mongoose = require('mongoose');
const env = require('./env');
const { registerAllModels } = require('../models/registerModels');

let masterConn = null;
const tenantConns = new Map();
// Connection tuning for a high-latency / restricted network.
//
// family: 4 is the important one. On a restricted link an idle TCP socket to
// Atlas gets dropped by NAT; the next request must reconnect, and WITHOUT this
// the driver tries an IPv6 route first and hangs until it times out before
// falling back to IPv4 — that is the 20–45s stall on every click. Forcing IPv4
// removes it (this is what the Books app does, and why Books is fast on the same
// cluster). Shorter selection/connect timeouts mean a genuine stall fails and
// retries in ~10s instead of hanging ~30s. A warm pool avoids reopening sockets.
const CONN_OPTS = {
  family: 4,                         // force IPv4 — avoids IPv6-first reconnect stalls
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 1,                    // keep one warm connection so clicks don't reopen sockets
  maxIdleTimeMS: 0,                  // never idle-close it
  heartbeatFrequencyMS: 15000,
};

// Split a cluster URI into { scheme, creds, hosts, query } without losing options.
function parseCluster(uri) {
  if (!uri) return null;
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^/?]+)(?:\/[^?]*)?(?:\?(.*))?$/i);
  if (!m) return null;
  return { prefix: m[1], hostPart: m[2], query: m[3] || '' };
}

// Build a full URI for a specific database name, keeping the original query options.
function uriForDb(dbName) {
  const raw = env.MONGO_CLUSTER_URI || env.MASTER_DB_URI;
  const p = parseCluster(raw);
  if (!p) throw new Error('Invalid MONGO_CLUSTER_URI');
  const isSrv = /\+srv/i.test(p.prefix);
  // Ensure sensible defaults for non-SRV; keep whatever Atlas gave us otherwise.
  let query = p.query;
  if (!isSrv && !/retryWrites=/i.test(query)) {
    query += (query ? '&' : '') + 'retryWrites=true&w=majority';
  } else if (isSrv && !query) {
    query = 'retryWrites=true&w=majority';
  }
  return `${p.prefix}${p.hostPart}/${dbName}${query ? '?' + query : ''}`;
}

function masterUri() {
  if (env.MASTER_DB_URI) return env.MASTER_DB_URI;   // explicit full override wins
  if (!env.MONGO_CLUSTER_URI) return '';
  return uriForDb(`${env.TENANT_DB_PREFIX}master`);
}

async function connectMaster() {
  if (masterConn) return masterConn;
  const uri = masterUri();
  if (!uri) { console.warn('[db] No Mongo URI set — running without master DB (dev bootstrap).'); return null; }
  // Create the connection ONCE and keep the reference, even if the first connect
  // attempt fails (e.g. Atlas paused or the IP isn't whitelisted at boot). The
  // driver's topology monitor keeps trying in the background, so when the cluster
  // comes back the connection heals on its own — the server recovers WITHOUT a
  // restart. Reads are gated on readyState (see getMasterConnection) so requests
  // fail fast with a clean 503 while it's down instead of hanging.
  masterConn = mongoose.createConnection(uri, CONN_OPTS);
  registerMasterModels(masterConn);
  masterConn.on('connected', () => console.log(`[db] Master DB connected: ${env.TENANT_DB_PREFIX}master`));
  masterConn.on('disconnected', () => console.warn('[db] Master DB disconnected — auto-reconnecting…'));
  masterConn.on('error', (e) => console.warn('[db] Master DB error:', e.message));
  try { await masterConn.asPromise(); }
  catch (e) { console.warn(`[db] Master DB not reachable at startup — retrying in background: ${e.message}`); }
  return masterConn;
}
// Returns the master connection only when it is actually usable; null while it is
// down/connecting, so callers emit a fast 503 instead of waiting on a timeout.
function getMasterConnection() { return masterConn && masterConn.readyState === 1 ? masterConn : null; }
function masterReady() { return !!masterConn && masterConn.readyState === 1; }
function registerMasterModels(conn) {
  const Tenant = require('../models/master/Tenant');
  const PlatformUser = require('../models/master/PlatformUser');
  const Invoice = require('../models/master/Invoice');
  const Pricing = require('../models/master/Pricing');
  const AuditLog = require('../models/tenant/AuditLog');   // also used at platform level
  const Broadcast = require('../models/master/Broadcast');
  const PlatformSettings = require('../models/master/PlatformSettings');
  if (!conn.models.Tenant) conn.model('Tenant', Tenant.schema);
  if (!conn.models.PlatformUser) conn.model('PlatformUser', PlatformUser.schema);
  if (!conn.models.Invoice) conn.model('Invoice', Invoice.schema);
  if (!conn.models.Pricing) conn.model('Pricing', Pricing.schema);
  if (!conn.models.AuditLog) conn.model('AuditLog', AuditLog.schema);
  if (!conn.models.Broadcast) conn.model('Broadcast', Broadcast.schema);
  if (!conn.models.PlatformSettings) conn.model('PlatformSettings', PlatformSettings.schema);
}
async function getTenantConnection(dbName) {
  if (!dbName) throw new Error('getTenantConnection: dbName required');
  if (tenantConns.has(dbName)) return tenantConns.get(dbName);
  const conn = await mongoose.createConnection(uriForDb(dbName), CONN_OPTS).asPromise();
  registerAllModels(conn);
  tenantConns.set(dbName, conn);
  console.log(`[db] Tenant connection opened: ${dbName}`);
  return conn;
}
module.exports = { connectMaster, getMasterConnection, masterReady, getTenantConnection, uriForDb, parseCluster };
