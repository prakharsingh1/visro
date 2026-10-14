'use strict';

const fs = require('node:fs/promises');

// Read only this known resource from an already installed Canva application.
// It is never copied into the app, its cache, the project, or distribution assets.
const CANVA_FONT_PATH = '/Applications/Canva.app/Contents/Resources/app.asar/dist/renderer/desktop_chrome_v2/images/cff149ee1e9d2be50ac77bcd86769d05.woff2';
const MAX_TYPEFACE_BYTES = 1024 * 1024;

async function getLocalTypeface({ stat = fs.stat, readFile = fs.readFile } = {}) {
  try {
    const info = await stat(CANVA_FONT_PATH);
    if (!info.isFile() || info.size < 48 || info.size > MAX_TYPEFACE_BYTES) return null;
    const bytes = await readFile(CANVA_FONT_PATH);
    if (!Buffer.isBuffer(bytes) || bytes.length !== info.size || bytes.length > MAX_TYPEFACE_BYTES || bytes.toString('ascii', 0, 4) !== 'wOF2' || bytes.readUInt32BE(8) !== bytes.length) return null;
    return { name: 'Canva Sans', data: `data:font/woff2;base64,${bytes.toString('base64')}` };
  } catch {
    // Canva need not be installed, and future versions can rename this resource.
    return null;
  }
}

module.exports = { getLocalTypeface, CANVA_FONT_PATH, MAX_TYPEFACE_BYTES };
