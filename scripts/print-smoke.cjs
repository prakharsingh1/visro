'use strict';
// Run with Electron. This writes only the chosen fixture PDF and uses a
// disposable profile; it never opens the user editor or reads a Gemini key.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { renderDocumentPDF } = require('../electron/print.cjs');
app.on('window-all-closed', () => {});

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-print-smoke-'));
  app.setPath('userData', directory);
  await app.whenReady();
  const html = '<h1>Visro document PDF validation</h1><p><strong>Rich text remains selectable.</strong> A local document with a table and multiple pages.</p><table><thead><tr><th>Month</th><th>Revenue</th></tr></thead><tbody><tr><td>January</td><td>4200</td></tr><tr><td>February</td><td>6800</td></tr></tbody></table>' + Array.from({ length: 35 }, (_item, index) => `<h2>Section ${index + 1}</h2><p>Document export preserves headings, paragraphs, bold text and table layout across A4 pages.</p>`).join('') + '<script>window.__ATTACK__=true</script><iframe src="file:///etc/passwd"></iframe><img src="https://example.invalid/leak"><p onclick="attack()" style="background-image:url(https://example.invalid/leak)">Active content is removed.</p>';
  let prepared;
  try {
    const pdf = await renderDocumentPDF({ html, name: 'Visro document validation' }, { BrowserWindow, session, onPrepared: (result) => { prepared = result; } });
    assert.equal(prepared.scripts, 0);
    assert.equal(prepared.images, 0);
    assert.ok(!prepared.text.includes('__ATTACK__'));
    assert.ok(prepared.text.includes('January'));
    const output = path.resolve(process.argv[2] || 'output/fixtures/native-document.pdf');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, pdf);
    process.stdout.write(`${JSON.stringify({ pdf: output, bytes: pdf.length, sanitized: true, textCharacters: prepared.text.length })}\n`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    app.quit();
  }
}
main().then(() => process.exit(0)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
