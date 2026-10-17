const { test } = require('node:test');
const assert = require('node:assert/strict');
const { errorHandler } = require('../middleware/errorHandler');

function fakeRes(initialStatus = 200) {
  return {
    statusCode: initialStatus, _status: null, _json: null,
    status(c) { this._status = c; this.statusCode = c; return this; },
    json(b) { this._json = b; return this; },
  };
}

// Run fn with NODE_ENV set to `envVal`, console.error silenced, then restore.
function withEnv(envVal, fn) {
  const prevEnv = process.env.NODE_ENV; const prevErr = console.error;
  process.env.NODE_ENV = envVal; console.error = () => {};
  try { fn(); } finally { process.env.NODE_ENV = prevEnv; console.error = prevErr; }
}

test('5xx errors are masked in production (no internal detail leaked)', () => {
  withEnv('production', () => {
    const res = fakeRes();   // 200 -> defaults to 500
    errorHandler(new Error('Could not connect to any servers in your MongoDB Atlas cluster'),
      { method: 'POST', originalUrl: '/api/auth/login' }, res);
    assert.equal(res._status, 500);
    assert.equal(res._json.message, 'Something went wrong on our end. Please try again.');
    assert.ok(!res._json.stack);
  });
});

test('4xx messages are preserved (meant for the user)', () => {
  withEnv('production', () => {
    const res = fakeRes(400);
    errorHandler(new Error('Email already exists'), { method: 'POST', originalUrl: '/api/auth/users' }, res);
    assert.equal(res._status, 400);
    assert.equal(res._json.message, 'Email already exists');
  });
});

test('development surfaces the real message + stack', () => {
  withEnv('development', () => {
    const res = fakeRes();
    errorHandler(new Error('boom'), { method: 'GET', originalUrl: '/x' }, res);
    assert.equal(res._json.message, 'boom');
    assert.ok(res._json.stack);
  });
});
