'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runClipboardRegression } = require('../electron/native-smoke.cjs');

test('explicit native clipboard acceptance skips without a confirmed backup and performs no fixture writes', async () => {
  let checks = 0;
  const renderer = { evaluate: async () => assert.fail('No clipboard fixture may be written before preservation.') };
  assert.equal((await runClipboardRegression(renderer, null)).skipped, true);
  const report = await runClipboardRegression(renderer, { evaluate: async () => { checks++; return { available: false, reason: 'Unavailable preservation API.' }; } });
  assert.deepEqual(report, { skipped: true, reason: 'Unavailable preservation API.' });
  assert.equal(checks, 1);
});

test('a failed native bridge assertion still restores privately retained original ClipboardItems', async () => {
  let restored = 0, rendererChecks = 0;
  const main = { evaluate: async (expression) => {
    if (expression.includes('delete globalThis.__visroSmokeClipboardBackup')) { restored++; return true; }
    return { available: true };
  } };
  const renderer = { evaluate: async () => { rendererChecks++; return false; } };
  await assert.rejects(runClipboardRegression(renderer, main), /failed during bridge availability/);
  assert.equal(rendererChecks, 1);
  assert.equal(restored, 1);
});

test('unexpected clipboard changes never include external contents in assertion output', async () => {
  let calls = 0, restored = 0;
  const privateText = 'Unexpected private external clipboard text';
  const main = { evaluate: async (expression) => {
    if (expression.includes('delete globalThis.__visroSmokeClipboardBackup')) { restored++; return true; }
    return { available: true };
  } };
  const renderer = { evaluate: async () => { calls++; return calls <= 2 ? true : { kind: 'text', text: privateText }; } };
  await assert.rejects(runClipboardRegression(renderer, main), (error) => /failed during editable object copy/.test(error.message) && !error.message.includes(privateText));
  assert.equal(restored, 1);
});

test('unconfirmed OS restoration preserves the backup process rather than reporting success or killing it', async () => {
  let restorationAttempts = 0;
  const main = { evaluate: async (expression) => {
    if (expression.includes('delete globalThis.__visroSmokeClipboardBackup')) { restorationAttempts++; return false; }
    return { available: true };
  } };
  await assert.rejects(runClipboardRegression({ evaluate: async () => false }, main), (error) => error.preserveNativeProcess === true && /restoration could not be confirmed/.test(error.message));
  assert.equal(restorationAttempts, 3);
});
