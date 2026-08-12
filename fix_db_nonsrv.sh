#!/usr/bin/env bash
# Nexusora Workforce - hotfix: db.js supports non-SRV (legacy) Atlas connection strings.
# Run ONCE from the project root:  bash fix_db_nonsrv.sh
set -e
echo "  writing server/config/db.js"
cat > server/config/db.js << 'NEXUSORA_EOF'
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
  masterConn = await mongoose.createConnection(uri).asPromise();
  registerMasterModels(masterConn);
  console.log(`[db] Master DB connected: ${env.TENANT_DB_PREFIX}master`);
  return masterConn;
}
function getMasterConnection() { return masterConn; }
function masterReady() { return !!masterConn && masterConn.readyState === 1; }
function registerMasterModels(conn) {
  const Tenant = require('../models/master/Tenant');
  const PlatformUser = require('../models/master/PlatformUser');
  if (!conn.models.Tenant) conn.model('Tenant', Tenant.schema);
  if (!conn.models.PlatformUser) conn.model('PlatformUser', PlatformUser.schema);
}
async function getTenantConnection(dbName) {
  if (!dbName) throw new Error('getTenantConnection: dbName required');
  if (tenantConns.has(dbName)) return tenantConns.get(dbName);
  const conn = await mongoose.createConnection(uriForDb(dbName)).asPromise();
  registerAllModels(conn);
  tenantConns.set(dbName, conn);
  console.log(`[db] Tenant connection opened: ${dbName}`);
  return conn;
}
module.exports = { connectMaster, getMasterConnection, masterReady, getTenantConnection, uriForDb, parseCluster };
NEXUSORA_EOF

echo
echo "db.js updated for non-SRV strings."
