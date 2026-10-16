const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPublicImageService, validateSearch, validateGet, uploadURL, licenseFor, imageRecord, rasterInfo, rateLimitDelay, MAX_IMAGE_BYTES } = require('../electron/public-images.cjs');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrZkAAAAASUVORK5CYII=', 'base64');
const metadata = (license = 'Public domain', extra = {}) => ({ LicenseShortName: { value: license }, Copyrighted: { value: license === 'Public domain' ? 'False' : 'True' }, AttributionRequired: { value: 'false' }, Artist: { value: '<a href="https://example.invalid">Artist &amp; author</a>' }, ImageDescription: { value: '<p>A photo &#x1f30d;</p>' }, ...(license === 'CC0' ? { LicenseUrl: { value: 'http://creativecommons.org/publicdomain/zero/1.0/deed.en' } } : {}), ...extra });
const page = (id = 123, license = 'Public domain', extra = {}) => ({ pageid: id, ns: 6, title: 'File:Landscape.png', imagerepository: 'local', index: id, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Landscape.png?utm_source=test', thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Landscape.png/480px-Landscape.png?utm_source=test', width: 1000, height: 500, mime: 'image/png', sha1: 'f'.repeat(40), extmetadata: metadata(license), ...extra }] });
const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8' } });
async function temporary(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-public-images-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }

test('public image search and item inputs are bounded and cannot replace the license predicate', () => {
  const request = validateSearch({ query: 'mountain OR -haswbstatement:evil', license: 'cc0', limit: 30, offset: 30 });
  assert.equal(request.search, '"mountain" "OR" "haswbstatement" "evil" filetype:bitmap haswbstatement:P275=Q6938433');
  assert.match(validateSearch({ query: '日本 旅行' }).search, /"日本" "旅行"/);
  for (const input of [{}, { query: '' }, { query: 'x'.repeat(121) }, { query: 'x\n' }, { query: 'lake', limit: 31 }, { query: 'lake', offset: -1 }, { query: 'lake', license: 'cc-by' }]) assert.throws(() => validateSearch(input));
  assert.deepEqual(validateGet({ id: 'commons:123' }), { id: 'commons:123', pageid: 123, size: 'image' });
  for (const input of [{ id: 'https://example.invalid' }, { id: 'commons:0' }, { id: 'commons:123/..' }, { id: 'commons:123', size: 'original' }, { title: 'File:Landscape.png' }]) assert.throws(() => validateGet(input));
});

test('Commons metadata admits only explicit public domain or valid CC0 dedication', () => {
  assert.equal(licenseFor(metadata()).license, 'Public domain');
  assert.equal(licenseFor(metadata('CC0')).license, 'CC0'); // Copyrighted=True is normal for CC0.
  for (const value of [metadata('CC BY 4.0'), metadata('CC BY-SA 4.0'), metadata('No known copyright restrictions'), metadata('Public domain', { Copyrighted: { value: 'True' } }), metadata('CC0', { LicenseUrl: { value: 'https://creativecommons.org.evil.invalid/publicdomain/zero/1.0/' } }), metadata('CC0', { LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' } }), metadata('Public domain', { AttributionRequired: { value: 'true' } }), metadata('CC0', { NonFree: { value: 'true' } }), metadata('CC0', { DeletionReason: { value: 'Disputed license' } })]) assert.equal(licenseFor(value), null);
  const record = imageRecord(page());
  assert.equal(record.image.artist, 'Artist & author'); assert.equal(record.image.description, 'A photo 🌍');
  assert.equal(record.thumbnailURL, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Landscape.png/480px-Landscape.png');
  assert.equal(imageRecord(page(123, 'Public domain', { mime: 'image/svg+xml' })), null);
  assert.equal(imageRecord({ ...page(), ns: 0 }), null);
  assert.equal(licenseFor(metadata('Public domain', { LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' } })), null);
  assert.equal(licenseFor(metadata('Public domain', { LicenseUrl: { value: 'https://creativecommons.org/publicdomain/mark/1.0/' } })).license, 'Public domain');
});

test('image URL canonicalization accepts only vetted Commons raster paths without redirects or tracking', () => {
  assert.equal(uploadURL('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/500px-Test.jpg?utm_source=foo'), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/500px-Test.jpg');
  for (const url of ['http://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg', 'https://upload.wikimedia.org.evil.invalid/wikipedia/commons/a/ab/Test.jpg', 'https://u:p@upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg', 'https://upload.wikimedia.org:4433/wikipedia/commons/a/ab/Test.jpg', 'https://upload.wikimedia.org/wikipedia/en/a/ab/Test.jpg', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/%2fsecret', 'https://127.0.0.1/private']) assert.throws(() => uploadURL(url));
  assert.deepEqual(rasterInfo(png), { mime: 'image/png', imageWidth: 1, imageHeight: 1 });
  assert.throws(() => rasterInfo(Buffer.from('<svg/>')));
  const oversized = Buffer.from(png); oversized.writeUInt32BE(100000, 16); assert.throws(() => rasterInfo(oversized));
});

test('metadata search filters licenses, preserves ranking/pagination, sends no credentials, and coalesces requests', async t => {
  const root = await temporary(t), calls = [];
  const fetcher = async (url, options) => { calls.push({ url: new URL(url), options }); return response({ continue: { gsroffset: 24 }, query: { pages: [page(3, 'CC BY-SA 4.0'), page(2, 'CC0'), page(1)] } }); };
  const service = createPublicImageService({ root, fetch: fetcher });
  const [result, duplicate] = await Promise.all([service.search({ query: 'mountain' }), service.search({ query: 'mountain' })]);
  assert.deepEqual(result, duplicate); assert.equal(calls.length, 1); assert.deepEqual(result.items.map(item => item.id), ['commons:1', 'commons:2']); assert.equal(result.nextOffset, 24);
  assert.equal(calls[0].url.origin, 'https://commons.wikimedia.org'); assert.equal(calls[0].url.pathname, '/w/api.php'); assert.equal(calls[0].url.searchParams.get('gsrnamespace'), '6'); assert.equal(calls[0].url.searchParams.get('gsrlimit'), '24');
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.redirect, 'manual'); assert.match(calls[0].options.headers['User-Agent'], /Visro/);
  assert.ok(!JSON.stringify(result).includes('thumb.wikimedia.org')); assert.ok(!JSON.stringify(result).includes('upload.wikimedia.org'));
  await service.search({ query: 'mountain' }); assert.equal(calls.length, 1);
  const cc0 = await service.search({ query: 'mountain', license: 'cc0' }); assert.deepEqual(cc0.items.map(item => item.license), ['CC0']);
});

test('lazy images resolve page IDs, bound dimensions, cache bytes privately, and reopen offline without network', async t => {
  const root = await temporary(t), calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new URL(url).hostname === 'commons.wikimedia.org' ? response({ query: { pages: [page()] } }) : new Response(png, { headers: { 'content-type': 'image/png' } });
  };
  const service = createPublicImageService({ root, fetch: fetcher });
  const [image, duplicate] = await Promise.all([service.get({ id: 'commons:123', size: 'image' }), service.get({ id: 'commons:123', size: 'image' })]);
  assert.deepEqual(image, duplicate); assert.equal(calls.length, 2); assert.equal(calls[0].url.searchParams.get('pageids'), '123'); assert.equal(calls[0].url.searchParams.get('iiurlwidth'), '2400'); assert.equal(calls[0].url.searchParams.get('iiurlheight'), '2400'); assert.equal(calls[1].url.hostname, 'upload.wikimedia.org'); assert.equal(calls[1].url.search, '');
  assert.equal(image.data, `data:image/png;base64,${png.toString('base64')}`); assert.equal(image.imageWidth, 1); assert.equal(image.bytes, png.length);
  let offlineCalls = 0;
  const offline = createPublicImageService({ root, fetch: async () => { offlineCalls++; throw new TypeError('offline'); } });
  assert.deepEqual(await offline.get({ id: 'commons:123' }), image); assert.equal(offlineCalls, 0);
  const files = await fs.readdir(path.join(root, 'public-images')); assert.equal(files.length, 2); assert.ok(files.every(file => /^[a-f0-9]{64}\.(?:bin|json)$/.test(file)));
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(root, 'public-images', files[0]))).mode & 0o777, 0o600);
  // Imported design-size content must not overwrite the smaller thumbnail URL.
  await service.get({ id: 'commons:123', size: 'thumbnail' }); assert.equal(calls[2].url.searchParams.get('iiurlwidth'), '330');
});

test('failed licensing, oversized bytes, MIME spoofing, redirects, bad JSON, and timeout never enter the image cache', async t => {
  const root = await temporary(t);
  const rejects = [
    async url => new URL(url).hostname === 'commons.wikimedia.org' ? response({ query: { pages: [page(123, 'CC BY 4.0')] } }) : new Response(png, { headers: { 'content-type': 'image/png' } }),
    async url => new URL(url).hostname === 'commons.wikimedia.org' ? response({ query: { pages: [page()] } }) : new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(MAX_IMAGE_BYTES + 1) } }),
    async url => new URL(url).hostname === 'commons.wikimedia.org' ? response({ query: { pages: [page()] } }) : new Response('<svg/>', { headers: { 'content-type': 'image/png' } }),
    async url => new URL(url).hostname === 'commons.wikimedia.org' ? response({ query: { pages: [page()] } }) : new Response(png, { headers: { 'content-type': 'image/jpeg' } }),
    async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }),
    async () => new Response('bad JSON', { headers: { 'content-type': 'application/json' } }),
    async (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true })),
  ];
  for (const fetcher of rejects) await assert.rejects(createPublicImageService({ root, fetch: fetcher, timeoutMs: 10 }).get({ id: 'commons:123' }));
  assert.deepEqual(await fs.readdir(root), []);
});

test('Commons thumbnail buckets are measured from actual bytes and retried smaller before caching', async t => {
  const root = await temporary(t), calls = [], large = Buffer.from(png), smaller = Buffer.from(png);
  large.writeUInt32BE(500, 16); large.writeUInt32BE(250, 20); smaller.writeUInt32BE(330, 16); smaller.writeUInt32BE(165, 20);
  let binaryReads = 0;
  const service = createPublicImageService({ root, fetch: async url => {
    const parsed = new URL(url); calls.push(parsed);
    if (parsed.hostname === 'commons.wikimedia.org') return response({ query: { pages: [page()] } });
    return new Response(++binaryReads === 1 ? large : smaller, { headers: { 'content-type': 'image/png' } });
  } });
  const image = await service.get({ id: 'commons:123', size: 'thumbnail' });
  assert.equal(image.imageWidth, 330); assert.equal(binaryReads, 2); assert.equal(calls[0].searchParams.get('iiurlwidth'), '330'); assert.ok(Number(calls[2].searchParams.get('iiurlwidth')) < 330);
});

test('rapid search/filter thumbnail bursts queue fairly without exceeding four active network requests', async t => {
  const root = await temporary(t); let active = 0, maximum = 0, completed = 0;
  const service = createPublicImageService({ root, fetch: async url => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    const parsed = new URL(url), result = parsed.hostname === 'commons.wikimedia.org' ? response({ query: { pages: [page(Number(parsed.searchParams.get('pageids')))] } }) : new Response(png, { headers: { 'content-type': 'image/png' } });
    active--; completed++; return result;
  } });
  const images = await Promise.all(Array.from({ length: 16 }, (_, index) => service.get({ id: `commons:${index + 1}`, size: 'thumbnail' })));
  assert.equal(images.length, 16); assert.equal(completed, 32); assert.equal(maximum, 4); assert.equal(active, 0);
});

test('Commons throttling honors Retry-After, retries short waits once, and gates later requests during a long cooldown', async t => {
  const root = await temporary(t); let calls = 0;
  assert.equal(rateLimitDelay('3', 0), 3000); assert.equal(rateLimitDelay('Thu, 01 Jan 1970 00:00:04 GMT', 1000), 3000); assert.equal(rateLimitDelay(null, 0), 2000);
  const retry = createPublicImageService({ root, fetch: async () => ++calls === 1 ? new Response('busy', { status: 429, headers: { 'retry-after': '0' } }) : response({ query: { pages: [page()] } }) });
  assert.equal((await retry.search({ query: 'lake' })).items.length, 1); assert.equal(calls, 2);
  let throttledCalls = 0;
  const cooldown = createPublicImageService({ root, fetch: async () => { throttledCalls++; return new Response('busy', { status: 429, headers: { 'retry-after': '60' } }); } });
  await assert.rejects(cooldown.search({ query: 'lake' }), /Commons is busy/);
  await assert.rejects(cooldown.search({ query: 'forest' }), /Commons is busy/);
  assert.equal(throttledCalls, 1, 'A provider cooldown must suppress subsequent network requests, not hammer 429 responses.');
});

test('live Commons public-domain search, preview, import, and offline reuse', { skip: process.env.VISRO_LIVE_PUBLIC_IMAGES !== '1', timeout: 90000 }, async t => {
  const root = await temporary(t), service = createPublicImageService({ root });
  const result = await service.search({ query: 'mountain', limit: 6 }); assert.ok(result.items.length > 0); assert.ok(result.items.every(item => ['CC0', 'Public domain'].includes(item.license)));
  const item = result.items.find(item => item.width < 5000 && item.height < 5000) || result.items[0];
  const thumbnail = await service.get({ id: item.id, size: 'thumbnail' }), image = await service.get({ id: item.id, size: 'image' });
  assert.ok(thumbnail.bytes > 1000 && image.bytes > 1000); assert.ok(thumbnail.imageWidth <= image.imageWidth); assert.ok(Math.max(thumbnail.imageWidth, thumbnail.imageHeight) <= 480); assert.ok(Math.max(image.imageWidth, image.imageHeight) <= 2400);
  const offline = createPublicImageService({ root, fetch: async () => { throw new Error('Must not use network for cached images.'); } });
  assert.equal((await offline.get({ id: item.id })).data, image.data);
  console.log(JSON.stringify({ publicImageLive: { count: result.items.length, item: item.id, title: item.title, license: item.license, thumbnailBytes: thumbnail.bytes, imageBytes: image.bytes, dimensions: [image.imageWidth, image.imageHeight], offline: true } }));
});
