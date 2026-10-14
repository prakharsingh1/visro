'use strict';
const { app, clipboard, ClipboardItem, nativeImage } = require('electron');
app.whenReady().then(() => {
  // Inspect API availability only. Never read or alter the system clipboard.
  const entry = new ClipboardItem({ 'electron application/osclipboard;format="app.visro.objects"': new Blob(['{}'], { type: 'application/json' }), 'text/plain': new Blob(['Visro elements'], { type: 'text/plain' }) });
  process.stdout.write(JSON.stringify({ electron: process.versions.electron, item: typeof ClipboardItem, read: typeof clipboard.read, write: typeof clipboard.write, has: typeof clipboard.has, legacyReadBuffer: typeof clipboard.readBuffer, legacyWriteBuffer: typeof clipboard.writeBuffer, nativeImage: typeof nativeImage.createFromBuffer, acceptedTypes: entry.types }) + '\n');
  app.quit();
});
