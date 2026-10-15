'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const utilities = import('../src/captions.ts');

test('SRT and WebVTT imports retain Unicode, multiline text, cue timing and escaped literal markup', async () => {
  const { parseCaptions, serializeCaptions } = await utilities;
  const srt = '\ufeff1\r\n00:00:00,125 --> 00:00:02,750\r\nCafé &amp; मुंबई\r\nsecond line\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n&lt;literal&gt; and <i>italic</i>\r\n';
  const cues = parseCaptions(srt);
  assert.deepEqual(cues.map(({ id, ...cue }) => cue), [{ start: .125, end: 2.75, text: 'Café & मुंबई\nsecond line' }, { start: 3, end: 4, text: '<literal> and italic' }]);
  const vtt = serializeCaptions(cues, 'vtt');
  assert.match(vtt, /^WEBVTT\n/);
  assert.deepEqual(parseCaptions(vtt).map(({ id, ...cue }) => cue), cues.map(({ id, ...cue }) => cue));
  const noted = parseCaptions('WEBVTT\n\nNOTE a note\nnot a cue\n\nSTYLE\n::cue {color:red}\n\nintro\n00:01.200 --> 00:02.000 align:start position:20%\n<v Alice>Hello &#x1f44b;</v>');
  assert.equal(noted[0].text, 'Hello 👋'); assert.equal(noted[0].start, 1.2);
  assert.match(serializeCaptions(cues, 'srt'), /00:00:00,125 --> 00:00:02,750/);
});
test('caption parsing rejects malformed, reversed, excessive and hour-long out-of-range inputs', async () => {
  const { parseCaptions, readCaptionTimestamp, captionTimestamp } = await utilities;
  for (const source of ['', 'not subtitles', '1\n00:99:00,000 --> 00:00:01,000\nbad', '1\n00:00:01,000 --> 00:00:00,000\nbad', '1\n00:00:00,000 --> 00:00:01,000\n', '1\n00:00:00,000 --> 00:00:01,000\n' + 'x'.repeat(2001)]) assert.throws(() => parseCaptions(source));
  assert.throws(() => parseCaptions('x'.repeat(2 * 1024 * 1024 + 1)), /2 MB/);
  assert.throws(() => parseCaptions(Array.from({ length: 1001 }, (_, i) => `${i}\n00:00:00,000 --> 00:00:01,000\nx`).join('\n\n')), /1,000/);
  assert.throws(() => readCaptionTimestamp('01:00:00.001'), /one hour/);
  assert.equal(captionTimestamp(59.9999), '00:01:00.000');
});
test('timeline seeking resolves exact clip boundaries and clamps the final frame', async () => {
  const { locateScene } = await utilities;
  const scenes = [{ duration: 1.5 }, { duration: .75 }, { duration: 3 }];
  assert.deepEqual(locateScene(scenes, 1.5), { index: 1, start: 1.5, offset: 0 });
  assert.deepEqual(locateScene(scenes, 2.1), { index: 1, start: 1.5, offset: .6000000000000001 });
  assert.deepEqual(locateScene(scenes, 100), { index: 2, start: 2.25, offset: 3 });
});
test('untrusted imported caption styles normalize into bounded local preview settings', async () => {
  const { normalizeCaptionStyle } = await utilities;
  const safe = normalizeCaptionStyle({ fontFamily: 'url(https://example.invalid)', fontSize: Infinity, color: 'url(file:secret)', backgroundOpacity: 9, position: 'outside', margin: -30 }, 1080);
  assert.equal(safe.fontFamily, 'Arial'); assert.equal(safe.fontSize, 54); assert.equal(safe.color, '#ffffff');
  assert.equal(safe.backgroundOpacity, 1); assert.equal(safe.position, 'bottom'); assert.equal(safe.margin, 0);
});
