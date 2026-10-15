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

function studio(options) { return new StudioEditor(environment.document.createElement('canvas'), options); }

function pointerDrag(editor, point, dx, dy, { altKey = false, move = true } = {}) {
  editor.canvas.renderAll();
  const pointer = point.transform(editor.canvas.viewportTransform);
  const event = (type, x, y, buttons) => new environment.window.MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons, altKey, bubbles: true });
  editor.canvas.upperCanvasEl.dispatchEvent(event('mousedown', pointer.x, pointer.y, 1));
  if (move) environment.document.dispatchEvent(event('mousemove', pointer.x + dx * editor.state.zoom, pointer.y + dy * editor.state.zoom, 1));
  environment.document.dispatchEvent(event('mouseup', pointer.x + dx * editor.state.zoom, pointer.y + dy * editor.state.zoom, 0));
}

test('Option-drag duplicates a transformed group immediately and waits for its image copy before one undo transaction', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 100, top: 160 });
    editor.addShape('circle'); editor.updateSelected({ left: 380, top: 420 });
    editor.selectAll(); editor.group();
    const moving = editor.canvas.getActiveObject();
    moving.set({ angle: 27, scaleX: 1.2, scaleY: .8, flipX: true, skewX: 9 }); moving.setCoords();
    editor.canvas.fire('object:modified', { target: moving });
    const sourceId = moving.id, children = moving.getObjects(), sourceChildIds = children.map(child => child.id);
    const source = moving.calcTransformMatrix(), childTransforms = children.map(child => child.calcTransformMatrix());
    const revision = editor.state.revision;
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    const clone = moving.clone.bind(moving);
    moving.clone = (...args) => { const copy = clone(...args); return ready.then(() => copy); };
    pointerDrag(editor, children[0].getCenterPoint(), 63, -22, { altKey: true });
    const moved = moving.calcTransformMatrix();
    assert.ok(Math.abs(moved[4] - source[4] - 63) < .00001, 'pointer movement must not wait for cloning');
    assert.ok(Math.abs(moved[5] - source[5] + 22) < .00001);
    assert.notEqual(moving.id, sourceId);
    assert.equal(editor.state.revision, revision, 'do not save a partially completed duplication');
    let exported = false;
    const pending = editor.exportSelectedObjects().then(result => { exported = true; return result; });
    await Promise.resolve(); assert.equal(exported, false, 'queued operations must wait for the complete gesture');
    release(); await pending;
    assert.equal(editor.canvas.getObjects().length, 2);
    const stationary = editor.canvas.getObjects().find(object => object.id === sourceId);
    assert.ok(stationary); assert.deepEqual(stationary.getObjects().map(child => child.id), sourceChildIds);
    stationary.calcTransformMatrix().forEach((value, coordinate) => assert.ok(Math.abs(value - source[coordinate]) < .001));
    const ids = new Set();
    for (const group of editor.canvas.getObjects()) {
      for (const object of [group, ...group.getObjects()]) { assert.ok(!ids.has(object.id)); ids.add(object.id); }
    }
    moving.getObjects().forEach((child, index) => {
      child.calcTransformMatrix().forEach((value, coordinate) => {
        const delta = coordinate === 4 ? 63 : coordinate === 5 ? -22 : 0;
        assert.ok(Math.abs(value - childTransforms[index][coordinate] - delta) < .001);
      });
    });
    assert.equal(editor.canvas.getActiveObject(), moving); assert.equal(editor.state.revision, revision + 1);
    await editor.undo();
    assert.equal(editor.canvas.getObjects().length, 1);
    const restored = editor.canvas.getObjects()[0]; assert.equal(restored.id, sourceId);
    restored.calcTransformMatrix().forEach((value, coordinate) => assert.ok(Math.abs(value - source[coordinate]) < .001));
    await editor.redo(); assert.equal(editor.canvas.getObjects().length, 2);
  } finally { editor.destroy(); }
});

test('Option-drag preserves a rotated multiple selection while plain drag, Option-click and locks keep their behavior', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 110, top: 150 });
    editor.addShape('circle'); editor.updateSelected({ left: 420, top: 490 });
    editor.selectAll(); editor.updateSelected({ angle: 31 });
    const objects = editor.canvas.getActiveObjects(), ids = objects.map(object => object.id), transforms = objects.map(object => object.calcTransformMatrix());
    pointerDrag(editor, objects[0].getCenterPoint(), -17, 29, { altKey: true });
    await editor.exportSelectedObjects();
    assert.equal(editor.canvas.getObjects().length, 4);
    assert.equal(editor.canvas.getActiveObjects().length, 2);
    objects.forEach((object, index) => {
      assert.notEqual(object.id, ids[index]);
      const matrix = object.calcTransformMatrix();
      assert.ok(Math.abs(matrix[4] - transforms[index][4] + 17) < .001); assert.ok(Math.abs(matrix[5] - transforms[index][5] - 29) < .001);
      const source = editor.canvas.getObjects().find(candidate => candidate.id === ids[index]);
      source.calcTransformMatrix().forEach((value, coordinate) => assert.ok(Math.abs(value - transforms[index][coordinate]) < .001));
    });
    await editor.undo(); editor.selectAll();
    const selected = editor.canvas.getActiveObjects(), before = selected.map(object => object.calcTransformMatrix()), revision = editor.state.revision;
    pointerDrag(editor, selected[0].getCenterPoint(), 0, 0, { altKey: true, move: false });
    await editor.exportSelectedObjects();
    assert.equal(editor.canvas.getObjects().length, 2); assert.equal(editor.state.revision, revision);
    pointerDrag(editor, selected[0].getCenterPoint(), 12, 9);
    selected.forEach((object, index) => { const matrix = object.calcTransformMatrix(); assert.ok(Math.abs(matrix[4] - before[index][4] - 12) < .001); assert.ok(Math.abs(matrix[5] - before[index][5] - 9) < .001); });
    assert.equal(editor.canvas.getObjects().length, 2);
    editor.setLayerLocked('', true);
    const locked = selected.map(object => object.calcTransformMatrix());
    pointerDrag(editor, selected[0].getCenterPoint(), 80, 60, { altKey: true });
    selected.forEach((object, index) => assert.deepEqual(object.calcTransformMatrix(), locked[index]));
    assert.equal(editor.canvas.getObjects().length, 2);
  } finally { editor.destroy(); }
});

test('user alignment guides snap real pointer drags and disabling snapping keeps exact movement', async () => {
  const editor = studio({ width: 400, height: 400 });
  try {
    await editor.insertDesign({ name: 'Guide targets', width: 400, height: 400, background: '#ffffff', elements: [
      { type: 'rect', name: 'Movable', x: 100, y: 100, width: 80, height: 50, fill: '#f6bed0' },
    ] });
    editor.selectAll(); editor.setZoom(.7);
    editor.setAlignmentGuides({ x: [147, NaN, -50, 9000], y: [221] }); editor.setSnapping(true);
    const object = editor.canvas.getActiveObject();
    pointerDrag(editor, object.getCenterPoint(), 43, 117);
    assert.ok(Math.abs(object.left - 147) < .00001, `guide x moved to ${object.left}`); assert.ok(Math.abs(object.top - 221) < .00001, `guide y moved to ${object.top}`);
    editor.setSnapping(false);
    pointerDrag(editor, object.getCenterPoint(), 3.25, -2.75);
    assert.ok(Math.abs(object.left - 150.25) < .00001); assert.ok(Math.abs(object.top - 218.25) < .00001);
  } finally { editor.destroy(); }
});

test('Option-drag retains a photo crop, frame, original source, adjustments and element metadata', async () => {
  const editor = studio();
  try {
    const source = environment.document.createElement('canvas'); source.width = 300; source.height = 200;
    const context = source.getContext('2d'); context.fillStyle = '#336699'; context.fillRect(0, 0, 300, 200);
    await editor.addImage(source.toDataURL('image/png'), 'Framed photograph');
    editor.updateSelected({ left: 160, top: 230, width: 200, height: 150, angle: 17 });
    editor.cropSelectedImage({ left: 30, top: 20, width: 200, height: 150 }); editor.addFrame('circle'); editor.flip('horizontal');
    editor.applyEffects({ brightness: .2, saturation: -.3 }); editor.setElementMetadata({ altText: 'Blue photograph', link: 'https://example.com/photo' });
    const moving = editor.canvas.getActiveObject(), sourceId = moving.id;
    const before = moving.toObject(['id', 'visroName', 'visroFrame', 'visroOriginalSrc', 'visroMetadata']);
    pointerDrag(editor, moving.getCenterPoint(), 41, -19, { altKey: true });
    await editor.exportSelectedObjects();
    assert.equal(editor.canvas.getObjects().length, 2);
    const stationary = editor.canvas.getObjects().find(object => object.id === sourceId);
    const retained = stationary.toObject(['id', 'visroName', 'visroFrame', 'visroOriginalSrc', 'visroMetadata']);
    for (const property of ['src', 'cropX', 'cropY', 'width', 'height', 'flipX', 'angle', 'filters', 'clipPath', 'visroFrame', 'visroOriginalSrc', 'visroMetadata']) assert.deepEqual(retained[property], before[property], `duplicating changed ${property}`);
    assert.notEqual(moving.id, sourceId); assert.equal(editor.canvas.getActiveObject(), moving);
    await editor.undo(); assert.equal(editor.canvas.getObjects().length, 1); assert.equal(editor.canvas.getObjects()[0].id, sourceId);
  } finally { editor.destroy(); }
});

test('arrow nudges respond immediately without rounding or one history snapshot per key repeat', async () => {
  let changes = 0;
  const editor = studio({ onChange: () => changes++ });
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 120.25, top: 180.75 });
    const object = editor.canvas.getActiveObject();
    const beforeRevision = editor.state.revision;
    changes = 0;
    for (let index = 0; index < 100; index++) editor.nudge(1, -1);
    assert.equal(object.left, 220.25); assert.equal(object.top, 80.75);
    assert.equal(changes, 0, 'keyboard repeat must not synchronously rerender the React application');
    editor.flushPendingChanges();
    assert.equal(changes, 1); assert.equal(editor.state.revision, beforeRevision + 1);
    editor.nudge(10, 0); editor.flushPendingChanges();
    await editor.undo();
    assert.equal(editor.canvas.getObjects()[0].left, 120.25);
    assert.equal(editor.canvas.getObjects()[0].top, 180.75);
    editor.selectAll(); editor.setLayerLocked(editor.state.layers[0].id, true);
    const locked = editor.canvas.getObjects()[0]; const oldLeft = locked.left;
    editor.nudge(50, 0); editor.flushPendingChanges();
    assert.equal(locked.left, oldLeft);
  } finally { editor.destroy(); }
});

test('visible pixels select an underlying shape through empty text bounds and viewport bounds follow zoom', async () => {
  const editor = studio();
  try {
    await editor.insertDesign({ name: 'Pointer layers', width: 400, height: 400, background: '#ffffff', elements: [
      { type: 'rect', name: 'Underlying shape', x: 200, y: 20, width: 100, height: 100, fill: '#ff00aa' },
      { type: 'text', name: 'Short text in a wide box', text: 'A', x: 20, y: 20, width: 320, fontSize: 28, fill: '#000000' },
    ] });
    editor.canvas.renderAll();
    const { Point } = await import('fabric');
    const point = new Point(250, 35).transform(editor.canvas.viewportTransform);
    assert.equal(editor.selectAt(point).name, 'Underlying shape');
    assert.equal(editor.canvas.getActiveObject().borderColor, '#8B3DFF');
    const bounds = editor.getSelectionBounds();
    assert.ok(Math.abs(bounds.left - (editor.canvas.viewportTransform[4] + 200 * editor.state.zoom)) < 0.1);
    assert.ok(Math.abs(bounds.width - 100 * editor.state.zoom) < 0.1);
    const anchor = { x: 260, y: 170 };
    const originalScene = new Point(anchor).transform((await import('fabric')).util.invertTransform(editor.canvas.viewportTransform));
    editor.zoomAt(2.1, anchor);
    const nextViewport = originalScene.transform(editor.canvas.viewportTransform);
    assert.ok(Math.abs(nextViewport.x - anchor.x) < 0.0001); assert.ok(Math.abs(nextViewport.y - anchor.y) < 0.0001);
    const revision = editor.state.revision;
    editor.setPanMode(true); assert.equal(editor.canvas.skipTargetFind, true); assert.equal(editor.canvas.selection, false);
    editor.pan(40, -30); editor.setPanMode(false);
    assert.equal(editor.state.revision, revision, 'panning and zooming must never dirty a document');
    assert.equal(editor.canvas.skipTargetFind, false);
  } finally { editor.destroy(); }
});

test('locking and unlocking a multiple selection affects every member in one transaction', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 90.25, top: 140.75 });
    editor.addShape('circle'); editor.updateSelected({ left: 450.5, top: 600.25 });
    editor.selectAll();
    const objects = editor.canvas.getActiveObjects(), before = objects.map(object => object.calcTransformMatrix());
    const revision = editor.state.revision;
    editor.setLayerLocked('', true);
    assert.equal(editor.state.revision, revision + 1);
    assert.equal(editor.selected.locked, true);
    assert.ok(objects.every(object => object.visroLocked && !object.selectable));
    editor.nudge(25, -15); editor.flushPendingChanges();
    objects.forEach((object, index) => assert.deepEqual(object.calcTransformMatrix(), before[index]));
    editor.setLayerLocked('', false);
    assert.equal(editor.selected.locked, false);
    assert.ok(objects.every(object => !object.visroLocked && object.selectable));
    editor.nudge(25, -15); editor.flushPendingChanges();
    objects.forEach((object, index) => {
      const after = object.calcTransformMatrix();
      assert.ok(Math.abs(after[4] - before[index][4] - 25) < .00001);
      assert.ok(Math.abs(after[5] - before[index][5] + 15) < .00001);
    });
  } finally { editor.destroy(); }
});

test('multipage export preserves selection, link targets, viewport and document revision', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.setElementMetadata({ link: 'https://example.com/first' });
    editor.addText(); editor.updateSelected({ text: 'Second linked element' });
    const firstPage = editor.state.activePageId;
    await editor.addPage(); editor.addShape('circle');
    await editor.setPage(firstPage); editor.selectAll(); editor.updateSelected({ angle: 19 });
    editor.setZoom(.65); editor.pan(37, -28);
    const ids = editor.canvas.getActiveObjects().map(object => object.id);
    const transforms = editor.canvas.getActiveObjects().map(object => object.calcTransformMatrix());
    const viewport = [...editor.canvas.viewportTransform], revision = editor.state.revision;
    const pages = await editor.exportPages(.25);
    assert.equal(pages.length, 2); assert.equal(editor.state.activePageId, firstPage);
    assert.deepEqual(editor.canvas.getActiveObjects().map(object => object.id), ids);
    editor.canvas.getActiveObjects().forEach((object, index) => {
      object.calcTransformMatrix().forEach((value, coordinate) => assert.ok(Math.abs(value - transforms[index][coordinate]) < .001, `export changed transform ${index}/${coordinate}: ${value} vs ${transforms[index][coordinate]}`));
    });
    assert.deepEqual(editor.canvas.viewportTransform, viewport); assert.equal(editor.state.revision, revision);
    editor.setElementMetadata({ link: 'https://example.com/after-export' });
    assert.ok(editor.canvas.getActiveObjects().every(object => object.visroMetadata.link === 'https://example.com/after-export'));
  } finally { editor.destroy(); }
});

test('thumbnail exports preserve live canvas dimensions and pointer geometry at every zoom', async () => {
  const editor = studio({ width: 400, height: 300 });
  try {
    await editor.insertDesign({ name: 'Export geometry', width: 400, height: 300, background: '#ffffff', elements: [
      { type: 'rect', name: 'Pink target', x: 100, y: 70, width: 80, height: 60, fill: '#f6bed0' },
    ] });
    editor.selectAll();
    const object = editor.canvas.getActiveObject(), transform = object.calcTransformMatrix();
    const revision = editor.state.revision;
    let dimensionChanges = 0, viewportChanges = 0;
    const setDimensions = editor.canvas.setDimensions.bind(editor.canvas);
    const setViewportTransform = editor.canvas.setViewportTransform.bind(editor.canvas);
    editor.canvas.setDimensions = (...args) => { dimensionChanges++; return setDimensions(...args); };
    editor.canvas.setViewportTransform = (...args) => { viewportChanges++; return setViewportTransform(...args); };
    const { FabricImage } = await import('fabric');
    for (const zoom of [.43, 1, 2.3]) {
      editor.setZoom(zoom); editor.pan(41, -37); editor.canvas.renderAll();
      dimensionChanges = 0; viewportChanges = 0;
      const viewport = editor.canvas.viewportTransform;
      const dimensions = [editor.canvas.width, editor.canvas.height];
      const domDimensions = [editor.canvas.lowerCanvasEl.width, editor.canvas.lowerCanvasEl.height, editor.canvas.upperCanvasEl.width, editor.canvas.upperCanvasEl.height];
      const style = editor.canvas.lowerCanvasEl.getAttribute('style');
      const offset = { ...editor.canvas._offset };
      const dataURL = await editor.exportImage({ format: 'png', scale: .5 });
      assert.equal(dimensionChanges, 0, 'a thumbnail must never resize the live DOM canvas');
      assert.equal(viewportChanges, 0, 'a thumbnail must never recalculate the live pointer viewport');
      assert.equal(editor.canvas.viewportTransform, viewport);
      assert.deepEqual([editor.canvas.width, editor.canvas.height], dimensions);
      assert.deepEqual([editor.canvas.lowerCanvasEl.width, editor.canvas.lowerCanvasEl.height, editor.canvas.upperCanvasEl.width, editor.canvas.upperCanvasEl.height], domDimensions);
      assert.equal(editor.canvas.lowerCanvasEl.getAttribute('style'), style);
      assert.deepEqual(editor.canvas._offset, offset);
      assert.equal(editor.canvas.getActiveObject(), object); assert.deepEqual(object.calcTransformMatrix(), transform);
      const image = await FabricImage.fromURL(dataURL);
      assert.equal(image.width, 200); assert.equal(image.height, 150);
      const painted = environment.document.createElement('canvas'); painted.width = 200; painted.height = 150;
      const context = painted.getContext('2d'); context.drawImage(image.getElement(), 0, 0);
      assert.deepEqual([...context.getImageData(60, 45, 1, 1).data], [246, 190, 208, 255], 'exported pink target must remain at document coordinates');
      assert.deepEqual([...context.getImageData(10, 10, 1, 1).data], [255, 255, 255, 255]);
      const svg = await editor.exportImage({ format: 'svg' });
      assert.match(svg, /viewBox="0 0 400 300"/);
      assert.equal(dimensionChanges, 0); assert.equal(viewportChanges, 0);
      assert.equal(editor.canvas.viewportTransform, viewport);
      image.dispose();
    }
    assert.equal(editor.state.revision, revision);
  } finally { editor.destroy(); }
});

test('nudging a rotated selection preserves every scene transform and leaves locked members fixed', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 100, top: 130 });
    editor.addShape('circle'); editor.updateSelected({ left: 480, top: 560 });
    editor.selectAll(); editor.updateSelected({ angle: 31 });
    const objects = editor.canvas.getActiveObjects();
    let before = objects.map((object) => object.calcTransformMatrix());
    editor.nudge(7, -3); editor.flushPendingChanges();
    objects.forEach((object, index) => { const matrix = object.calcTransformMatrix(); assert.ok(Math.abs(matrix[4] - before[index][4] - 7) < 0.00001); assert.ok(Math.abs(matrix[5] - before[index][5] + 3) < 0.00001); });
    const locked = objects[0]; editor.setLayerLocked(locked.id, true);
    before = objects.map((object) => object.calcTransformMatrix());
    editor.nudge(11, 9); editor.flushPendingChanges();
    objects.forEach((object, index) => { const matrix = object.calcTransformMatrix(), dx = index === 0 ? 0 : 11, dy = index === 0 ? 0 : 9; assert.ok(Math.abs(matrix[4] - before[index][4] - dx) < 0.00001); assert.ok(Math.abs(matrix[5] - before[index][5] - dy) < 0.00001); });
    editor.addText(); const text = editor.canvas.getActiveObject(); text.isEditing = true;
    const left = text.left; editor.nudge(30, 0); editor.flushPendingChanges();
    assert.equal(text.left, left, 'text arrow navigation belongs to the caret during direct text editing');
    text.isEditing = false;
  } finally { editor.destroy(); }
});

test('style copying, element metadata and reusable components preserve editable content and renew IDs', async () => {
  const editor = studio();
  try {
    editor.addText(); editor.updateSelected({ text: 'Source', fill: '#112233', fontFamily: 'Georgia', fontSize: 56, underline: true, left: 101, top: 222 });
    editor.setTextEffect('shadow', '#994411', 0.7);
    assert.equal(editor.copyStyle(), true);
    const sourceId = editor.selected.id;
    editor.addText(); editor.updateSelected({ text: 'Keep my words', left: 400, top: 500 });
    const destinationId = editor.selected.id;
    editor.pasteStyle();
    assert.equal(editor.selected.text, 'Keep my words'); assert.equal(editor.selected.fontFamily, 'Georgia'); assert.equal(editor.selected.fontSize, 56);
    assert.equal(editor.selected.left, 400); assert.equal(editor.selected.id, destinationId);
    editor.setElementMetadata({ link: 'javascript:alert(1)', altText: 'Readable label', duration: 4 });
    assert.equal(editor.selected.metadata.link, undefined);
    editor.setElementMetadata({ link: 'https://example.com/design' });
    const content = await editor.exportSelectedObjects();
    assert.equal(content.length, 1); assert.equal(content[0].text, 'Keep my words');
    await editor.insertObjects(content);
    assert.notEqual(editor.selected.id, destinationId); assert.notEqual(editor.selected.id, sourceId);
    assert.equal(editor.selected.metadata.link, 'https://example.com/design'); assert.equal(editor.selected.text, 'Keep my words');
    const project = editor.serialize(); await editor.loadProject(project);
    const inserted = editor.state.layers.find(({ id }) => id === content[0].id);
    editor.selectLayer(inserted.id); assert.equal(editor.selected.metadata.altText, 'Readable label');
    await assert.rejects(editor.insertObjects([{ type: 'Image', src: 'javascript:alert(1)' }]), /unsupported image source/);
  } finally { editor.destroy(); }
});

test('context picking can unlock a locked layer and layer dragging preserves active selection', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.updateSelected({ left: 100, top: 100 });
    const first = editor.canvas.getActiveObject();
    editor.addShape('circle'); editor.updateSelected({ left: 600, top: 600 });
    const second = editor.canvas.getActiveObject();
    editor.reorderLayer(first.id, second.id);
    assert.equal(editor.canvas.getObjects()[1], first); assert.equal(editor.canvas.getActiveObject(), second);
    editor.setLayerLocked(first.id, true); editor.canvas.renderAll();
    const { Point } = await import('fabric');
    const pointer = new Point(150, 150).transform(editor.canvas.viewportTransform);
    assert.equal(editor.selectAt(pointer), null);
    assert.equal(editor.selectAt({ ...pointer, includeLocked: true }).id, first.id);
    assert.equal(editor.selected.locked, true);
    editor.setLayerLocked(first.id, false);
    assert.equal(first.evented, true); assert.equal(first.selectable, true);
    editor.addText(); assert.equal(editor.editSelectedText(), true); assert.equal(editor.isTextEditing(), true);
    const text = editor.canvas.getActiveObject(); assert.equal(text.selectionStart, 0); assert.equal(text.selectionEnd, text.text.length);
    text.exitEditing(); assert.equal(editor.isTextEditing(), false);
  } finally { editor.destroy(); }
});

test('custom source crops preserve the placed image and frame while restored controls read actual filters', async () => {
  const editor = studio();
  try {
    const source = environment.document.createElement('canvas'); source.width = 400; source.height = 300;
    const context = source.getContext('2d'); context.fillStyle = '#336699'; context.fillRect(0, 0, 400, 300);
    await editor.addImage(source.toDataURL('image/png'), 'Source photo');
    editor.updateSelected({ left: 170, top: 230, width: 200, height: 150, angle: 27 }); editor.flip('horizontal'); editor.addFrame('circle');
    editor.applyEffects({ brightness: .2, contrast: .15, saturation: -.4, blur: .05, grayscale: true });
    assert.deepEqual(editor.getImageEffects(), { brightness: .2, contrast: .15, saturation: -.4, blur: .05, grayscale: true });
    const photo = editor.canvas.getActiveObject(), id = photo.id, corners = photo.getCoords(), originalSrc = photo.getSrc();
    const original = editor.getImageCropSource(); assert.equal(original.width, 400); assert.equal(original.height, 300);
    editor.cropSelectedImage({ left: 100, top: 75, width: 200, height: 150 });
    assert.equal(photo.id, id); assert.equal(photo.getSrc(), originalSrc); assert.equal(photo.flipX, true); assert.equal(photo.visroFrame, 'circle');
    photo.getCoords().forEach((corner, index) => { assert.ok(Math.abs(corner.x - corners[index].x) < .0001); assert.ok(Math.abs(corner.y - corners[index].y) < .0001); });
    assert.deepEqual(editor.getImageCropSource().rect, { left: 100, top: 75, width: 200, height: 150 });
    const project = editor.serialize(); await editor.loadProject(project); editor.selectLayer(id);
    assert.deepEqual(editor.getImageEffects(), { brightness: .2, contrast: .15, saturation: -.4, blur: .05, grayscale: true });
    editor.cropSelectedImage({ left: -40, top: -20, width: 900, height: 900 });
    assert.deepEqual(editor.getImageCropSource().rect, { left: 0, top: 0, width: 400, height: 300 });
    await editor.undo(); editor.selectLayer(id);
    assert.deepEqual(editor.getImageCropSource().rect, { left: 100, top: 75, width: 200, height: 150 });
    editor.setLayerLocked(id, true); editor.cropSelectedImage({ left: 0, top: 0, width: 80, height: 60 });
    assert.deepEqual(editor.getImageCropSource().rect, { left: 100, top: 75, width: 200, height: 150 });
  } finally { editor.destroy(); }
});

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

test('autosave serialization preserves selection identity and emits no change callbacks', async () => {
  let changes = 0, selections = 0;
  const editor = studio({ onChange: () => changes++, onSelection: () => selections++ });
  try {
    await editor.loadTemplate('next-idea');
    editor.selectAll();
    const active = editor.canvas.getActiveObject(), beforeChanges = changes, beforeSelections = selections, revision = editor.state.revision;
    for (let i = 0; i < 100; i++) editor.serialize();
    assert.equal(editor.canvas.getActiveObject(), active);
    assert.equal(changes, beforeChanges);
    assert.equal(selections, beforeSelections);
    assert.equal(editor.state.revision, revision);
    assert.equal(editor.serialize().pages[0].canvas.clipPath, undefined, 'viewport clip must never be persisted as document content');
  } finally { editor.destroy(); }
});

test('queued page and history operations cannot race or mutate a destroyed editor', async () => {
  const editor = studio();
  try {
    await editor.loadTemplate('next-idea');
    const first = editor.state.activePageId;
    await Promise.all([editor.addPage(), editor.addPage(), editor.duplicatePage(), editor.setPage(first)]);
    assert.equal(editor.state.pages.length, 4);
    assert.equal(editor.state.activePageId, first);
    assert.equal(editor.state.layers.length, 8);
    await Promise.all([editor.undo(), editor.undo(), editor.redo()]);
    assert.equal(editor.state.pages.length, 4);
    assert.notEqual(editor.state.activePageId, first);
    const pending = editor.loadTemplate('next-idea');
    editor.destroy();
    await pending;
    await editor.addPage();
  } finally { editor.destroy(); }
});

test('save acknowledgement cannot clear newer edits and typing is one undo transaction', async () => {
  const editor = studio();
  try {
    editor.addText();
    const oldRevision = editor.state.revision;
    editor.updateSelected({ text: 'H' });
    editor.updateSelected({ text: 'He' });
    editor.updateSelected({ text: 'Hello' });
    editor.markSaved(oldRevision);
    assert.equal(editor.state.dirty, true);
    await editor.undo();
    assert.equal(editor.serialize().pages[0].canvas.objects[0].text, 'Add your text');
    await editor.redo();
    assert.equal(editor.serialize().pages[0].canvas.objects[0].text, 'Hello');
    editor.markSaved(editor.state.revision);
    assert.equal(editor.state.dirty, false);
  } finally { editor.destroy(); }
});

test('the actual restored user design remains rendered after edits and reopen cycles', async () => {
  const editor = studio();
  try {
    const project = JSON.parse(await fs.readFile(path.join(__dirname, 'project-restored-design.fixture.json'), 'utf8'));
    await editor.loadProject(project);
    assert.equal(editor.state.layers.length, 8);
    for (let i = 0; i < 10; i++) {
      const pinkCircle = editor.state.layers.find(layer => layer.type === 'circle');
      editor.selectLayer(pinkCircle.id);
      editor.updateSelected({ fill: i % 2 ? '#F26B3A' : '#F6BED0', opacity: .98 });
      await editor.loadProject(editor.serialize());
    }
    const data = await editor.exportImage({ format: 'png', scale: .25 });
    const image = environment.document.createElement('img');
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = data; });
    const rendered = environment.document.createElement('canvas'); rendered.width = 270; rendered.height = 270;
    const context = rendered.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 270, 270).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200 && (pixels[i] !== 250 || pixels[i + 1] !== 245 || pixels[i + 2] !== 236)) colored++;
    assert.ok(colored > 5000, 'text and geometric objects must visibly render after restoring the saved project');
  } finally { editor.destroy(); }
});

test('gradients, text effects, metadata, and scaled resizing survive project round trip', async () => {
  const editor = studio();
  try {
    editor.setGradient(['#ff0000', '#0000ff'], 45);
    editor.addText();
    editor.updateSelected({ underline: true, linethrough: true, fontStyle: 'italic', charSpacing: 120 });
    editor.setTextEffect('neon', '#F26B3A', 1.2);
    const textId = editor.selected.id;
    editor.setPageMetadata({ notes: 'Speaker notes', duration: 8, animation: 'fade' });
    editor.setProjectMetadata({ kind: 'sheet', content: { cells: [['2', '=A1*2']] } });
    const before = editor.selected;
    editor.resizeDesign(2160, 2160, { scaleContent: true });
    editor.selectLayer(textId);
    assert.equal(editor.selected.width, before.width * 2);
    await editor.loadProject(editor.serialize());
    editor.selectLayer(textId);
    assert.equal(editor.selected.textEffect, 'neon');
    assert.equal(editor.selected.underline, true);
    assert.equal(editor.selected.linethrough, true);
    assert.equal(editor.state.backgroundGradient.angle, 45);
    assert.equal(editor.state.pageMetadata.notes, 'Speaker notes');
    assert.deepEqual(editor.serialize().content, { cells: [['2', '=A1*2']] });
    assert.equal(editor.state.kind, 'sheet');
  } finally { editor.destroy(); }
});

test('tables, charts, SVG imports, and frames are editable serialized objects', async () => {
  const editor = studio();
  try {
    editor.addTable({ rows: 3, columns: 2, data: [['Month', 'Sales'], ['Jan', '12'], ['Feb', '18']], header: true });
    editor.ungroup(); editor.deselect();
    assert.ok(editor.canvas.getObjects().some(object => object.text === 'Month'));
    for (const type of ['bar', 'line', 'pie', 'donut']) editor.addChart({ type, labels: ['A', 'B', 'C'], values: [12, 18, 7] });
    await editor.addSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#ff6600"/><circle cx="50" cy="50" r="20" fill="#ffffff"/></svg>');
    assert.equal(editor.selected.type, 'group');
    const imageCanvas = environment.document.createElement('canvas'); imageCanvas.width = 120; imageCanvas.height = 80;
    imageCanvas.getContext('2d').fillRect(0, 0, 120, 80);
    await editor.addImage(imageCanvas.toDataURL());
    editor.addFrame('circle');
    const imageId = editor.selected.id;
    await editor.loadProject(editor.serialize());
    editor.selectLayer(imageId);
    assert.ok(editor.canvas.getActiveObject().clipPath);
    const image = editor.canvas.getActiveObject();
    assert.ok(Math.abs(image.clipPath.rx * image.scaleX - image.clipPath.ry * image.scaleY) < .0001);
  } finally { editor.destroy(); }
});

test('thumbnail export leaves multiple selection intact and mask editing retains source and native adjustments', async () => {
  const editor = studio();
  try {
    editor.addShape('rect'); editor.addShape('circle'); editor.selectAll();
    const active = editor.canvas.getActiveObject();
    await editor.exportImage({ format: 'png', scale: .1 });
    assert.equal(editor.canvas.getActiveObject(), active);
    assert.equal(editor.canvas.getActiveObjects().length, 2);
    const source = environment.document.createElement('canvas'); source.width = 120; source.height = 80;
    const context = source.getContext('2d'); context.fillStyle = '#F26B3A'; context.fillRect(0, 0, 120, 80);
    const original = source.toDataURL();
    await editor.addImage(original);
    editor.cropImage(1); editor.applyEffects({ brightness: .2 }); editor.addFrame('rounded');
    const before = editor.selected;
    context.clearRect(0, 0, 20, 80);
    const masked = source.toDataURL();
    await editor.applyImageMask(masked);
    assert.deepEqual(await editor.getImageMaskSources(), { original, current: masked });
    assert.equal(editor.selected.width, before.width);
    assert.equal(editor.selected.height, before.height);
    assert.equal(editor.canvas.getActiveObject().cropX, 20);
    assert.equal(editor.canvas.getActiveObject().filters.length, 1);
    assert.ok(editor.canvas.getActiveObject().clipPath);
    const imageId = editor.selected.id;
    await editor.loadProject(editor.serialize()); editor.selectLayer(imageId);
    assert.equal((await editor.getImageMaskSources()).original, original);
    await editor.copy(); await editor.paste();
    assert.equal(editor.selected.type, 'image');
    assert.notEqual(editor.selected.id, imageId);
    assert.equal((await editor.getImageMaskSources()).original, original);
  } finally { editor.destroy(); }
});

test('bulk create replaces nested placeholders without changing its source and undoes as one transaction', async () => {
  const editor = studio();
  try {
    editor.addText(); editor.updateSelected({ text: 'Hello {{ name }} — {{offer}}', left: 80, top: 100 });
    editor.addShape('rect'); editor.selectAll(); editor.group();
    const sourceId = editor.state.activePageId;
    const original = editor.serialize().pages[0];
    await editor.bulkCreate([{ name: 'Asha', offer: '20% off' }, { name: 'Ben', offer: 'New collection' }]);
    let project = editor.serialize();
    assert.equal(project.pages.length, 3);
    assert.deepEqual(project.pages.find(page => page.id === sourceId), original);
    const first = project.pages[1].canvas.objects[0], second = project.pages[2].canvas.objects[0];
    assert.equal(first.objects.find(object => object.type === 'Textbox').text, 'Hello Asha — 20% off');
    assert.equal(second.objects.find(object => object.type === 'Textbox').text, 'Hello Ben — New collection');
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.objects[0].id, second.objects[0].id);
    assert.equal(first.left, second.left); assert.equal(first.top, second.top);
    await editor.undo(); assert.equal(editor.state.pages.length, 1); assert.equal(editor.state.activePageId, sourceId);
    await editor.redo(); assert.equal(editor.state.pages.length, 3);
    await assert.rejects(editor.bulkCreate([]), /between 1 and 50/);
    await assert.rejects(editor.bulkCreate([{ name: 'a'.repeat(10001) }]), /10,000 characters/);
  } finally { editor.destroy(); }
});

test('distributing a multiple selection creates equal gaps while clipboard keeps unique IDs', async () => {
  const editor = studio();
  try {
    for (const x of [100, 230, 700]) { editor.addShape('rect'); editor.updateSelected({ left: x, top: 80, width: 100, height: 100 }); }
    editor.selectAll(); editor.distribute('horizontal'); editor.deselect();
    const objects = editor.canvas.getObjects().sort((a,b) => a.left - b.left);
    assert.equal(objects[1].left - objects[0].left, objects[2].left - objects[1].left);
    editor.selectAll(); await editor.copy(); await editor.paste(); editor.deselect();
    const all = editor.canvas.getObjects(); assert.equal(all.length, 6); assert.equal(new Set(all.map(object => object.id)).size, 6);
  } finally { editor.destroy(); }
});
