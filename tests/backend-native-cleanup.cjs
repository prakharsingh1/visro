'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { removeSmokeProfile } = require('../electron/native-smoke.cjs');

test('native smoke cleanup enables bounded retries for Chromium helper writes after exit', async () => {
  let request;
  await removeSmokeProfile('/tmp/visro-owned-smoke-profile', async (directory, options) => { request = { directory, options }; });
  assert.equal(request.directory, '/tmp/visro-owned-smoke-profile');
  assert.equal(request.options.recursive, true);
  assert.equal(request.options.force, true);
  assert.ok(request.options.maxRetries > 0 && request.options.maxRetries <= 20);
  assert.ok(request.options.retryDelay > 0 && request.options.retryDelay <= 250);
});

test('native smoke cleanup still rejects a genuine filesystem failure', async () => {
  const failure = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
  await assert.rejects(removeSmokeProfile('/tmp/visro-owned-smoke-profile', async () => { throw failure; }), (error) => error === failure);
});
