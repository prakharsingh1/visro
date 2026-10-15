'use strict';

const path = require('node:path');
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const FORMATS = { png: { mime: 'image/png', extension: 'png' }, jpg: { mime: 'image/jpeg', extension: 'jpg' }, jpeg: { mime: 'image/jpeg', extension: 'jpg' }, svg: { mime: 'image/svg+xml', extension: 'svg' }, pdf: { mime: 'application/pdf', extension: 'pdf' }, html: { mime: 'text/html', extension: 'html' }, csv: { mime: 'text/csv', extension: 'csv' }, txt: { mime: 'text/plain', extension: 'txt' }, srt: { mime: 'application/x-subrip', extension: 'srt' }, vtt: { mime: 'text/vtt', extension: 'vtt' }, pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx' } };

function safeName(input, fallback = 'Untitled') {
  if (typeof input !== 'string') return fallback;
  return input.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '').trim().replace(/^\.+/, '').slice(0, 160) || fallback;
}

function sanitizeJSON(value, depth = 0, budget = { nodes: 0 }) {
  if (depth > 80 || ++budget.nodes > 1000000) throw new Error('This project is too complex to open.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => sanitizeJSON(item, depth + 1, budget));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const item = value[key];
      if (item !== undefined && typeof item !== 'function') result[key] = sanitizeJSON(item, depth + 1, budget);
    }
    return result;
  }
  throw new Error('This project contains invalid data.');
}

function serializeProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('Choose a valid Visro project.');
  let json;
  try { json = JSON.stringify(project); } catch { throw new Error('This project contains invalid data.'); }
  if (!json || Buffer.byteLength(json) > MAX_FILE_BYTES) throw new Error('Project files must be smaller than 100 MB.');
  const sanitized = JSON.stringify(sanitizeJSON(JSON.parse(json)), null, 2);
  if (Buffer.byteLength(sanitized) > MAX_FILE_BYTES) throw new Error('Project files must be smaller than 100 MB.');
  return sanitized;
}

function parseProject(content) {
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('Project files must be smaller than 100 MB.');
  let value;
  try { value = JSON.parse(content); } catch { throw new Error('This file is not a readable Visro project.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This file is not a readable Visro project.');
  return sanitizeJSON(value);
}

function decodeExport(input) {
  if (!input || typeof input !== 'object') throw new Error('Choose an export format.');
  const format = Object.hasOwn(FORMATS, input.format) ? FORMATS[input.format] : null;
  if (!format) throw new Error('Choose PNG, JPG, SVG, PDF, PPTX, HTML, CSV, TXT, SRT, or VTT export.');
  const name = safeName(input.name || 'Visro design').replace(/\.(png|jpe?g|svg|pdf|pptx|html|csv|txt|srt|vtt)$/i, '');
  let data;
  if (format.extension === 'svg') {
    if (typeof input.svg !== 'string') throw new Error('SVG export requires a readable SVG document.');
    if (!/<svg(?:\s|>)/i.test(input.svg) || /<(?:script|foreignObject)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)|<!ENTITY/i.test(input.svg)) {
      throw new Error('The SVG contains unsupported active or external content.');
    }
    data = Buffer.from(input.svg, 'utf8');
  } else {
    if (typeof input.dataURL !== 'string' || input.dataURL.length > MAX_FILE_BYTES * 1.4 + 100) throw new Error('Export data is missing or too large.');
    const match = /^data:([^;,]+)(?:;charset=utf-8)?;base64,([A-Za-z0-9+/]*={0,2})$/i.exec(input.dataURL);
    if (!match || match[1] !== format.mime || !match[2] || match[2].length % 4 !== 0) throw new Error('Export data does not match the chosen format.');
    data = Buffer.from(match[2], 'base64');
    if (data.toString('base64') !== match[2]) throw new Error('Export data is not valid base64.');
  }
  if (data.length > MAX_FILE_BYTES) throw new Error('Exports must be smaller than 100 MB.');
  if (format.extension === 'pptx' && (!data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || !data.includes(Buffer.from('ppt/presentation.xml')) || !data.includes(Buffer.from('[Content_Types].xml')))) throw new Error('PPTX export requires a valid PowerPoint ZIP package.');
  return { data, extension: format.extension, name: `${name}.${format.extension}` };
}

function resolveAsset(distDirectory, requestURL) {
  try {
    const url = new URL(requestURL);
    if (url.protocol !== 'visro:' || url.hostname !== 'app' || url.username || url.password || url.port) return null;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) return null;
    const resolved = path.resolve(distDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(distDirectory, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return resolved;
  } catch { return null; }
}

module.exports = { MAX_FILE_BYTES, safeName, serializeProject, parseProject, decodeExport, resolveAsset };
