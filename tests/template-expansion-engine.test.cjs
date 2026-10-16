const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { build } = require('esbuild');
const { registerFont } = require('canvas');
const { createHash } = require('node:crypto');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let StudioEditor, TemplateBrowser, templates, environment, previousFetch, previousDocument;
const missingSourceFonts = [];

before(async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(__dirname, '../scripts/font-manifest.json'), 'utf8'));
  const used = new Set(['DM Sans', 'Playfair Display', 'League Spartan', 'Cormorant Garamond', 'DM Serif Display', 'Caveat']);
  const cache = path.join(__dirname, '../build/template-audit-fonts');
  const auditedFonts = syncFs.existsSync(path.join(cache, 'manifest.json')) ? JSON.parse(await fs.readFile(path.join(cache, 'manifest.json'), 'utf8')) : null;
  for (const family of manifest.families.filter(font => used.has(font.name))) {
    const faces = auditedFonts?.sourceCommit === manifest.commit ? auditedFonts.fonts.filter(font => font.family === family.name) : [];
    // Pango cannot decode WOFF2 or choose all variable weights. A clean clone
    // needs no undeclared Python/network dependency: this extra typography audit
    // runs when scripts/prepare-template-audit-fonts.py created the local cache.
    if (!faces.length) { missingSourceFonts.push(family.name); continue; }
    for (const face of faces) {
      assert.equal(face.sourceSha256, family.faces[0].sha256);
      const file = path.join(cache, face.file), bytes = await fs.readFile(file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), face.sha256);
      registerFont(file, { family: family.name, weight: String(face.weight) });
    }
  }
  const fabric = await import('fabric'); environment = (await import('fabric/node')).getEnv(); fabric.setEnv(environment);
  previousFetch = global.fetch; previousDocument = global.document;
  global.document = environment.document;
  Object.defineProperty(environment.document, 'baseURI', { value: 'https://visro-local.test/', configurable: true });
  // Real JPEG bytes enter the same inlining/decoding path as the app. Only the
  // transport is local so this regression suite needs neither Vite nor a network.
  global.fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://visro-local.test'); assert.match(url.pathname, /^\/template-photos\/[a-z-]+\.jpg$/);
    const bytes = await fs.readFile(path.join(__dirname, '../public', url.pathname));
    return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.length) } });
  };
  const output = await build({ stdin: { contents: "export {StudioEditor} from './src/editor.ts';export {TemplateBrowser} from './src/TemplateBrowser.tsx';export {STUDIO_TEMPLATE_LIBRARY as templates} from './src/template-expansion.ts';", resolveDir: path.join(__dirname, '..') }, bundle: true, platform: 'node', format: 'esm', external: ['fabric', 'react', 'react-dom/server', 'lucide-react'], write: false });
  const file = path.join(__dirname, `template-expansion-engine-build-${process.pid}.mjs`);
  await fs.writeFile(file, output.outputFiles[0].text);
  try { ({ StudioEditor, TemplateBrowser, templates } = await import(pathToFileURL(file).href)); }
  finally { await fs.unlink(file); }
});
after(() => { global.fetch = previousFetch; global.document = previousDocument; });
const studio = () => new StudioEditor(environment.document.createElement('canvas'), { width: 800, height: 600 });

test('all 120 new templates import as real editable Fabric objects and reopen exactly with embedded photo bytes', { timeout: 300000 }, async (context) => {
  const editor = studio(), reopened = studio(), failures = [];
  try {
    for (const template of templates) {
      await editor.loadTemplate(template.id);
      const objects = editor.canvas.getObjects();
      assert.equal(objects.length, template.elements.length, template.id);
      for (const [i, object] of objects.entries()) {
        const element = template.elements[i], message = `${template.id}: ${element.name}`;
        assert.equal(object.visroName, element.name, message);
        const bounds = object.getBoundingRect();
        const onArtboard = bounds.left >= -.01 && bounds.top >= -.01 && bounds.left + bounds.width <= template.width + 2 && bounds.top + bounds.height <= template.height + 2;
        if (element.type === 'text') {
          assert.equal(object.text, element.text, message); assert.equal(object.fontFamily, element.fontFamily, message);
          if (object.height > element.height + 2) failures.push(`${message}: actual text ${object.height} exceeds authored ${element.height}; ${element.text}`);
          if (object.width > element.width + .01) failures.push(`${message}: actual text width exceeds authored width`);
          if (!onArtboard) failures.push(`${message}: actual text exceeds artboard`);
        } else {
          assert.ok(onArtboard, message + ' visible bounds');
        }
        if (element.type === 'image') {
          assert.match(object.getSrc(), /^data:image\/jpeg;base64,/);
          assert.ok(object.getElement().naturalWidth >= 600, message + ' must decode actual bundled JPEG');
          assert.deepEqual(object.visroMetadata.source, element.source, message);
        }
      }
      const saved = editor.serialize();
      await reopened.loadProject(saved);
      assert.deepEqual(reopened.serialize(), saved, template.id + ' exact project round trip');
    }
    await context.test('all actual offline font text boxes fit their authored cells and artboards', (typography) => {
      if (missingSourceFonts.length) { typography.skip(`Extra Pango typography audit: run python3 scripts/prepare-template-audit-fonts.py with the fontTools environment. Missing ${missingSourceFonts.join(', ')}. Packaged WOFF2 remains covered by installed-app validation.`); return; }
      assert.deepEqual(failures, [], 'all actual font text boxes must fit their authored cells');
    });
  } finally { editor.destroy(); reopened.destroy(); }
});

test('a form entry label edits with one Undo and a travel photo moves without losing its local source or crop', async () => {
  const editor = studio();
  try {
    await editor.loadTemplate('studio-original-client-enquiry-form-1');
    const field = editor.canvas.getObjects().find(object => object.text === 'YOUR NAME');
    editor.selectLayer(field.id); const before = editor.serialize(), revision = editor.state.revision;
    editor.updateSelected({ text: 'CONTACT NAME' });
    assert.equal(editor.selected.text, 'CONTACT NAME'); assert.equal(editor.state.revision, revision + 1);
    await editor.undo(); assert.deepEqual(editor.serialize(), before); await editor.redo(); assert.equal(editor.selected.text, 'CONTACT NAME');
    await editor.loadTemplate('studio-original-travel-memory-board-1');
    const image = editor.canvas.getObjects().find(object => object.type === 'image'); editor.selectLayer(image.id);
    const photoBefore = editor.serialize(), crop = [image.cropX, image.cropY, image.width, image.height], source = image.visroMetadata.source;
    editor.updateSelected({ left: image.left + 12.5, top: image.top + 9.25 });
    assert.deepEqual([image.cropX, image.cropY, image.width, image.height], crop); assert.deepEqual(image.visroMetadata.source, source);
    await editor.undo(); assert.deepEqual(editor.serialize(), photoBefore);
    const png = await editor.exportImage({ format: 'png', scale: .2 }); assert.match(png, /^data:image\/png;base64,/); assert.ok(png.length > 10000, 'rendered photographic template must contain real pixels');
  } finally { editor.destroy(); }
});

test('template gallery remains bounded to 24 or 18 cards and the Forms route cannot spill into other categories', () => {
  const gallery = renderToStaticMarkup(React.createElement(TemplateBrowser, { onUse() {} }));
  assert.equal((gallery.match(/class="template-library-card"/g) || []).length, 24);
  const compact = renderToStaticMarkup(React.createElement(TemplateBrowser, { compact: true, onUse() {} }));
  assert.equal((compact.match(/class="template-library-card"/g) || []).length, 18);
  const forms = renderToStaticMarkup(React.createElement(TemplateBrowser, { fixedCategory: 'Form', compact: true, onUse() {} }));
  assert.equal((forms.match(/class="template-library-card"/g) || []).length, 8); assert.match(forms, /Form layouts/); assert.doesNotMatch(forms, /aria-label="Template category"/);
  const filtered = renderToStaticMarkup(React.createElement(TemplateBrowser, { fixedCategory: 'Form', query: 'feedback', onUse() {} }));
  assert.match(filtered, /1 results/); assert.match(filtered, /COMMON GROUND/); assert.doesNotMatch(filtered, /FIELDHOUSE PROPERTY/);
});
