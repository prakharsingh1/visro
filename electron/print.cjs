'use strict';

const { randomUUID } = require('node:crypto');
const { safeName } = require('./files.cjs');

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const PRINT_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const PRINT_STYLE = '@page{size:A4;margin:20mm}*{box-sizing:border-box}body{margin:0;color:#202124;background:#fff;font:12pt/1.6 Arial,sans-serif;overflow-wrap:anywhere}h1{font-size:26pt;line-height:1.2}h2{font-size:20pt;line-height:1.3}h3{font-size:16pt;line-height:1.4}h1,h2,h3{break-after:avoid}p,ul,ol,blockquote{orphans:3;widows:3}blockquote{border-left:3px solid #8b3dff;padding-left:14px;margin-left:0}table{border-collapse:collapse;width:100%;break-inside:auto}td,th{border:1px solid #ccc;padding:8px;text-align:left}tr,img{break-inside:avoid}thead{display:table-header-group}img{max-width:100%;height:auto}pre{white-space:pre-wrap}a{color:inherit;text-decoration:underline}';

function validatePrintDocument(input) {
  if (!input || typeof input !== 'object' || typeof input.html !== 'string' || !input.html.trim()) throw new Error('Choose a document to export as PDF.');
  if (Buffer.byteLength(input.html, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('Document PDF exports must be smaller than 5 MB.');
  return { html: input.html, name: safeName(input.name || 'Visro document').replace(/\.pdf$/i, '') };
}

// This fixed function executes only in a blank, isolated printing window. The
// input is parsed in an inert DOM and sanitized before becoming live content.
async function preparePrintContent(html, title) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P', 'DIV', 'SPAN', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD', 'TFOOT', 'IMG', 'PRE', 'CODE', 'HR']);
  const discard = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'TEMPLATE']);
  const properties = ['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'line-height', 'margin-top', 'margin-bottom', 'padding-left'];
  for (const element of Array.from(parsed.body.querySelectorAll('*'))) {
    if (discard.has(element.tagName)) { element.remove(); continue; }
    if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    const image = element.tagName === 'IMG' ? element.getAttribute('src') : null;
    const alt = element.getAttribute('alt') || '';
    const css = properties.flatMap((property) => {
      const value = element.style.getPropertyValue(property);
      return value && !/url\s*\(|@import|expression|[<>\\]/i.test(value) ? [`${property}:${value}`] : [];
    }).join(';');
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (css) element.setAttribute('style', css);
    if (element.tagName === 'IMG') {
      if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image || '')) { element.remove(); continue; }
      element.setAttribute('src', image); element.setAttribute('alt', alt.slice(0, 500));
    }
  }
  document.title = title;
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
  return { text: document.body.textContent, images: document.images.length, scripts: document.scripts.length, nodes: document.body.querySelectorAll('*').length };
}

async function renderDocumentPDF(input, { BrowserWindow, session, timeoutMs = 30000, onPrepared } = {}) {
  const document = validatePrintDocument(input);
  const isolatedSession = session.fromPartition(`visro-print-${randomUUID()}`, { cache: false });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('data:') }));
  const window = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { session: isolatedSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  let timer;
  try {
    const job = async () => {
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}"><style>${PRINT_STYLE}</style></head><body></body></html>`;
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const prepared = await window.webContents.executeJavaScript(`(${preparePrintContent.toString()})(${JSON.stringify(document.html)},${JSON.stringify(document.name)})`);
      if (onPrepared) onPrepared(prepared);
      const pdf = await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true });
      if (!Buffer.isBuffer(pdf) || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The document could not be printed as PDF.');
      return pdf;
    };
    return await Promise.race([job(), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Document PDF export timed out.')), timeoutMs); })]);
  } finally {
    clearTimeout(timer);
    if (!window.isDestroyed()) window.destroy();
    isolatedSession.webRequest.onBeforeRequest(null);
  }
}

module.exports = { MAX_DOCUMENT_BYTES, PRINT_CSP, validatePrintDocument, preparePrintContent, renderDocumentPDF };
