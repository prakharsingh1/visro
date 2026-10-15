'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rasterPointForFill, gestureDeltaBounds } = require('../electron/native-geometry.cjs');

test('native pointer coordinates derive from visible paint and retina/CSS ratios rather than guessed zoom', () => {
  const width = 40, height = 30, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 8; y < 16; y++) for (let x = 12; x < 20; x++) { const offset = (y * width + x) * 4; pixels.set([246, 190, 208, 255], offset); }
  // A dark letter occludes the mean point; the click still chooses painted fill.
  pixels.set([20, 20, 20, 255], (11 * width + 15) * 4);
  const result = rasterPointForFill(pixels, width, height, { left: 100, top: 200, width: 20, height: 15 }, '#F6BED0');
  assert.equal(result.visiblePixels, 63);
  assert.deepEqual(result.paintBounds, { left: 106, top: 204, width: 4, height: 4 });
  assert.ok(result.x >= 107.25 && result.x <= 108.75);
  assert.ok(result.y >= 205.25 && result.y <= 206.75);
  const x = Math.floor((result.x - 100) * 2), y = Math.floor((result.y - 200) * 2);
  assert.deepEqual(Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 3)), [246, 190, 208]);
  assert.throws(() => rasterPointForFill(pixels, width, height, { left: 100, top: 200, width: 20, height: 15 }, '#F26B3A'), /not visibly painted/);
});

test('native gesture bounds reject runaway movement while allowing rounded inspector and zoom values', () => {
  const positive = gestureDeltaBounds(25, 51);
  assert.ok(49 >= positive.min && 49 <= positive.max);
  assert.ok(-1870 < positive.min);
  const negative = gestureDeltaBounds(-25, 51);
  assert.ok(-49 >= negative.min && -49 <= negative.max);
  assert.ok(300 > negative.max);
  assert.throws(() => gestureDeltaBounds(25, 0), /Invalid gesture geometry/);
});
