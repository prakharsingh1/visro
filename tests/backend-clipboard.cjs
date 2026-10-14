'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvasClipboard, sanitizeObjects, imageDimensions, RAW_OBJECT_FORMAT, MAX_CLIPBOARD_BYTES } = require('../electron/clipboard.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const DATA = `data:image/png;base64,${PNG.toString('base64')}`;
class Item { constructor(data) { this.data = data; this.types = Object.keys(data); } async getType(type) { return this.data[type]; } }
function fixture() {
  let items = [], reads = 0, writes = 0, decodes = 0;
  const clipboard = { read: async () => { reads++; return items; }, write: async (next) => { writes++; items = next; } };
  const nativeImage = { createFromBuffer: (bytes) => { decodes++; assert.deepEqual(bytes, PNG); return { isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }), toDataURL: () => DATA }; } };
  return { service: createCanvasClipboard({ clipboard, ClipboardItem: Item, nativeImage }), set: (next) => { items = next; }, state: () => ({ items, reads, writes, decodes }) };
}
const shape = { type: 'Rect', left: 12, top: 14, width: 100, height: 40, fill: '#ff0000' };

test('canvas copy atomically replaces an old OS image with editable objects and readable text', async () => {
  const f = fixture();
  f.set([new Item({ 'image/png': new Blob([PNG], { type: 'image/png' }) })]);
  assert.equal(f.state().reads, 0, 'Clipboard must never be read at initialization or copy.');
  assert.equal(await f.service.write({ objects: [shape], plainText: 'Launch today' }), true);
  assert.equal(f.state().writes, 1); assert.equal(f.state().reads, 0);
  assert.deepEqual(f.state().items[0].types, [RAW_OBJECT_FORMAT, 'text/plain']);
  assert.equal(await f.state().items[0].getType('text/plain').then((b) => b.text()), 'Launch today');
  assert.deepEqual(await f.service.read(), { kind: 'objects', objects: [shape] });
  assert.equal(f.state().decodes, 0, 'The stale OS image must never be decoded or pasted.');
  f.set([new Item({ 'text/plain': new Blob(['Copied in another app']) })]);
  assert.deepEqual(await f.service.read(), { kind: 'text', text: 'Copied in another app' });
  f.set([]); assert.equal(await f.service.read(), null);
});
test('user paste returns a bounded raster image or plain UTF-8 text without reading HTML or foreign formats', async () => {
  const f = fixture();
  f.set([new Item({ 'text/html': new Blob(['<script>attack()</script>']), 'image/png': new Blob([PNG]), 'text/plain': new Blob(['Image label']) })]);
  assert.deepEqual(await f.service.read(), { kind: 'image', data: DATA }); assert.equal(f.state().decodes, 1);
  f.set([new Item({ 'text/plain': new Blob(['नमस्ते — Visro']) })]);
  assert.deepEqual(await f.service.read(), { kind: 'text', text: 'नमस्ते — Visro' });
  f.set([new Item({ 'text/html': new Blob(['<b>Untrusted HTML</b>']), 'application/foreign': new Blob(['private']) })]);
  assert.equal(await f.service.read(), null);
  const bomb = Buffer.from(PNG); bomb.writeUInt32BE(100000, 16); bomb.writeUInt32BE(100000, 20);
  f.set([new Item({ 'image/png': new Blob([bomb]) })]);
  await assert.rejects(f.service.read(), /32 megapixels/); assert.equal(f.state().decodes, 1, 'Pixel bombs are blocked before raster allocation.');
});
test('clipboard object validation strips prototypes, validates nested shapes and rejects executable URLs and excess complexity', () => {
  const input = JSON.parse('[{"type":"Group","objects":[{"type":"Image","src":"' + DATA + '"},{"type":"Textbox","text":"Safe","visroMetadata":{"link":"javascript:attack()","altText":"Description"}}],"__proto__":{"polluted":true}}]');
  const safe = sanitizeObjects(input);
  assert.equal(Object.hasOwn(safe[0], '__proto__'), false); assert.equal({}.polluted, undefined);
  assert.deepEqual(safe[0].objects[1].visroMetadata, { altText: 'Description' });
  for (const object of [{ ...shape, width: Infinity }, { ...shape, top: 1e12 }, { type: 'Script' }, { ...shape, onload: 'attack' }, { ...shape, fill: 'url(javascript:attack)' }, { type: 'Image', src: 'https://attacker.invalid/a.png' }, { type: 'Image', src: 'file:///etc/passwd' }, { type: 'Image', src: 'data:image/svg+xml;base64,PHN2Zy8+' }, { ...shape, clipPath: { type: 'Iframe' } }]) assert.throws(() => sanitizeObjects([object]));
  assert.throws(() => sanitizeObjects(Array(101).fill(shape)), /100/);
  assert.throws(() => sanitizeObjects([{ type: 'Group', objects: Array(2000).fill(shape) }]), /too many layers/);
  let deep = shape; for (let i = 0; i < 21; i++) deep = { type: 'Group', objects: [deep] };
  assert.throws(() => sanitizeObjects([deep]), /nested/);
});
test('oversized or malformed clipboard data rejects before decoding, allocating, or writing any clipboard state', async () => {
  const f = fixture();
  await assert.rejects(f.service.write({ objects: [shape], plainText: 'a'.repeat(MAX_CLIPBOARD_BYTES + 1) }), /20 MB/); assert.equal(f.state().writes, 0);
  f.set([new Item({ [RAW_OBJECT_FORMAT]: new Blob(['{"version":99,"objects":[]}']) })]);
  await assert.rejects(f.service.read(), /unsupported format/);
  f.set([new Item({ [RAW_OBJECT_FORMAT]: new Blob(['bad json']) })]);
  await assert.rejects(f.service.read(), /unreadable/);
  let allocated = false;
  f.set([new Item({ 'text/plain': { size: MAX_CLIPBOARD_BYTES + 1, arrayBuffer: async () => { allocated = true; throw new Error('must not allocate'); } } })]);
  await assert.rejects(f.service.read(), /20 MB/); assert.equal(allocated, false);
  assert.deepEqual(imageDimensions(PNG, 'image/png'), { width: 1, height: 1 });
  const jpeg = Buffer.from([0xff,0xd8,0xff,0xc0,0,11,8,0,2,0,3,1,1,0,0,0xff,0xd9]);
  assert.deepEqual(imageDimensions(jpeg, 'image/jpeg'), { width: 3, height: 2 });
  assert.throws(() => imageDimensions(Buffer.from('fake'), 'image/png'), /PNG or JPEG/);
});
