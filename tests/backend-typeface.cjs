'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getLocalTypeface, CANVA_FONT_PATH, MAX_TYPEFACE_BYTES } = require('../electron/typeface.cjs');

function fontBytes(length = 64) { const b = Buffer.alloc(length); b.write('wOF2'); b.writeUInt32BE(length, 8); return b; }
function mocks(bytes, size = bytes.length) {
  return { stat: async (file) => { assert.equal(file, CANVA_FONT_PATH); return { isFile: () => true, size }; }, readFile: async (file) => { assert.equal(file, CANVA_FONT_PATH); return bytes; } };
}
test('local font reads one fixed installed resource and returns a WOFF2 data URL without writing', async () => {
  const bytes = fontBytes();
  assert.deepEqual(await getLocalTypeface(mocks(bytes)), { name: 'Canva Sans', data: `data:font/woff2;base64,${bytes.toString('base64')}` });
  assert.ok(CANVA_FONT_PATH.startsWith('/Applications/Canva.app/Contents/Resources/app.asar/'));
});
test('missing, non-file, oversized, truncated, replaced, and invalid fonts safely fall back', async () => {
  assert.equal(await getLocalTypeface({ stat: async () => { throw Object.assign(new Error('Missing'), { code: 'ENOENT' }); } }), null);
  let reads = 0;
  for (const info of [{ isFile: () => false, size: 64 }, { isFile: () => true, size: MAX_TYPEFACE_BYTES + 1 }, { isFile: () => true, size: 12 }]) {
    assert.equal(await getLocalTypeface({ stat: async () => info, readFile: async () => { reads++; return fontBytes(); } }), null);
  }
  assert.equal(reads, 0);
  assert.equal(await getLocalTypeface(mocks(fontBytes(), 65)), null);
  assert.equal(await getLocalTypeface(mocks(Buffer.alloc(64))), null);
  const inconsistent = fontBytes(); inconsistent.writeUInt32BE(200, 8);
  assert.equal(await getLocalTypeface(mocks(inconsistent)), null);
  assert.equal(await getLocalTypeface({ ...mocks(fontBytes()), readFile: async () => { throw new Error('Denied'); } }), null);
});
