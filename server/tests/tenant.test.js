const { test } = require('node:test');
const assert = require('node:assert/strict');
const { subdomainFromHost } = require('../middleware/tenant');

const BASE = 'nexusoraworkforce.com';

test('base-domain mode: tenant subdomain is resolved from the host', () => {
  assert.equal(subdomainFromHost('acme.nexusoraworkforce.com', BASE), 'acme');
  assert.equal(subdomainFromHost('koinonia-gold.nexusoraworkforce.com', BASE), 'koinonia-gold');
  assert.equal(subdomainFromHost('ACME.NexusoraWorkforce.com', BASE), 'acme'); // case-insensitive
  assert.equal(subdomainFromHost('acme.nexusoraworkforce.com:443', BASE), 'acme'); // port stripped
});

test('base-domain mode: apex and reserved labels have no tenant', () => {
  assert.equal(subdomainFromHost('nexusoraworkforce.com', BASE), null);
  assert.equal(subdomainFromHost('www.nexusoraworkforce.com', BASE), null);
  assert.equal(subdomainFromHost('app.nexusoraworkforce.com', BASE), null);
  assert.equal(subdomainFromHost('api.nexusoraworkforce.com', BASE), null);
  assert.equal(subdomainFromHost('admin.nexusoraworkforce.com', BASE), null);
});

test('a host that is not under the base domain yields no tenant', () => {
  assert.equal(subdomainFromHost('acme.someoneelse.com', BASE), null); // not our domain
});

test('dev hosts never resolve a tenant (field-based login instead)', () => {
  assert.equal(subdomainFromHost('localhost', BASE), null);
  assert.equal(subdomainFromHost('localhost:5173', BASE), null);
  assert.equal(subdomainFromHost('127.0.0.1', BASE), null);
  assert.equal(subdomainFromHost('', BASE), null);
});

test('no base domain configured: fall back to first-label heuristic (3+ parts)', () => {
  assert.equal(subdomainFromHost('acme.example.co.uk', ''), 'acme');
  assert.equal(subdomainFromHost('example.com', ''), null);   // 2 parts → none
  assert.equal(subdomainFromHost('www.example.com', ''), null); // reserved
});
