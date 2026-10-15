const { test } = require('node:test');
const assert = require('node:assert/strict');
const { escapeRegex, searchRegex } = require('../utils/searchRegex');

test('escapeRegex neutralises every regex metacharacter', () => {
  assert.equal(escapeRegex('a.b*c+?^${}()|[]\\'), 'a\\.b\\*c\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  assert.equal(escapeRegex('plain'), 'plain');
  assert.equal(escapeRegex(null), '');
});

test('searchRegex matches the literal text, not a pattern', () => {
  // "C++" must match the literal string, not be parsed as a quantifier.
  assert.ok(searchRegex('C++').test('C++ Developer'));
  assert.ok(!searchRegex('C++').test('C Developer'));
  // A dot is literal, not "any char".
  assert.ok(searchRegex('a.b').test('xa.by'));
  assert.ok(!searchRegex('a.b').test('axb'));
});

test('searchRegex is case-insensitive and trims', () => {
  assert.ok(searchRegex('  mensah ').test('Joseph MENSAH'));
});

test('a ReDoS-style payload is defused (treated as a literal)', () => {
  // Would be catastrophic as a real pattern; as a literal it just fails fast.
  const rx = searchRegex('(a+)+$');
  const start = Date.now();
  rx.test('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaX');
  assert.ok(Date.now() - start < 50);
  assert.ok(rx.test('x(a+)+$y'));   // matches the literal characters
});
