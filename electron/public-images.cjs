'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = `Visro/${require('../package.json').version} public-image-library (https://github.com/prakharsingh1/visro)`;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const METADATA_KEYS = 'LicenseShortName|LicenseUrl|Copyrighted|AttributionRequired|NonFree|Artist|ImageDescription|Restrictions|DeletionReason';
const THUMBNAIL_REQUEST_SIDE = 330;

function rateLimitDelay(value, now = Date.now()) {
  const seconds = Number(value);
  const parsed = typeof value === 'string' && value.trim() && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.max(100, parsed) : 2000;
}

function text(value, limit = 2000) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { const point = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''; })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, n) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[n.toLowerCase()])
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function validateSearch(input) {
  if (!input || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 120 || /[\u0000-\u001f\u007f]/.test(input.query)) throw new Error('Enter a photo search of 1–120 characters.');
  const query = input.query.trim(), offset = input.offset ?? 0, limit = input.limit ?? 24, license = input.license ?? 'all';
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 30 || !['all', 'public-domain', 'cc0'].includes(license)) throw new Error('The photo search options are invalid.');
  // Literal words prevent user-supplied search operators replacing the license filter.
  const words = query.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.slice(0, 16);
  if (!words?.length) throw new Error('Enter words to find a photo.');
  const filter = license === 'cc0' ? 'P275=Q6938433' : license === 'public-domain' ? 'P6216=Q19652' : 'P6216=Q19652|P275=Q6938433';
  return { query, offset, limit, license, search: `${words.map(word => `"${word}"`).join(' ')} filetype:bitmap haswbstatement:${filter}` };
}

function validateGet(input) {
  if (!input || typeof input.id !== 'string' || !/^commons:[1-9]\d{0,11}$/.test(input.id) || !Number.isSafeInteger(Number(input.id.slice(8))) || (input.size !== undefined && !['thumbnail', 'image'].includes(input.size))) throw new Error('Choose a photo from the public image library.');
  return { id: input.id, size: input.size || 'image', pageid: Number(input.id.slice(8)) };
}

function uploadURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Commons returned an unsupported image location.'); }
  // Commons now sometimes returns thumb.wikimedia.org. Both use the same image
  // path; bytes are fetched exclusively from upload.wikimedia.org, without UTM.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)
    || !/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\//.test(url.pathname) || /%2f|%5c|%00|%0[ad]/i.test(url.pathname)) throw new Error('Commons returned an unsupported image location.');
  return `https://upload.wikimedia.org${url.pathname}`;
}

function licenseFor(metadata) {
  const value = key => text(metadata?.[key]?.value, 500), short = value('LicenseShortName');
  if (value('AttributionRequired').toLowerCase() !== 'false' || (value('NonFree') && !/^(?:false|0)$/i.test(value('NonFree'))) || value('DeletionReason')) return null;
  if (/^public domain$/i.test(short) && value('Copyrighted').toLowerCase() === 'false') {
    if (value('LicenseUrl')) {
      let url; try { url = new URL(value('LicenseUrl')); } catch { return null; }
      const known = ['creativecommons.org', 'www.creativecommons.org'].includes(url.hostname) && /^\/publicdomain\/(?:zero|mark)\/1\.0\/(?:deed(?:\.[a-z-]+)?)?$/.test(url.pathname)
        || url.hostname === 'commons.wikimedia.org' && url.pathname === '/wiki/Help:Public_domain';
      if (!known || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    }
    return { license: 'Public domain', licenseUrl: 'https://commons.wikimedia.org/wiki/Help:Public_domain' };
  }
  if (/^CC0(?: 1\.0)?$/i.test(short)) {
    let url;
    try { url = new URL(value('LicenseUrl')); } catch { return null; }
    // CC0 is a dedication: Commons may correctly report Copyrighted=True.
    if (!['http:', 'https:'].includes(url.protocol) || !['creativecommons.org', 'www.creativecommons.org'].includes(url.hostname) || url.port || url.username || url.password || !/^\/publicdomain\/zero\/1\.0\/(?:deed(?:\.[a-z-]+)?)?$/.test(url.pathname)) return null;
    return { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
  }
  return null;
}

function imageRecord(page) {
  const info = page?.imageinfo?.[0], license = licenseFor(info?.extmetadata);
  if (!license || page.ns !== 6 || !Number.isSafeInteger(page.pageid) || page.pageid < 1 || page.missing || page.imagerepository !== 'local' || typeof page.title !== 'string' || !page.title.startsWith('File:') || page.title.length > 500 || !IMAGE_MIMES.has(info.mime)
    || !Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width < 1 || info.height < 1 || info.width > 100000 || info.height > 100000 || !/^[a-z0-9]{20,64}$/i.test(info.sha1 || '')) return null;
  let originalURL, thumbnailURL;
  try { originalURL = uploadURL(info.url); thumbnailURL = info.thumburl ? uploadURL(info.thumburl) : originalURL; } catch { return null; }
  const image = { id: `commons:${page.pageid}`, title: page.title, name: text(page.title.slice(5).replace(/_/g, ' ').replace(/\.[a-z0-9]+$/i, ''), 300), description: text(info.extmetadata?.ImageDescription?.value), artist: text(info.extmetadata?.Artist?.value, 500), width: info.width, height: info.height, ...license,
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, restrictions: text(info.extmetadata?.Restrictions?.value, 500) };
  return { image, originalURL, thumbnailURL, mime: info.mime, thumbnailMime: info.thumbmime || info.mime, sha1: info.sha1, index: Number(page.index) || 0 };
}

async function readBytes(response, max) {
  if (Number(response.headers?.get?.('content-length')) > max) throw new Error('The public image response is too large.');
  const chunks = []; let size = 0;
  if (response.body?.[Symbol.asyncIterator]) {
    for await (const chunk of response.body) { size += chunk.length; if (size > max) throw new Error('The public image response is too large.'); chunks.push(Buffer.from(chunk)); }
  } else { const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > max) throw new Error('The public image response is too large.'); chunks.push(bytes); }
  return Buffer.concat(chunks);
}

function rasterInfo(bytes) {
  let mime, width, height;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    mime = 'image/png'; width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg'; let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++]; if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset); if (size < 2 || offset + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) { height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break; }
      offset += size;
    }
  } else if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    mime = 'image/webp'; const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
    else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
    else if (kind === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff); }
  }
  if (!mime || !width || !height || width > 8192 || height > 8192 || width * height > 32 * 1024 * 1024) throw new Error('Commons did not return a supported, bounded raster image.');
  return { mime, imageWidth: width, imageHeight: height };
}

function createPublicImageService({ root, fetch: fetcher = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || typeof fetcher !== 'function') throw new Error('Configure a local public image cache.');
  const directory = path.join(root, 'public-images'), records = new Map(), searches = new Map(), pending = new Map(), waiting = [];
  let requests = 0, cooldownUntil = 0, cacheWrites = Promise.resolve();
  const remember = record => { records.delete(record.image.id); records.set(record.image.id, record); if (records.size > 200) records.delete(records.keys().next().value); };
  async function acquire() {
    if (requests < 4) { requests++; return; }
    if (waiting.length >= 32) throw new Error('Photo downloads are busy. Try again in a moment.');
    await new Promise((resolve, reject) => {
      const item = { resolve, timer: null };
      item.timer = setTimeout(() => { const index = waiting.indexOf(item); if (index >= 0) { waiting.splice(index, 1); reject(new Error('The photo request took too long. Try again.')); } }, timeoutMs);
      waiting.push(item);
    });
  }
  function release() {
    requests--;
    const item = waiting.shift();
    if (item) { clearTimeout(item.timer); requests++; item.resolve(); }
  }
  const rateLimitError = () => new Error(`Wikimedia Commons is busy. Try again in ${Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000))} seconds.`);
  async function providerReady() {
    const deadline = Date.now() + 5000;
    while (cooldownUntil > Date.now()) {
      const remaining = cooldownUntil - Date.now();
      if (Date.now() + remaining > deadline) throw rateLimitError();
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }
  async function request(url, limit, accept) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await providerReady(); await acquire();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // A queued request may have entered before another response set cooldown.
        await providerReady();
        const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, credentials: 'omit', redirect: 'manual', signal: controller.signal });
        if (response.status === 429) {
          cooldownUntil = Math.max(cooldownUntil, Date.now() + rateLimitDelay(response.headers?.get?.('retry-after')));
          await response.body?.cancel?.().catch(() => {});
          if (attempt === 0 && cooldownUntil - Date.now() <= 5000) continue;
          throw rateLimitError();
        }
        if (response.status >= 300 && response.status < 400) throw new Error('Commons returned an unsupported download redirect.');
        if (!response.ok) throw new Error('Cannot load photos from Wikimedia Commons right now.');
        const type = (response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
        if (accept === 'application/json' ? type !== 'application/json' : !IMAGE_MIMES.has(type)) throw new Error('Commons returned an unsupported response type.');
        return { data: await readBytes(response, limit), mime: type };
      } catch (error) {
        if (controller.signal.aborted || error.name === 'AbortError') throw new Error('The photo request took too long. Try again.');
        if (error instanceof TypeError) throw new Error('Cannot reach Wikimedia Commons. Check your internet connection.');
        throw error;
      } finally { clearTimeout(timer); controller.abort(); release(); }
    }
  }
  async function api(params) {
    const url = new URL(API); url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params });
    const response = await request(url.href, MAX_METADATA_BYTES, 'application/json');
    let data; try { data = JSON.parse(response.data.toString('utf8')); } catch { throw new Error('Commons returned unreadable photo metadata.'); }
    if (data.error) throw new Error('Wikimedia Commons could not complete this search.');
    return data;
  }
  const infoParams = side => ({ prop: 'imageinfo', iiprop: 'url|size|mime|sha1|extmetadata', iiurlwidth: String(side), iiurlheight: String(side), iiextmetadatalanguage: 'en', iiextmetadatafilter: METADATA_KEYS });
  async function search(input) {
    const value = validateSearch(input), key = JSON.stringify([value.query, value.offset, value.limit, value.license]), cached = searches.get(key);
    if (cached && Date.now() - cached.time < 300000) return cached.result;
    if (pending.has(`search:${key}`)) return pending.get(`search:${key}`);
    const operation = (async () => {
      const result = await api({ generator: 'search', gsrsearch: value.search, gsrnamespace: '6', gsrlimit: String(value.limit), gsroffset: String(value.offset), ...infoParams(THUMBNAIL_REQUEST_SIDE) });
      const found = (Array.isArray(result.query?.pages) ? result.query.pages : []).map(imageRecord).filter(Boolean).sort((a, b) => a.index - b.index);
      const accepted = found.filter(record => value.license === 'all' || record.image.license === (value.license === 'cc0' ? 'CC0' : 'Public domain'));
      accepted.forEach(remember);
      const offset = result.continue?.gsroffset, response = { provider: 'wikimedia-commons', query: value.query, items: accepted.map(record => record.image), nextOffset: Number.isInteger(offset) && offset > value.offset && offset <= 10000 ? offset : null };
      searches.set(key, { time: Date.now(), result: response }); if (searches.size > 30) searches.delete(searches.keys().next().value);
      return response;
    })();
    pending.set(`search:${key}`, operation); try { return await operation; } finally { pending.delete(`search:${key}`); }
  }
  const cacheKey = input => createHash('sha256').update(`${input.id}:${input.size}`).digest('hex');
  async function readCache(input) {
    const key = cacheKey(input);
    try {
      const metadataStat = await fs.stat(path.join(directory, `${key}.json`)); if (metadataStat.size > 12000) return null;
      const stored = JSON.parse(await fs.readFile(path.join(directory, `${key}.json`), 'utf8'));
      if (stored.image?.id !== input.id || !['CC0', 'Public domain'].includes(stored.image?.license) || stored.version !== 1) return null;
      const file = path.join(directory, `${key}.bin`), stat = await fs.stat(file); if (stat.size > MAX_IMAGE_BYTES || stat.size !== stored.bytes) return null;
      const data = await fs.readFile(file), info = rasterInfo(data);
      if (createHash('sha256').update(data).digest('hex') !== stored.sha256 || info.mime !== stored.mime || Math.max(info.imageWidth, info.imageHeight) > (input.size === 'thumbnail' ? 480 : 2400)) return null;
      return { ...stored.image, ...info, bytes: data.length, data: `data:${info.mime};base64,${data.toString('base64')}` };
    } catch { return null; }
  }
  async function saveCache(input, image, info, data) {
    const write = async () => {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const key = cacheKey(input), json = JSON.stringify({ version: 1, image, ...info, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
      await fs.writeFile(path.join(directory, `${key}.bin.tmp`), data, { mode: 0o600 }); await fs.rename(path.join(directory, `${key}.bin.tmp`), path.join(directory, `${key}.bin`));
      await fs.writeFile(path.join(directory, `${key}.json.tmp`), json, { mode: 0o600 }); await fs.rename(path.join(directory, `${key}.json.tmp`), path.join(directory, `${key}.json`));
      const files = await fs.readdir(directory), sizes = await Promise.all(files.filter(file => /^[a-f0-9]{64}\.bin$/.test(file)).map(async file => ({ file, ...(await fs.stat(path.join(directory, file))) })));
      let total = sizes.reduce((sum, stat) => sum + stat.size, 0), count = sizes.length;
      for (const stat of sizes.sort((a, b) => a.mtimeMs - b.mtimeMs)) { if (total <= MAX_CACHE_BYTES && count <= 200) break; if (stat.file === `${key}.bin`) continue; await fs.rm(path.join(directory, stat.file), { force: true }); await fs.rm(path.join(directory, stat.file.replace(/\.bin$/, '.json')), { force: true }); total -= stat.size; count--; }
    };
    cacheWrites = cacheWrites.catch(() => {}).then(write); await cacheWrites;
  }
  async function get(input) {
    const value = validateGet(input), key = cacheKey(value);
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      const cached = await readCache(value); if (cached) return cached;
      let record = records.get(value.id), requestedSide = value.size === 'thumbnail' ? THUMBNAIL_REQUEST_SIDE : 2400;
      if (!record || value.size === 'image') {
        const data = await api({ pageids: String(value.pageid), ...infoParams(requestedSide) });
        const page = data.query?.pages?.find(page => page.pageid === value.pageid); record = imageRecord(page);
        if (!record) throw new Error('This photo is not verified as public domain or CC0.');
        if (value.size === 'thumbnail') remember(record);
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await request(record.thumbnailURL, MAX_IMAGE_BYTES, 'image/jpeg,image/png,image/webp'), info = rasterInfo(response.data);
        if (info.mime !== response.mime) throw new Error('Commons returned mismatched image bytes.');
        const side = Math.max(info.imageWidth, info.imageHeight), maximum = value.size === 'thumbnail' ? 480 : 2400;
        if (side <= maximum) {
          await saveCache(value, record.image, info, response.data);
          return { ...record.image, ...info, bytes: response.data.length, data: `data:${info.mime};base64,${response.data.toString('base64')}` };
        }
        // Commons selects pregenerated thumbnail buckets, which can exceed its
        // reported thumbwidth/height. Check real bytes and step below the bucket.
        if (attempt === 2) break;
        requestedSide = Math.max(1, Math.floor(requestedSide * maximum / side * .66));
        const data = await api({ pageids: String(value.pageid), ...infoParams(requestedSide) });
        record = imageRecord(data.query?.pages?.find(page => page.pageid === value.pageid));
        if (!record) throw new Error('This photo is not verified as public domain or CC0.');
      }
      throw new Error('Commons could not provide a photo at the supported image size.');
    })();
    pending.set(key, operation); try { return await operation; } finally { pending.delete(key); }
  }
  return { search, get };
}

module.exports = { createPublicImageService, validateSearch, validateGet, uploadURL, licenseFor, imageRecord, rasterInfo, rateLimitDelay, MAX_IMAGE_BYTES, MAX_METADATA_BYTES };
