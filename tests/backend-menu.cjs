'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dispatchEditorCommand } = require('../electron/main.cjs');

test('focused text uses native edit history and clipboard commands without canvas actions', async () => {
  const calls = [], expressions = [];
  const contents = { isDestroyed: () => false, executeJavaScript: async (expression) => { expressions.push(expression); return true; } };
  for (const method of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) contents[method] = () => calls.push(method);
  for (const action of ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']) {
    assert.equal(await dispatchEditorCommand(contents, action, () => assert.fail('Focused input must not edit the canvas.')), true);
  }
  assert.deepEqual(calls, ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
  assert.ok(expressions.every((expression) => expression.includes("matches('input,textarea')") && expression.includes('isContentEditable')));
});

test('canvas commands notify only the editor, including paste when an OS image is present', async () => {
  const calls = [];
  const contents = { isDestroyed: () => false, executeJavaScript: async () => false, paste: () => assert.fail('Canvas paste must use the sanitized bridge.') };
  for (const action of ['undo', 'redo', 'copy', 'cut', 'paste', 'select-all']) {
    assert.equal(await dispatchEditorCommand(contents, action, (received) => calls.push(received)), true);
  }
  assert.deepEqual(calls, ['undo', 'redo', 'copy', 'cut', 'paste', 'select-all']);
});

test('closing renderers and unknown commands cannot receive native or canvas editing', async () => {
  let destroyed = false;
  const contents = { isDestroyed: () => destroyed, executeJavaScript: async () => { destroyed = true; return true; }, undo: () => assert.fail('Renderer closed during focus detection.') };
  assert.equal(await dispatchEditorCommand(contents, 'undo', () => assert.fail('Closing renderer')), false);
  assert.equal(await dispatchEditorCommand(contents, 'paste', () => assert.fail('Closing renderer')), false);
  assert.equal(await dispatchEditorCommand({ isDestroyed: () => false }, 'untrusted-command', () => assert.fail('Unknown action')), false);
  assert.equal(await dispatchEditorCommand({ isDestroyed: () => false }, 'constructor', () => assert.fail('Inherited property')), false);
  assert.equal(await dispatchEditorCommand({ isDestroyed: () => false, executeJavaScript: async () => { throw new Error('Renderer gone'); } }, 'undo', () => assert.fail('Closing renderer')), false);
});
