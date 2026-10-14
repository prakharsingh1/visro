'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePrintDocument, renderDocumentPDF, PRINT_CSP, MAX_DOCUMENT_BYTES } = require('../electron/print.cjs');

test('PDF print inputs have bounded content and sanitized filenames', () => {
  assert.deepEqual(validatePrintDocument({ html: '<h1>Hello</h1>', name: '../../Report:*?.pdf' }), { html: '<h1>Hello</h1>', name: 'Report' });
  assert.throws(() => validatePrintDocument({ html: ' ' }), /choose a document/i);
  assert.throws(() => validatePrintDocument({ html: 'x'.repeat(MAX_DOCUMENT_BYTES + 1) }), /smaller than 5 MB/i);
  assert.match(PRINT_CSP, /script-src 'none'/);
  assert.match(PRINT_CSP, /connect-src 'none'/);
  assert.match(PRINT_CSP, /img-src data:/);
});

function printFixture(pdf = Buffer.from('%PDF-1.7\nmock')) {
  const state = { destroyed: false, requests: [], commands: [], sessionOptions: null, windowOptions: null };
  const isolatedSession = { setPermissionRequestHandler: (handler) => { state.permission = handler; }, setPermissionCheckHandler: (handler) => { state.permissionCheck = handler; }, webRequest: { onBeforeRequest: (handler) => { state.request = handler; } } };
  class Window {
    constructor(options) {
      state.windowOptions = options;
      this.webContents = { setWindowOpenHandler: (handler) => { state.newWindow = handler; }, on: (event, handler) => { state.commands.push(event); }, executeJavaScript: async (code) => { state.script = code; return { scripts: 0 }; }, printToPDF: async (options) => { state.printOptions = options; return pdf; } };
    }
    async loadURL(url) {
      state.url = url;
      for (const candidate of [url, 'data:image/png;base64,YWJj', 'file:///etc/passwd', 'https://example.com/', 'visro://app/index.html']) state.request({ url: candidate }, (decision) => state.requests.push({ url: candidate, ...decision }));
    }
    isDestroyed() { return state.destroyed; }
    destroy() { state.destroyed = true; }
  }
  return { state, deps: { BrowserWindow: Window, session: { fromPartition: (partition, options) => { state.partition = partition; state.sessionOptions = options; return isolatedSession; } } } };
}

test('document printing uses a separate sandboxed session, blocks network/files and destroys its window', async () => {
  const { state, deps } = printFixture();
  const pdf = await renderDocumentPDF({ html: '<h1>Quarterly report</h1>', name: 'Report' }, deps);
  assert.match(pdf.toString(), /^%PDF-/);
  assert.match(state.partition, /^visro-print-/);
  assert.ok(!state.partition.startsWith('persist:'));
  assert.deepEqual(state.sessionOptions, { cache: false });
  assert.equal(state.windowOptions.show, false);
  assert.equal(state.windowOptions.webPreferences.sandbox, true);
  assert.equal(state.windowOptions.webPreferences.contextIsolation, true);
  assert.equal(state.windowOptions.webPreferences.nodeIntegration, false);
  assert.equal(state.windowOptions.webPreferences.preload, undefined);
  assert.equal(state.requests.filter((request) => request.cancel).length, 3);
  assert.equal(state.newWindow().action, 'deny');
  assert.equal(state.permissionCheck(), false);
  assert.equal(state.printOptions.preferCSSPageSize, true);
  assert.equal(state.printOptions.pageSize, 'A4');
  assert.ok(decodeURIComponent(state.url).includes(PRINT_CSP));
  assert.ok(state.script.includes('DOMParser'));
  assert.equal(state.destroyed, true);
  assert.equal(state.request, null);
});

test('failed document printing rejects invalid PDF bytes and still cleans up', async () => {
  const { state, deps } = printFixture(Buffer.from('not a PDF'));
  await assert.rejects(renderDocumentPDF({ html: '<p>Test</p>' }, deps), /could not be printed/i);
  assert.equal(state.destroyed, true);
  assert.equal(state.request, null);
});
