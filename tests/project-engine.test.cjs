const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { build } = require('esbuild');

let StudioEditor;
let environment;

before(async () => {
  const browserFabric = await import('fabric');
  const nodeFabric = await import('fabric/node');
  environment = nodeFabric.getEnv();
  browserFabric.setEnv(environment);
  const result = await build({ entryPoints: [path.join(__dirname, '../src/editor.ts')], bundle: true, platform: 'node', format: 'esm', external: ['fabric'], write: false });
  const temporaryModule = path.join(__dirname, `project-engine-build-${process.pid}.mjs`);
  await fs.writeFile(temporaryModule, result.outputFiles[0].text);
  try { ({ StudioEditor } = await import(pathToFileURL(temporaryModule).href)); }
  finally { await fs.unlink(temporaryModule); }
});

function studio() { return new StudioEditor(environment.document.createElement('canvas')); }

test('undo and redo restore complete documents across page creation and page edits', async () => {
  const editor = studio();
  try {
    await editor.loadTemplate('next-idea');
    editor.addText('body');
    editor.updateSelected({ text: 'This remains editable', fontFamily: 'Georgia', fill: '#ee3322' });
    const firstPageId = editor.state.activePageId;
    await editor.addPage();
    editor.addShape('circle');
    editor.updateSelected({ fill: '#112244' });
    await editor.undo();
    assert.equal(editor.selected, null);
    assert.equal(editor.state.pages.length, 2);
    await editor.undo();
    assert.equal(editor.state.layers.length, 0);
    await editor.undo();
    assert.equal(editor.state.pages.length, 1);
    assert.equal(editor.state.activePageId, firstPageId);
    assert.ok(editor.serialize().pages[0].canvas.objects.some((object) => object.text === 'This remains editable'));
    await editor.redo();
    assert.equal(editor.state.pages.length, 2);
  } finally { editor.destroy(); }
});

test('group and ungroup preserve the rendered transforms of all child layers', async () => {
  const editor = studio();
  try {
    editor.addShape('rect');
    editor.updateSelected({ left: 120, top: 170 });
    editor.addShape('circle');
    editor.updateSelected({ left: 530, top: 580 });
    editor.selectAll();
    editor.group();
    editor.updateSelected({ angle: 27 });
    const group = editor.canvas.getActiveObject();
    const children = group.getObjects();
    const before = new Map(children.map((object) => [object.id, object.calcTransformMatrix()]));
    editor.ungroup();
    assert.equal(editor.state.layers.length, 2);
    editor.deselect();
    for (const object of editor.canvas.getObjects()) {
      object.calcTransformMatrix().forEach((value, index) => assert.ok(Math.abs(value - before.get(object.id)[index]) < 0.0001));
    }
  } finally { editor.destroy(); }
});

test('export dimensions and transparency are independent from viewport zoom', async () => {
  const editor = studio();
  try {
    editor.resizeDesign(640, 480);
    editor.resizeViewport(310, 210);
    editor.setZoom(0.22);
    editor.addShape('rect');
    const png = await editor.exportImage({ format: 'png', scale: 2, transparent: true });
    const buffer = Buffer.from(png.split(',')[1], 'base64');
    assert.equal(buffer.readUInt32BE(16), 1280);
    assert.equal(buffer.readUInt32BE(20), 960);
    const image = environment.document.createElement('img');
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = png; });
    const rendered = environment.document.createElement('canvas');
    rendered.width = 1280; rendered.height = 960;
    const context = rendered.getContext('2d');
    context.drawImage(image, 0, 0);
    assert.equal(context.getImageData(0, 0, 1, 1).data[3], 0, 'transparent PNG must have a genuinely transparent corner');
    assert.equal(editor.state.zoom, 0.22);
    assert.equal(editor.state.background, '#ffffff');
    assert.equal(editor.canvas.width, 310);
  } finally { editor.destroy(); }
});

test('AI design insertion retains existing pages and produces editable text', async () => {
  const editor = studio();
  try {
    await editor.loadTemplate('next-idea');
    const firstId = editor.state.activePageId;
    await editor.addPage();
    await editor.insertDesign({ name: 'Generated idea', width: 1080, height: 1080, background: '#FAF5EC', elements: [{ type: 'text', text: 'An editable idea', x: 50, y: 70, width: 600, fontSize: 62 }] });
    assert.equal(editor.state.pages.length, 2);
    assert.equal(editor.state.layers.length, 1);
    editor.selectLayer(editor.state.layers[0].id);
    editor.updateSelected({ text: 'Changed by hand' });
    assert.equal(editor.selected.text, 'Changed by hand');
    await editor.setPage(firstId);
    assert.equal(editor.state.layers.length, 8);
  } finally { editor.destroy(); }
});

test('design elements and artboard clipping share explicit top-left origins', async () => {
  const editor = studio();
  try {
    await editor.loadTemplate('next-idea');
    const headline = editor.canvas.getObjects().find((object) => object.text?.startsWith('Make room'));
    assert.equal(headline.originX, 'left');
    assert.equal(headline.originY, 'top');
    assert.equal(headline.getBoundingRect().left, 74);
    assert.equal(headline.getBoundingRect().top, 244);
    assert.equal(editor.canvas.clipPath.originX, 'left');
    assert.equal(editor.canvas.clipPath.originY, 'top');
    const png = await editor.exportImage({ format: 'png' });
    const image = environment.document.createElement('img');
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = png; });
    const rendered = environment.document.createElement('canvas'); rendered.width = 1080; rendered.height = 1080;
    const context = rendered.getContext('2d'); context.drawImage(image, 0, 0);
    assert.deepEqual([...context.getImageData(1078, 1078, 1, 1).data], [250, 245, 236, 255], 'background must reach the far corner of the whole logical page');
  } finally { editor.destroy(); }
});

test('moving a multiple selection preserves relative spacing of the selected layers', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 100, top: 150 });
    editor.addShape('rect'); editor.updateSelected({ left: 500, top: 600 });
    editor.selectAll();
    editor.updateSelected({ left: 700, top: 710 });
    editor.deselect();
    const objects = editor.canvas.getObjects();
    assert.ok(Math.abs(objects[1].left - objects[0].left - 400) < 0.0001);
    assert.ok(Math.abs(objects[1].top - objects[0].top - 450) < 0.0001);
  } finally { editor.destroy(); }
});
