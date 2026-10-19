#!/usr/bin/env node
/* =====================================================================
   db-opts-matrix — the DB is reachable (db-doctor proves it) but the app
   can't connect. The only difference is the connection OPTIONS. This tries
   the SAME master URI under several option sets, a few times each, and
   prints which sets connect. Read-only: opens a connection, closes it.
   Run from server/:   node scripts/db-opts-matrix.js
   ===================================================================== */
const mongoose = require('mongoose');
const env = require('../config/env');
const { uriForDb } = require('../config/db');

const ROUNDS = 2;          // attempts per option set
const HARD_MS = 12000;     // give each attempt a hair over the app's 10s window

// The app's real CONN_OPTS, copied verbatim from config/db.js.
const APP_OPTS = {
  family: 4, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 15000, socketTimeoutMS: 45000,
  maxPoolSize: 10, minPoolSize: 1, maxIdleTimeMS: 0, heartbeatFrequencyMS: 15000,
};

// Option sets to compare. Each isolates one suspect against the app's set.
const SETS = [
  ['minimal (doctor-style)',        { family: 4, serverSelectionTimeoutMS: 10000 }],
  ['full CONN_OPTS (the app)',      { ...APP_OPTS }],
  ['app MINUS minPoolSize+maxIdle', { ...APP_OPTS, minPoolSize: undefined, maxIdleTimeMS: undefined }],
  ['app MINUS heartbeatFrequency',  { ...APP_OPTS, heartbeatFrequencyMS: undefined }],
  ['minimal PLUS minPoolSize:1',    { family: 4, serverSelectionTimeoutMS: 10000, minPoolSize: 1, maxIdleTimeMS: 0 }],
];

function clean(o) { const c = {}; for (const k of Object.keys(o)) if (o[k] !== undefined) c[k] = o[k]; return c; }

function attempt(uri, opts) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let conn, settled = false;
    const done = (okFlag, note) => { if (settled) return; settled = true; const ms = Date.now() - t0; try { conn && conn.close(); } catch {} resolve({ ok: okFlag, ms, note }); };
    const timer = setTimeout(() => done(false, 'hard-timeout'), HARD_MS);
    try {
      conn = mongoose.createConnection(uri, clean(opts));
      conn.asPromise().then(() => { clearTimeout(timer); done(true, ''); })
        .catch((e) => { clearTimeout(timer); done(false, (e.message || '').split('\n')[0].slice(0, 60)); });
    } catch (e) { clearTimeout(timer); done(false, e.message.slice(0, 60)); }
  });
}

(async () => {
  const uri = env.MASTER_DB_URI || (env.MONGO_CLUSTER_URI ? uriForDb(`${env.TENANT_DB_PREFIX}master`) : '');
  if (!uri) { console.log('No MONGO_CLUSTER_URI in .env — run from server/.'); process.exit(1); }

  console.log(`\nDB connection-options matrix  (${ROUNDS} attempts each, ${HARD_MS / 1000}s cap)`);
  console.log('─'.repeat(66));

  const summary = [];
  for (const [label, opts] of SETS) {
    const results = [];
    for (let i = 0; i < ROUNDS; i++) results.push(await attempt(uri, opts));
    const passes = results.filter((r) => r.ok).length;
    const times = results.map((r) => (r.ok ? `${r.ms}ms` : (r.note || 'fail'))).join(', ');
    const verdict = passes === ROUNDS ? '  OK  ' : passes === 0 ? ' FAIL ' : ' FLAKY';
    console.log(`[${verdict}] ${label.padEnd(30)} ${passes}/${ROUNDS}   ${times}`);
    summary.push({ label, passes });
  }

  console.log('─'.repeat(66));
  const minimal = summary.find((s) => s.label.startsWith('minimal (doctor'));
  const full = summary.find((s) => s.label.startsWith('full CONN_OPTS'));
  const noPool = summary.find((s) => s.label.startsWith('app MINUS minPool'));
  const plusPool = summary.find((s) => s.label.startsWith('minimal PLUS minPool'));

  console.log('\nVerdict:');
  if (full && full.passes === ROUNDS) {
    console.log('  The app options connect fine here — the earlier failure was transient/flaky.');
    console.log('  FIX: add a short retry-with-backoff on the first connect (rides out the flake).');
  } else if (noPool && noPool.passes === ROUNDS && full && full.passes < ROUNDS) {
    console.log('  Dropping minPoolSize + maxIdleTimeMS fixes it → the eager always-on pool is the culprit');
    console.log('  on this network. FIX: remove minPoolSize/maxIdleTimeMS (or set minPoolSize:0) in CONN_OPTS.');
  } else if (plusPool && plusPool.passes < ROUNDS && minimal && minimal.passes === ROUNDS) {
    console.log('  Adding minPoolSize:1 to the minimal set breaks it → minPoolSize is the culprit.');
    console.log('  FIX: set minPoolSize:0 in CONN_OPTS.');
  } else if (minimal && minimal.passes === ROUNDS && full && full.passes < ROUNDS) {
    console.log('  Minimal works, full fails, but no single toggle above flipped it cleanly —');
    console.log('  likely flaky + option-sensitive. FIX: minPoolSize:0 AND retry-with-backoff.');
  } else if (minimal && minimal.passes < ROUNDS) {
    console.log('  Even the minimal set is flaky → the network path to Atlas is the real issue,');
    console.log('  not the options. FIX: retry-with-backoff, and check the dev network / VPN.');
  } else {
    console.log('  Mixed result — paste this table back and I\'ll read it.');
  }
  console.log('');
  process.exit(0);
})().catch((e) => { console.error('matrix crashed:', e); process.exit(2); });
