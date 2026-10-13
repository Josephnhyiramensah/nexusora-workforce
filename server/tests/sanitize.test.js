const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clean, sanitize } = require('../middleware/sanitize');

test('strips $-operator keys (NoSQL injection)', () => {
  const body = { email: { $gt: '' }, password: 'x' };
  clean(body);
  assert.deepEqual(body, { email: {}, password: 'x' }); // $gt removed → email can't become an operator query
});

test('strips dotted keys (path traversal)', () => {
  const body = { 'a.b': 1, normal: 2 };
  clean(body);
  assert.deepEqual(body, { normal: 2 });
});

test('cleans nested objects and arrays', () => {
  const body = { filter: { $where: 'x', ok: 1 }, list: [{ $ne: 1 }, { keep: 2 }] };
  clean(body);
  assert.deepEqual(body, { filter: { ok: 1 }, list: [{}, { keep: 2 }] });
});

test('leaves ordinary values untouched (dotted VALUES are fine)', () => {
  const body = { map: 'employment.department', amount: 300, nested: { role: 'admin' } };
  clean(body);
  assert.deepEqual(body, { map: 'employment.department', amount: 300, nested: { role: 'admin' } });
});

test('sanitize middleware cleans body/query/params and calls next', () => {
  const req = { body: { $gt: 1, ok: 2 }, query: { 'a.b': 1 }, params: { id: 'x' } };
  let nexted = false;
  sanitize(req, {}, () => { nexted = true; });
  assert.deepEqual(req.body, { ok: 2 });
  assert.deepEqual(req.query, {});
  assert.deepEqual(req.params, { id: 'x' });
  assert.equal(nexted, true);
});
