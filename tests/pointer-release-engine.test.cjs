const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { build } = require('esbuild');

let StudioEditor, environment;
before(async () => {
  const fabric = await import('fabric');
  environment = (await import('fabric/node')).getEnv();
  fabric.setEnv(environment);
  const result = await build({ entryPoints: [path.join(__dirname, '../src/editor.ts')], bundle: true, platform: 'node', format: 'esm', external: ['fabric'], write: false });
  const file = path.join(__dirname, `pointer-release-engine-build-${process.pid}.mjs`);
  await fs.writeFile(file, result.outputFiles[0].text);
  try { ({ StudioEditor } = await import(pathToFileURL(file).href)); }
  finally { await fs.unlink(file); }
});

async function fixture() {
  const editor = new StudioEditor(environment.document.createElement('canvas'), { width: 600, height: 500 });
  await editor.insertDesign({ name: 'Mouse release regression', width: 600, height: 500, background: '#fff', elements: [
    { type: 'rect', name: 'Moving card', x: 110, y: 120, width: 140, height: 100, fill: '#f26b3a' },
    { type: 'circle', name: 'Hover target', x: 370, y: 260, radius: 55, fill: '#f6bed0' },
  ] });
  const target = editor.canvas.getObjects()[0];
  editor.selectLayer(target.id);
  editor.setZoom(.75); editor.pan(17, 23); editor.canvas.renderAll();
  return { editor, target };
}

function send(editor, type, point, buttons, extra = {}, recipient) {
  const event = new environment.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX: point.x, clientY: point.y, ...extra });
  (recipient || (type === 'mousedown' ? editor.canvas.upperCanvasEl : environment.document)).dispatchEvent(event);
  return event;
}
function pointFor(editor, target) { return target.getCenterPoint().transform(editor.canvas.viewportTransform); }
function shifted(point, x, y) { return { x: point.x + x, y: point.y + y }; }
function position(target) { return { left: target.left, top: target.top }; }
function closePosition(target, expected) {
  assert.ok(Math.abs(target.left - expected.left) < .000001, `left: ${target.left} versus ${expected.left}`);
  assert.ok(Math.abs(target.top - expected.top) < .000001, `top: ${target.top} versus ${expected.top}`);
}

test('a lost mouse-up settles at the last pressed DOM move, with one Undo and no stuck transform or hover', async () => {
  const { editor, target } = await fixture();
  try {
    const before = editor.serialize(), revision = editor.state.revision, start = pointFor(editor, target);
    let releases = 0, changes = 0, previewPaused = false;
    editor.canvas.on('mouse:down', () => { previewPaused = true; });
    editor.canvas.on('mouse:up', () => { releases++; previewPaused = false; });
    editor.canvas.on('object:modified', () => changes++);
    send(editor, 'mousedown', start, 1);
    send(editor, 'mousemove', shifted(start, 9, 6), 1);
    send(editor, 'mousemove', shifted(start, 18, 12), 1);
    const legitimate = position(target), selection = target.id;
    closePosition(target, { left: 134, top: 136 });
    assert.equal(editor.state.revision, revision, 'the held gesture is not a history boundary');
    assert.ok(editor.canvas._currentTransform);
    assert.equal(previewPaused, true);

    // This uses actual DOM MouseEvents through Fabric's registered listeners,
    // rather than directly firing an object:moving or modified callback.
    send(editor, 'mousemove', shifted(start, -312, 61), 0);
    closePosition(target, legitimate);
    assert.equal(editor.canvas._currentTransform, null);
    assert.equal(target.isMoving, false);
    assert.equal(editor.selected.id, selection);
    assert.equal(releases, 1, 'a genuine lost-up ends the Fabric interaction once');
    assert.equal(previewPaused, false, 'the real release callback resumes interaction-dependent preview work');
    assert.equal(changes, 1);
    assert.equal(editor.state.revision, revision + 1);
    const settled = editor.serialize();

    send(editor, 'mousemove', shifted(start, 350, -180), 0);
    send(editor, 'mouseup', shifted(start, 350, -180), 0);
    assert.deepEqual(editor.serialize(), settled, 'a late release and hover cannot commit or move the object again');
    assert.equal(editor.state.revision, revision + 1);
    assert.equal(releases, 1, 'the stale document release listener is removed');
    assert.equal(changes, 1);

    const other = editor.canvas.getObjects()[1];
    send(editor, 'mousemove', pointFor(editor, other), 0, {}, editor.canvas.upperCanvasEl);
    assert.equal(editor.hoverTarget, other, 'ordinary hover resumes after the interrupted drag');
    assert.equal(editor.selected.id, selection);
    await editor.undo(); assert.deepEqual(editor.serialize(), before, 'one Undo restores the entire interrupted gesture');
    await editor.redo(); assert.deepEqual(editor.serialize(), settled);

    const restored = editor.canvas.getObjects()[0], next = pointFor(editor, restored), original = position(restored);
    send(editor, 'mousedown', next, 1);
    send(editor, 'mousemove', shifted(next, 15, -9), 1);
    send(editor, 'mouseup', shifted(next, 15, -9), 0);
    closePosition(restored, { left: original.left + 20, top: original.top - 12 });
    assert.equal(editor.canvas._currentTransform, null, 'the next normal drag completes normally');
  } finally { editor.destroy(); }
});

test('an interrupted Option-drag waits for its real clone and commits the duplicate and move as one Undo', async () => {
  const { editor, target } = await fixture();
  let releaseClone;
  try {
    const before = editor.serialize(), revision = editor.state.revision, originalId = target.id, start = pointFor(editor, target);
    const clone = target.clone.bind(target), ready = new Promise(resolve => { releaseClone = resolve; });
    target.clone = (...args) => { const pending = clone(...args); return ready.then(() => pending); };
    send(editor, 'mousedown', start, 1, { altKey: true });
    send(editor, 'mousemove', shifted(start, 24, 15), 1, { altKey: true });
    const legitimate = position(target);
    assert.notEqual(target.id, originalId);
    send(editor, 'mousemove', shifted(start, -312, 61), 0, { altKey: true });
    closePosition(target, legitimate);
    assert.equal(editor.canvas._currentTransform, null);
    assert.equal(editor.state.revision, revision, 'the pending image/vector clone is not a half transaction');
    releaseClone(); await editor.whenIdle();
    assert.equal(editor.canvas.getObjects().length, 3);
    const original = editor.canvas.getObjects().find(object => object.id === originalId);
    closePosition(original, { left: 110, top: 120 });
    closePosition(target, { left: 142, top: 140 });
    assert.equal(editor.state.revision, revision + 1);
    const settled = editor.serialize();
    send(editor, 'mouseup', shifted(start, -312, 61), 0, { altKey: true });
    await editor.whenIdle(); assert.deepEqual(editor.serialize(), settled);
    await editor.undo(); assert.deepEqual(editor.serialize(), before);
    await editor.redo(); assert.deepEqual(editor.serialize(), settled);
  } finally { releaseClone?.(); editor.destroy(); }
});

test('a mouse press with no movement releases without creating history, while pen compatibility input is not mistaken for a mouse release', async () => {
  const { editor, target } = await fixture();
  try {
    const before = editor.serialize(), revision = editor.state.revision, start = pointFor(editor, target);
    send(editor, 'mousedown', start, 1);
    send(editor, 'mousemove', shifted(start, -200, 80), 0);
    assert.equal(editor.canvas._currentTransform, null);
    assert.deepEqual(editor.serialize(), before);
    assert.equal(editor.state.revision, revision);

    const penDown = new environment.window.MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: start.x, clientY: start.y });
    Object.defineProperty(penDown, 'pointerType', { value: 'pen' });
    editor.canvas.upperCanvasEl.dispatchEvent(penDown);
    send(editor, 'mousedown', start, 1);
    send(editor, 'mousemove', shifted(start, 15, 9), 1);
    send(editor, 'mousemove', shifted(start, 18, 12), 0);
    assert.ok(editor.canvas._currentTransform, 'pen compatibility input retains its own release semantics');
    send(editor, 'mouseup', shifted(start, 18, 12), 0);
    assert.equal(editor.canvas._currentTransform, null);
  } finally { editor.destroy(); }
});

test('a pressed multibutton mouse move and native release keep their existing drag semantics', async () => {
  const { editor, target } = await fixture();
  try {
    const before = editor.serialize(), revision = editor.state.revision, start = pointFor(editor, target);
    let releases = 0;
    editor.canvas.on('mouse:up', () => releases++);
    send(editor, 'mousedown', start, 1);
    send(editor, 'mousemove', shifted(start, 9, 6), 3);
    assert.ok(editor.canvas._currentTransform, 'left plus right remains a pressed drag');
    send(editor, 'mousemove', shifted(start, 15, 9), 2);
    assert.ok(editor.canvas._currentTransform, 'a nonzero right-button state is not treated as an unpressed move');
    send(editor, 'mousemove', shifted(start, 18, 12), 1);
    send(editor, 'mouseup', shifted(start, 18, 12), 0);
    closePosition(target, { left: 134, top: 136 });
    assert.equal(releases, 1);
    assert.equal(editor.state.revision, revision + 1);
    assert.equal(editor.canvas._currentTransform, null);
    await editor.undo(); assert.deepEqual(editor.serialize(), before);
  } finally { editor.destroy(); }
});
