const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFilter, dateWindow } = require('../modules/audit/audit.controller');
const { deriveAction } = require('../middleware/auditTrail');

// ---- dateWindow ----
test('dateWindow: from/to produce a bounded $gte/$lte window', () => {
  const w = dateWindow('2026-10-01', '2026-10-17');
  assert.ok(w.$gte instanceof Date && w.$lte instanceof Date);
  assert.equal(w.$gte.toISOString(), new Date('2026-10-01').toISOString());
});

test('dateWindow: a bare to-date is pushed to end-of-day (inclusive)', () => {
  const w = dateWindow(null, '2026-10-17');
  assert.equal(w.$lte.getHours(), 23);
  assert.equal(w.$lte.getMinutes(), 59);
  assert.equal(w.$lte.getSeconds(), 59);
});

test('dateWindow: a to-value that already has a time is left as-is', () => {
  const w = dateWindow(null, '2026-10-17T08:30:00Z');
  assert.equal(w.$lte.toISOString(), new Date('2026-10-17T08:30:00Z').toISOString());
});

test('dateWindow: no inputs (or invalid) yields null', () => {
  assert.equal(dateWindow(null, null), null);
  assert.equal(dateWindow('', ''), null);
  assert.equal(dateWindow('not-a-date', null), null);
});

// ---- buildFilter ----
test('buildFilter: empty query is an empty filter (matches all)', () => {
  assert.deepEqual(buildFilter({}), {});
});

test('buildFilter: actor filters on the string actor id', () => {
  assert.deepEqual(buildFilter({ actor: 'abc123' }), { 'actor.id': 'abc123' });
});

test('buildFilter: resource narrows to an action prefix "<resource>."', () => {
  const f = buildFilter({ resource: 'employee' });
  assert.ok(Array.isArray(f.$and) && f.$and.length === 1);
  assert.ok(f.$and[0].action instanceof RegExp);
  assert.equal(f.$and[0].action.source, '^employee\\.');
});

test('buildFilter: a dotted action matches exactly; a bare action is a prefix', () => {
  assert.equal(buildFilter({ action: 'employee.update' }).$and[0].action, 'employee.update');
  const prefix = buildFilter({ action: 'emp' }).$and[0].action;
  assert.ok(prefix instanceof RegExp);
  assert.equal(prefix.source, '^emp');
});

test('buildFilter: method maps to the stored HTTP method', () => {
  assert.equal(buildFilter({ method: 'post' }).method, 'POST');
  assert.equal(buildFilter({ method: 'DELETE' }).method, 'DELETE');
  // an unknown method is ignored
  assert.equal(buildFilter({ method: 'TRACE' }).method, undefined);
});

test('buildFilter: verb matches the action suffix when no method is given', () => {
  const f = buildFilter({ verb: 'delete' });
  assert.ok(f.action instanceof RegExp);
  assert.equal(f.action.source, '\\.delete$');
});

test('buildFilter: method wins over verb when both are present', () => {
  const f = buildFilter({ method: 'post', verb: 'delete' });
  assert.equal(f.method, 'POST');
  assert.equal(f.action, undefined);
});

test('buildFilter: impersonated flag filters platform "login-as" actions', () => {
  assert.equal(buildFilter({ impersonated: 'true' })['meta.impersonated'], true);
  assert.equal(buildFilter({ impersonated: '1' })['meta.impersonated'], true);
  assert.equal(buildFilter({ impersonated: 'false' })['meta.impersonated'], undefined);
});

test('buildFilter: free-text search is ReDoS-safe (metachars escaped) and multi-field', () => {
  const f = buildFilter({ q: 'a.b*(c)' });
  assert.ok(Array.isArray(f.$or));
  // every $or branch is a safe regex over the escaped literal
  const sources = f.$or.map((o) => Object.values(o)[0].source);
  for (const s of sources) assert.equal(s, 'a\\.b\\*\\(c\\)');
  // covers the human-facing fields
  const fields = f.$or.map((o) => Object.keys(o)[0]);
  assert.ok(fields.includes('summary') && fields.includes('actor.name') && fields.includes('path'));
});

test('buildFilter: filters compose (actor + resource + date window)', () => {
  const f = buildFilter({ actor: 'u1', resource: 'leave', from: '2026-10-01' });
  assert.equal(f['actor.id'], 'u1');
  assert.equal(f.$and[0].action.source, '^leave\\.');
  assert.ok(f.at.$gte instanceof Date);
});

// ---- deriveAction (middleware) — lock the resource.verb mapping the UI relies on ----
test('deriveAction: POST/PUT/PATCH/DELETE map to create/update/delete on the resource', () => {
  assert.equal(deriveAction('POST', '/api/employees'), 'employee.create');
  assert.equal(deriveAction('PUT', '/api/leave/requests/abc'), 'leave.update');
  assert.equal(deriveAction('PATCH', '/api/positions/1'), 'position.update');
  assert.equal(deriveAction('DELETE', '/api/documents/9'), 'document.delete');
});
