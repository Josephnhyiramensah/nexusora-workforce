// Multi-tenant connection factory.
// You only need MONGO_CLUSTER_URI set. It may be pasted with a trailing /db or ?query
// (e.g. a Books string) — we sanitize it to the cluster base and append the correct
// Workforce database name ourselves, so Books databases are never touched.
const mongoose = require('mongoose');
const env = require('./env');
const { registerAllModels } = require('../models/registerModels');

let masterConn = null;
const tenantConns = new Map();

function clusterBase(uri) {
  if (!uri) return '';
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)/i);
  return m ? m[1] : uri.replace(/[/?].*$/, '');
}
function masterUri() {
  if (env.MASTER_DB_URI) return env.MASTER_DB_URI;
  const base = clusterBase(env.MONGO_CLUSTER_URI);
  if (!base) return '';
  return `${base}/${env.TENANT_DB_PREFIX}master?retryWrites=true&w=majority`;
}
function tenantUri(dbName) {
  const base = clusterBase(env.MONGO_CLUSTER_URI || env.MASTER_DB_URI);
  if (!base) throw new Error('No Mongo cluster URI configured');
  return `${base}/${dbName}?retryWrites=true&w=majority`;
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
  const conn = await mongoose.createConnection(tenantUri(dbName)).asPromise();
  registerAllModels(conn);
  tenantConns.set(dbName, conn);
  console.log(`[db] Tenant connection opened: ${dbName}`);
  return conn;
}
module.exports = { connectMaster, getMasterConnection, masterReady, getTenantConnection, clusterBase };
