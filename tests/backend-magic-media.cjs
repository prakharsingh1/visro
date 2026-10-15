'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/magic-media.ts');
const video = { id: 'video-id', name: 'Generated movie', kind: 'video', duration: 8, src: 'visro://app/media/video-id', hasAudio: true, size: 1024, importedAt: 1, thumbnail: 'data:image/jpeg;base64,/9j/' };
const voice = { ...video, id: 'voice-id', kind: 'audio', name: 'Generated narration', duration: 145 };
const image = 'data:image/png;base64,iVBORw0KGgo=';

test('generated video appends a real trimmed source and preserves the current sequence', async () => {
  const { withGeneratedMedia, existingSequence } = await modulePromise;
  const original = { scenes: [{ id: 'scene', name: 'Existing', kind: 'video', mediaId: 'original', duration: 4, trimStart: 2, volume: 0.25 }], audio: [{ mediaId: 'music', start: 1, trimStart: 3, duration: 2, volume: 0.5 }] };
  const next = withGeneratedMedia(existingSequence('video', original), video, undefined, () => 'new-scene');
  assert.deepEqual(next.scenes[0], original.scenes[0]); assert.deepEqual(next.audio, original.audio);
  assert.deepEqual(next.scenes[1], { id: 'new-scene', name: video.name, kind: 'video', mediaId: video.id, duration: 8, trimStart: 0, volume: 1, fit: 'cover', transition: 'none', thumbnail: video.thumbnail });
  assert.equal(original.scenes.length, 1);
  assert.deepEqual(existingSequence('document', original), { scenes: [], audio: [] });
});
test('speech fills the timeline with real stills and retains the full playable narration', async () => {
  const { withGeneratedMedia } = await modulePromise;
  let counter = 0;
  const next = withGeneratedMedia({ scenes: [], audio: [] }, voice, image, () => String(++counter));
  assert.deepEqual(next.scenes.map((s) => s.duration), [120, 25]);
  assert.ok(next.scenes.every((s) => s.kind === 'image' && s.image === image && s.thumbnail === image));
  assert.deepEqual(next.audio, [{ mediaId: voice.id, start: 0, trimStart: 0, duration: 145, volume: 1 }]);
  const existing = { scenes: [{ id: 'old', name: 'Old clip', kind: 'video', mediaId: video.id, duration: 8 }], audio: [] };
  const combined = withGeneratedMedia(existing, { ...voice, duration: 10 }, image, () => 'end');
  assert.deepEqual(combined.scenes.map((s) => s.duration), [8, 2]);
  assert.deepEqual(existing.audio, []);
  assert.throws(() => withGeneratedMedia({ scenes: [], audio: [] }, voice), /design preview/);
  assert.throws(() => withGeneratedMedia({ scenes: Array(100).fill(existing.scenes[0]), audio: [] }, video), /100 scenes/);
  assert.throws(() => withGeneratedMedia({ scenes: [], audio: Array(16).fill({ mediaId: 'x' }) }, voice, image), /16 audio/);
  assert.equal(withGeneratedMedia({ scenes: [], audio: [] }, { ...voice, duration: 2401 }, image).scenes.length, 21);
  assert.throws(() => withGeneratedMedia({ scenes: [], audio: [] }, { ...voice, duration: 3601 }, image), /1 hour/);
});
test('editable design captures selected-page scale, type and text styling, without image bytes', async () => {
  const { editableDesign, documentParagraphs } = await modulePromise;
  const project = { name: 'Launch', width: 1080, height: 720, activePageId: 'second', pages: [{ id: 'first', background: '#fff', canvas: { objects: [] } }, { id: 'second', background: '#123456', canvas: { objects: [{ type: 'Textbox', text: 'Launch now', left: 50, top: 60, width: 200, height: 100, scaleX: 2, scaleY: 0.5, fill: '#abcdef', fontFamily: 'Canva Sans', fontSize: 40, fontWeight: 700, textAlign: 'center', opacity: 0.8, angle: 15 }, { type: 'Image', src: 'PRIVATE-IMAGE' }, { type: 'Group', objects: [{ type: 'Rect' }] }, { type: 'Circle', width: 100, height: 100 }] } }] };
  const design = editableDesign(project);
  assert.equal(design.background, '#123456'); assert.equal(design.elements.length, 2);
  assert.deepEqual(design.elements[0], { type: 'text', text: 'Launch now', x: 50, y: 60, width: 400, height: 50, fill: '#abcdef', fontSize: 40, fontFamily: 'Canva Sans', fontWeight: 700, align: 'center', opacity: 0.8, angle: 15 });
  assert.ok(!JSON.stringify(design).includes('PRIVATE-IMAGE'));
  assert.throws(() => editableDesign({ ...project, activePageId: 'first' }), /editable text or shapes/);
  assert.equal(documentParagraphs('A & B\n\n<script>alert(1)</script>\nNext'), '<p>A &amp; B</p><p>&lt;script&gt;alert(1)&lt;/script&gt;<br>Next</p>');
});

test('AI voice and video appends preserve caption timing, text, style and visibility after local save/restore', async () => {
  const { existingSequence, withGeneratedMedia } = await modulePromise;
  const original = { scenes: [{ id: 'old', name: 'Existing scene', kind: 'image', image, duration: 4 }], audio: [], captions: [{ id: 'caption', start: .3, end: 2.7, text: 'Keep café & captions\nsecond line' }], captionStyle: { fontFamily: 'Georgia', fontSize: 28, color: '#abcdef', background: '#111111', box: true, backgroundOpacity: .5, position: 'top', align: 'left', margin: 7 }, burnCaptions: false };
  const spoken = withGeneratedMedia(existingSequence('video', original), { ...voice, duration: 6 }, image, () => 'voice-scene');
  const reopened = existingSequence('video', JSON.parse(JSON.stringify(spoken)));
  const appended = withGeneratedMedia(reopened, video, undefined, () => 'video-scene');
  assert.deepEqual(appended.captions, original.captions);
  assert.deepEqual(appended.captionStyle, original.captionStyle);
  assert.equal(appended.burnCaptions, false);
  assert.deepEqual(appended.scenes.map(scene => scene.duration), [4, 2, 8]);
  assert.equal(appended.audio[0].duration, 6);
  assert.equal(original.scenes.length, 1); assert.equal(original.audio.length, 0);
  reopened.captions[0].text = 'Changed independently';
  assert.equal(original.captions[0].text, 'Keep café & captions\nsecond line');
});
