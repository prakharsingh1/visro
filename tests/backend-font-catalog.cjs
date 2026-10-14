'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('packaged font catalog preserves pinned provenance and per-family licenses within the size budget', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'scripts/font-manifest.json'), 'utf8'));
  assert.equal(manifest.repository, 'https://github.com/google/fonts');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.families.length, 21);
  assert.equal(manifest.conversion.subset, false);
  let total = 0;
  for (const family of manifest.families) {
    const license = await readFile(path.join(root, 'public/fonts', family.license.file));
    assert.equal(sha(license), family.license.sha256); assert.ok(license.toString().includes('SIL OPEN FONT LICENSE')); assert.equal(family.license.spdx, 'OFL-1.1');
    for (const face of family.faces) {
      const bytes = await readFile(path.join(root, 'public/fonts', face.file));
      assert.equal(bytes.toString('ascii', 0, 4), 'wOF2'); assert.equal(bytes.readUInt32BE(8), bytes.length); assert.equal(bytes.length, face.bytes); assert.equal(sha(bytes), face.sha256);
      assert.match(face.sourceSha256, /^[a-f0-9]{64}$/); assert.ok(face.source.startsWith(`ofl/${family.slug}/`)); assert.ok(face.glyphs > 100); total += bytes.length;
    }
  }
  assert.ok(total < 6 * 1024 * 1024);
  const distributed = JSON.parse(await readFile(path.join(root, 'public/fonts/SOURCE_MANIFEST.json'), 'utf8'));
  assert.deepEqual(distributed, manifest);
});

test('font loading uses packaged paths in parallel and memoizes completion without a cloud request', async () => {
  const priorFontFace = global.FontFace, priorDocument = global.document;
  const loaded = [], added = [];
  global.FontFace = class { constructor(name, source, descriptors) { this.family = name; this.source = source; this.descriptors = descriptors; } async load() { loaded.push(this); await new Promise((resolve) => setTimeout(resolve, 5)); return this; } };
  global.document = { fonts: { add: (face) => added.push(face), ready: Promise.resolve() } };
  try {
    const { FONT_FAMILIES, loadDesignFonts } = await import('../src/font-catalog.ts');
    assert.equal(FONT_FAMILIES.length, 21); assert.ok(FONT_FAMILIES.includes('Montserrat') && FONT_FAMILIES.includes('Pacifico'));
    const pending = loadDesignFonts(); assert.equal(pending, loadDesignFonts());
    await pending;
    assert.equal(loaded.length, 23); assert.equal(added.length, 23);
    assert.ok(loaded.every((f) => /^url\("\.\/fonts\/[a-z-]+\.woff2"\) format\("woff2"\)$/.test(f.source)));
    assert.ok(loaded.every((f) => f.descriptors.style === 'normal'));
    assert.equal(loaded.find((f) => f.family === 'Montserrat').descriptors.weight, '100 900');
    assert.deepEqual(loaded.filter((f) => f.family === 'Poppins').map((f) => f.descriptors.weight).sort(), ['400','700']);
    await loadDesignFonts(); assert.equal(loaded.length, 23);
  } finally { global.FontFace = priorFontFace; global.document = priorDocument; }
});
