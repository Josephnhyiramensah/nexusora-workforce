#!/usr/bin/env node
/* =====================================================================
   db-doctor — diagnose why the master DB won't connect.
   Reads the SAME .env and builds the SAME URI the app uses, then runs
   DNS → TCP → driver checks and prints a single plain-English verdict.
   Run from the server/ directory:   node scripts/db-doctor.js
   ===================================================================== */
const dns = require('dns').promises;
const net = require('net');
const mongoose = require('mongoose');

const env = require('../config/env');               // loads .env exactly like the app
const { uriForDb, parseCluster } = require('../config/db');

const C = { red: '\x1b[31m', green: '\x1b[32m', amber: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const ok = (s) => `${C.green}✓${C.reset} ${s}`;
const bad = (s) => `${C.red}✗${C.reset} ${s}`;
const warn = (s) => `${C.amber}!${C.reset} ${s}`;
const redact = (u) => String(u).replace(/\/\/([^@]+)@/, '//****:****@');

// Resolve the master URI the way config/db.masterUri() does (not exported).
function masterUri() {
  if (env.MASTER_DB_URI) return env.MASTER_DB_URI;
  if (!env.MONGO_CLUSTER_URI) return '';
  return uriForDb(`${env.TENANT_DB_PREFIX}master`);
}

// Try to open a TCP socket to host:port within `ms`. Resolves a status string.
function tcpProbe(host, port, ms = 6000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (status) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(status); } };
    sock.setTimeout(ms);
    sock.once('connect', () => finish('open'));
    sock.once('timeout', () => finish('timeout'));
    sock.once('error', (e) => finish(e.code || 'error'));
    sock.connect(port, host);
  });
}

(async () => {
  console.log(`\n${C.bold}Nexusora Workforce — DB doctor${C.reset}\n${C.dim}${'─'.repeat(52)}${C.reset}`);

  const uri = masterUri();
  if (!uri) {
    console.log(bad('No MONGO_CLUSTER_URI (or MASTER_DB_URI) found in .env.'));
    console.log(`  ${C.dim}Set MONGO_CLUSTER_URI in server/.env, then re-run.${C.reset}\n`);
    process.exit(1);
  }

  const p = parseCluster(uri);
  if (!p) { console.log(bad(`Could not parse the URI: ${redact(uri)}`)); process.exit(1); }

  const isSrv = /\+srv/i.test(p.prefix);
  const hostsPart = p.hostPart.split('@').pop();          // strip user:pass@
  const hosts = hostsPart.split(',').map((h) => h.trim()).filter(Boolean);

  console.log(`Form:       ${isSrv ? `${C.amber}SRV${C.reset} (mongodb+srv://)` : `${C.green}legacy${C.reset} (direct hosts)`}`);
  console.log(`URI:        ${redact(uri)}`);
  console.log(`DB target:  ${env.TENANT_DB_PREFIX}master`);
  console.log(`Hosts:      ${hosts.join('  ')}\n`);

  // ---- 1) DNS ----
  console.log(`${C.bold}1. DNS${C.reset}`);
  let dnsOk = true;
  if (isSrv) {
    const srvName = `_mongodb._tcp.${hosts[0]}`;
    try {
      const recs = await dns.resolveSrv(srvName);
      console.log(ok(`SRV ${srvName} → ${recs.length} node(s): ${recs.map((r) => r.name + ':' + r.port).join(', ')}`));
      // replace the SRV seed with the real nodes for the TCP step
      hosts.length = 0; recs.forEach((r) => hosts.push(`${r.name}:${r.port}`));
    } catch (e) {
      dnsOk = false;
      console.log(bad(`SRV lookup failed (${e.code || e.message}).`));
      console.log(`  ${C.dim}Your network is blocking SRV DNS — switch .env to the legacy (non-SRV) string.${C.reset}`);
    }
  } else {
    for (const hp of hosts) {
      const host = hp.split(':')[0];
      try { const a = await dns.lookup(host); console.log(ok(`${host} → ${a.address}`)); }
      catch (e) { dnsOk = false; console.log(bad(`${host} does not resolve (${e.code || e.message}) — stale/incorrect host in the string.`)); }
    }
  }

  // ---- 2) TCP reachability (port 27017) ----
  console.log(`\n${C.bold}2. TCP :27017${C.reset}`);
  let anyOpen = false, anyRefused = false, anyTimeout = false;
  for (const hp of hosts) {
    const [host, portStr] = hp.split(':');
    const port = parseInt(portStr, 10) || 27017;
    const r = await tcpProbe(host, port);
    if (r === 'open') { anyOpen = true; console.log(ok(`${host}:${port} reachable`)); }
    else if (r === 'ECONNREFUSED') { anyRefused = true; console.log(bad(`${host}:${port} refused the connection`)); }
    else if (r === 'timeout' || r === 'ETIMEDOUT') { anyTimeout = true; console.log(bad(`${host}:${port} timed out (no response)`)); }
    else { console.log(bad(`${host}:${port} ${r}`)); }
  }

  // ---- 3) Driver connect (authoritative) ----
  console.log(`\n${C.bold}3. Driver handshake${C.reset}`);
  let driverErr = null;
  const conn = mongoose.createConnection(uri, { family: 4, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
  try { await conn.asPromise(); console.log(ok('Connected and authenticated.')); await conn.close(); }
  catch (e) { driverErr = e; console.log(bad(e.message)); try { await conn.close(); } catch {} }

  // ---- Verdict ----
  console.log(`\n${C.bold}Verdict${C.reset}\n${C.dim}${'─'.repeat(52)}${C.reset}`);
  const msg = driverErr ? String(driverErr.message || '') : '';
  if (!driverErr) {
    console.log(ok('The database is reachable. If the app still fails, the app process is loading a different .env — check you run it from server/ and restarted nodemon after editing .env.'));
  } else if (!dnsOk && isSrv) {
    console.log(warn('SRV DNS is blocked on this network. FIX: switch MONGO_CLUSTER_URI in server/.env to the legacy string (Atlas → Connect → Drivers → "non-SRV" / older driver). Then restart.'));
  } else if (!dnsOk) {
    console.log(warn('A host in your legacy string no longer resolves — Atlas rotated it. FIX: re-copy a fresh non-SRV string from Atlas → Connect and replace MONGO_CLUSTER_URI. Then restart.'));
  } else if (anyRefused && !anyOpen) {
    console.log(warn('Hosts resolve but refuse the port — this is a PAUSED cluster. FIX: Atlas → Database → Clusters → Resume, wait ~2 min, re-run this.'));
  } else if (/authentication failed|bad auth|AuthenticationFailed|SCRAM/i.test(msg)) {
    console.log(warn('Network is fine; the username/password is wrong or the DB user lacks access. FIX: Atlas → Database Access → check the user, reset the password, update MONGO_CLUSTER_URI credentials.'));
  } else if (anyOpen && /Server selection timed out|no primary|ReplicaSetNoPrimary|getaddrinfo/i.test(msg)) {
    console.log(warn('Ports are open but the replica set / topology never settled — the legacy string\'s replicaSet name or member hosts are stale. FIX: re-copy a fresh non-SRV string from Atlas → Connect (it carries the current replicaSet + hosts), or use SRV if your network allows it (step 1 shows whether SRV resolves).'));
  } else if ((anyTimeout || !anyOpen)) {
    console.log(warn('Hosts resolve but nothing answers on :27017 — either the cluster is paused, or an outbound firewall on THIS machine is blocking 27017. FIX: confirm the cluster is running (Atlas → Clusters), then check egress firewall rules for port 27017.'));
  } else {
    console.log(warn('Unclassified failure — see the driver error above.'));
  }
  console.log('');
  process.exit(driverErr ? 1 : 0);
})().catch((e) => { console.error('db-doctor crashed:', e); process.exit(2); });
