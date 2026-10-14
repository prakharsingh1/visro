'use strict';
const { app, BrowserWindow } = require('electron');
const { getLocalTypeface } = require('../electron/typeface.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let window;
  try {
    const catalog = process.argv.includes('--catalog');
    let inputs;
    if (catalog) {
      const manifest = require('./font-manifest.json');
      inputs = await Promise.all(manifest.families.flatMap((family) => family.faces.map(async (face) => {
        const bytes = await fs.readFile(path.resolve(__dirname, '../public/fonts', face.file));
        return { name: family.name, weight: face.weight, data: `data:font/woff2;base64,${bytes.toString('base64')}`, bytes: bytes.length };
      })));
    } else {
      const font = await getLocalTypeface();
      if (!font) throw new Error('The installed Canva Sans resource is unavailable.');
      inputs = [{ ...font, weight: '400 700', bytes: Buffer.from(font.data.split(',')[1], 'base64').length }];
    }
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadURL('data:text/html,<meta charset="utf-8">');
    const result = await window.webContents.executeJavaScript(`(async()=>{const entries=${JSON.stringify(inputs)},started=performance.now();await Promise.all(entries.map(async(e)=>{const font=new FontFace(e.name,'url('+e.data+')',{weight:e.weight});await font.load();document.fonts.add(font);}));const names=[...new Set(entries.map(e=>e.name))];return {loaded:names.every(name=>document.fonts.check('400 16px "'+name+'"')),families:names,faces:document.fonts.size,loadMs:performance.now()-started};})()`);
    process.stdout.write(JSON.stringify({ available: true, ...result, bytes: inputs.reduce((sum, font) => sum + font.bytes, 0) }) + '\n');
    if (!result.loaded || result.faces !== inputs.length) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  finally { window?.destroy(); app.exit(process.exitCode || 0); }
});
