'use strict';

const { parseProject } = require('./files.cjs');
const MAX_CLIPBOARD_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 32_000_000;
const OBJECT_FORMAT = 'app.visro.objects';
const RAW_OBJECT_FORMAT = `electron application/osclipboard;format="${OBJECT_FORMAT}"`;
const LAYER_TYPES = new Set(['rect','circle','ellipse','triangle','line','polygon','polyline','path','text','textbox','itext','i-text','image','fabricimage','group','activeselection','active-selection']);

function safeImageSource(value) {
  const match = typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 || match[2].length > MAX_CLIPBOARD_BYTES * 1.4) throw new Error('Clipboard objects can contain only embedded PNG, JPEG, WebP or GIF images.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_CLIPBOARD_BYTES || bytes.toString('base64') !== match[2]) throw new Error('The clipboard image is too large or unreadable.');
  const signature = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : match[1] === 'webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6));
  if (!signature) throw new Error('The clipboard image is unreadable.');
  if (['png','jpeg'].includes(match[1])) imageDimensions(bytes, `image/${match[1]}`);
  else {
    let width, height;
    if (match[1] === 'gif' && bytes.length >= 10) { width = bytes.readUInt16LE(6); height = bytes.readUInt16LE(8); }
    if (match[1] === 'webp') {
      const encoding = bytes.toString('ascii', 12, 16);
      if (encoding === 'VP8X' && bytes.length >= 30) { width = bytes.readUIntLE(24, 3) + 1; height = bytes.readUIntLE(27, 3) + 1; }
      else if (encoding === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
      else if (encoding === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([0x9d,0x01,0x2a]))) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    }
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error('Clipboard images must be no larger than 32 megapixels.');
  }
}

function sanitizeObjects(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new Error('Copy between 1 and 100 selected elements.');
  let json;
  try { json = JSON.stringify({ objects: input }); } catch { throw new Error('The selected elements contain invalid data.'); }
  if (Buffer.byteLength(json) > MAX_CLIPBOARD_BYTES) throw new Error('Selected elements exceed the 20 MB clipboard limit.');
  // Reuse the project parser's prototype stripping before inspecting object data.
  const objects = parseProject(json).objects;
  let layers = 0, nodes = 0;
  function validateLayer(object) {
    if (!object || typeof object !== 'object' || Array.isArray(object) || !LAYER_TYPES.has(String(object.type).toLowerCase()) || ++layers > 2000) throw new Error('The clipboard contains unsupported or too many layers.');
    for (const key of ['left','top','width','height','angle','scaleX','scaleY','fontSize','radius','opacity','strokeWidth']) if (object[key] !== undefined && (typeof object[key] !== 'number' || !Number.isFinite(object[key]) || Math.abs(object[key]) > 1_000_000)) throw new Error('The clipboard has invalid element geometry.');
  }
  function walk(value, depth = 0) {
    if (depth > 20 || ++nodes > 100000) throw new Error('The clipboard elements are nested too deeply or too complex.');
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1_000_000)) throw new Error('The clipboard has invalid element geometry.');
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
    for (const [key, item] of Object.entries(value)) {
      if (/^on[a-z]/i.test(key) || /^(?:script|scripts)$/i.test(key)) throw new Error('Clipboard elements cannot contain executable content.');
      if (['fill','stroke','fontFamily'].includes(key) && typeof item === 'string' && /^\s*(?:url\s*\(|javascript:|vbscript:|file:|blob:|https?:|data:)/i.test(item)) throw new Error('Clipboard elements cannot contain executable or external styles.');
      if (['src','source','href','url','xlink:href'].includes(key) && typeof item === 'string') safeImageSource(item);
      if (key === 'visroMetadata' && item && typeof item === 'object') {
        const metadata = {};
        if (typeof item.link === 'string' && /^(https?:\/\/|mailto:|#[a-z0-9_-])/i.test(item.link.trim())) metadata.link = item.link.trim().slice(0, 2048);
        if (typeof item.altText === 'string') metadata.altText = item.altText.slice(0, 2000);
        if (typeof item.duration === 'number' && Number.isFinite(item.duration)) metadata.duration = Math.max(.1, Math.min(3600, item.duration));
        value[key] = metadata;
        walk(metadata, depth + 1); continue;
      }
      if (key === 'objects') {
        if (!Array.isArray(item)) throw new Error('The clipboard group has invalid layers.');
        item.forEach(validateLayer);
      }
      if (key === 'clipPath' && item) validateLayer(item);
      walk(item, depth + 1);
    }
  }
  objects.forEach(validateLayer); walk(objects);
  return objects;
}

function imageDimensions(bytes, mime) {
  let width, height;
  if (mime === 'image/png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) { height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > MAX_IMAGE_PIXELS) throw new Error('Paste a PNG or JPEG image no larger than 32 megapixels.');
  return { width, height };
}

function createCanvasClipboard({ clipboard, ClipboardItem, nativeImage }) {
  // Creating this service never inspects the clipboard. Only an explicit paste
  // action calls read(); all writes commit the object marker and text atomically.
  async function write(input) {
    if (!input || typeof input !== 'object') throw new Error('Choose elements to copy.');
    const objects = sanitizeObjects(input.objects);
    const text = input.plainText === undefined ? 'Visro elements' : input.plainText;
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_CLIPBOARD_BYTES) throw new Error('Clipboard text exceeds 20 MB.');
    const json = JSON.stringify({ version: 1, objects });
    if (Buffer.byteLength(json) + Buffer.byteLength(text) > MAX_CLIPBOARD_BYTES) throw new Error('Selected elements exceed the 20 MB clipboard limit.');
    await clipboard.write([new ClipboardItem({ [RAW_OBJECT_FORMAT]: new Blob([json], { type: 'application/json' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    return true;
  }
  async function bytesFrom(item, type) {
    const blob = await item.getType(type);
    if (!blob || typeof blob.arrayBuffer !== 'function' || blob.size > MAX_CLIPBOARD_BYTES) throw new Error('Clipboard content exceeds 20 MB or is unreadable.');
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length > MAX_CLIPBOARD_BYTES) throw new Error('Clipboard content exceeds 20 MB.');
    return bytes;
  }
  async function read() {
    const items = await clipboard.read();
    if (!Array.isArray(items) || !items.length) return null;
    if (items.length > 100) throw new Error('The clipboard contains too many items.');
    const objectItem = items.find((item) => item.types.includes(RAW_OBJECT_FORMAT));
    if (objectItem) {
      const bytes = await bytesFrom(objectItem, RAW_OBJECT_FORMAT);
      let payload;
      try { payload = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('The copied Visro elements are unreadable.'); }
      if (payload?.version !== 1) throw new Error('The copied Visro elements use an unsupported format.');
      return { kind: 'objects', objects: sanitizeObjects(payload.objects) };
    }
    for (const type of ['image/png', 'image/jpeg']) {
      const item = items.find((candidate) => candidate.types.includes(type));
      if (!item) continue;
      const bytes = await bytesFrom(item, type);
      imageDimensions(bytes, type);
      const image = nativeImage.createFromBuffer(bytes);
      if (image.isEmpty()) throw new Error('The clipboard image is unreadable.');
      const size = image.getSize();
      if (size.width <= 0 || size.height <= 0 || size.width * size.height > MAX_IMAGE_PIXELS) throw new Error('Paste an image no larger than 32 megapixels.');
      const data = image.toDataURL(); safeImageSource(data);
      if (Buffer.byteLength(data) > MAX_CLIPBOARD_BYTES * 1.4) throw new Error('The pasted image exceeds 20 MB.');
      return { kind: 'image', data };
    }
    const textItem = items.find((item) => item.types.includes('text/plain'));
    if (textItem) return { kind: 'text', text: (await bytesFrom(textItem, 'text/plain')).toString('utf8') };
    return null;
  }
  return { write, read };
}

module.exports = { createCanvasClipboard, sanitizeObjects, imageDimensions, OBJECT_FORMAT, RAW_OBJECT_FORMAT, MAX_CLIPBOARD_BYTES, MAX_IMAGE_PIXELS };
