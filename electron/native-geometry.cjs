'use strict';

// Paint is the independent source of truth for native pointer smoke checks.
// Neither Fabric internals nor a guessed canvas origin is used here.
function rasterPointForFill(pixels, width, height, rect, fill) {
  const color = /^#([0-9a-f]{6})$/i.exec(fill)?.[1];
  if (!color || width < 1 || height < 1 || pixels.length !== width * height * 4 || !(rect.width > 0 && rect.height > 0)) throw new Error('Invalid painted geometry.');
  const red = parseInt(color.slice(0, 2), 16), green = parseInt(color.slice(2, 4), 16), blue = parseInt(color.slice(4, 6), 16);
  const matches = (offset) => pixels[offset + 3] > 240 && Math.abs(pixels[offset] - red) <= 2 && Math.abs(pixels[offset + 1] - green) <= 2 && Math.abs(pixels[offset + 2] - blue) <= 2;
  let count = 0, sumX = 0, sumY = 0, minX = width, minY = height, maxX = 0, maxY = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) if (matches(offset)) {
    const index = offset / 4, x = index % width, y = Math.floor(index / width);
    sumX += x; sumY += y; count++;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (count < 20) throw new Error('The fixture element is not visibly painted.');
  const centerX = sumX / count, centerY = sumY / count;
  let nearest = Infinity, selectedX = 0, selectedY = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) if (matches(offset)) {
    const index = offset / 4, x = index % width, y = Math.floor(index / width), distance = (x - centerX) ** 2 + (y - centerY) ** 2;
    if (distance < nearest) { nearest = distance; selectedX = x; selectedY = y; }
  }
  return {
    x: rect.left + (selectedX + 0.5) * rect.width / width,
    y: rect.top + (selectedY + 0.5) * rect.height / height,
    visiblePixels: count,
    paintBounds: {
      left: rect.left + minX * rect.width / width,
      top: rect.top + minY * rect.height / height,
      width: (maxX - minX + 1) * rect.width / width,
      height: (maxY - minY + 1) * rect.height / height,
    },
    canvas: { ...rect, bitmapWidth: width, bitmapHeight: height },
  };
}

function gestureDeltaBounds(delta, zoomPercent) {
  if (!Number.isFinite(delta) || !Number.isFinite(zoomPercent) || zoomPercent < 2) throw new Error('Invalid gesture geometry.');
  // The visible zoom and inspector fields each round to whole numbers. Bound
  // their complete rounding interval instead of accepting arbitrary movement.
  const first = delta / ((zoomPercent - 0.5) / 100);
  const second = delta / ((zoomPercent + 0.5) / 100);
  return { min: Math.min(first, second) - 1.01, max: Math.max(first, second) + 1.01 };
}

module.exports = { rasterPointForFill, gestureDeltaBounds };
