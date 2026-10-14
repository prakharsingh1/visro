'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSettingsStore } = require('../electron/settings.cjs');
const { parseProject, serializeProject, decodeExport, resolveAsset, safeName } = require('../electron/files.cjs');
const { devURL, httpsURL, contentSecurityPolicy, createAssetHandler } = require('../electron/main.cjs');

const KEY = 'fake-gemini-key-for-tests-123456';
const CIPHER = Buffer.from('opaque-system-keychain-ciphertext');
const storage = { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async (key) => { assert.equal(key, KEY); return CIPHER; }, decryptStringAsync: async (cipher) => { assert.deepEqual(cipher, CIPHER); return { result: KEY, shouldReEncrypt: false }; } };

async function fixture(t, mock = storage) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-key-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, store: createSettingsStore({ directory, safeStorage: mock }) };
}

test('passive settings reads and model changes never probe or decrypt Keychain, even with a saved encrypted key', async (t) => {
  let calls = 0;
  const forbidden = () => { calls++; throw new Error('Passive reads must never enter Keychain.'); };
  const { directory, store } = await fixture(t, { isEncryptionAvailable: forbidden, encryptString: forbidden, decryptString: forbidden, isAsyncEncryptionAvailable: forbidden, encryptStringAsync: forbidden, decryptStringAsync: forbidden });
  const empty = await store.getSettings();
  assert.equal(empty.hasKey, false);
  assert.equal(Object.hasOwn(empty, 'encryptionAvailable'), false);
  assert.equal(Object.hasOwn(empty, 'secureStorage'), false);
  await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ encryptedKey: CIPHER.toString('base64'), textModel: 'gemini-test-model' }));
  const saved = await store.getSettings();
  assert.equal(saved.hasKey, true);
  assert.equal(saved.textModel, 'gemini-test-model');
  assert.equal(saved.apiKey, undefined);
  assert.equal(saved.encryptedKey, undefined);
  assert.ok(!JSON.stringify(saved).includes(CIPHER.toString('base64')));
  assert.equal(saved.encryptionAvailable, undefined);
  await store.saveSettings({ imageModel: 'image-new', apiKey: '' });
  assert.equal((await store.getSettings()).hasKey, true);
  await store.saveSettings({ clearKey: true });
  assert.equal((await store.getSettings()).hasKey, false);
  await assert.rejects(store.getCredentials(), /add your Gemini API key/i);
  assert.equal(calls, 0);
});

test('explicit key save and AI credential use perform real secure checks while later passive reads use cached capability', async (t) => {
  let checks = 0, encryptions = 0, decryptions = 0;
  const { store } = await fixture(t, {
    isAsyncEncryptionAvailable: async () => { checks++; return true; },
    encryptStringAsync: async (key) => { encryptions++; assert.equal(key, KEY); return CIPHER; },
    decryptStringAsync: async (cipher) => { decryptions++; assert.deepEqual(cipher, CIPHER); return { result: KEY, shouldReEncrypt: false }; },
  });
  assert.equal((await store.saveSettings({ apiKey: KEY })).encryptionAvailable, true);
  assert.deepEqual({ checks, encryptions, decryptions }, { checks: 1, encryptions: 1, decryptions: 0 });
  assert.equal((await store.getSettings()).secureStorage, true);
  assert.equal(checks, 1);
  assert.equal((await store.getCredentials()).apiKey, KEY);
  assert.deepEqual({ checks, encryptions, decryptions }, { checks: 2, encryptions: 1, decryptions: 1 });
});

test('delayed asynchronous secure storage preserves the event-loop heartbeat and never invokes synchronous APIs', async (t) => {
  let synchronousCalls = 0, ticks = 0;
  const forbidden = () => { synchronousCalls++; throw new Error('Synchronous secure storage is forbidden.'); };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const provider = {
    isEncryptionAvailable: forbidden, encryptString: forbidden, decryptString: forbidden,
    isAsyncEncryptionAvailable: async () => { await delay(30); return true; },
    encryptStringAsync: async (key) => { await delay(20); assert.equal(key, KEY); return CIPHER; },
    decryptStringAsync: async (cipher) => { await delay(20); assert.deepEqual(cipher, CIPHER); return { result: KEY, shouldReEncrypt: false }; },
  };
  const { directory, store } = await fixture(t, provider);
  const timer = setInterval(() => ticks++, 5);
  t.after(() => clearInterval(timer));
  await store.saveSettings({ apiKey: KEY });
  const restored = createSettingsStore({ directory, safeStorage: provider });
  assert.equal((await restored.getSettings()).hasKey, true);
  assert.equal((await restored.getSettings()).encryptionAvailable, undefined);
  assert.equal((await restored.getCredentials()).apiKey, KEY);
  assert.ok(ticks >= 8, 'Timers must continue during asynchronous Keychain initialization/encryption/decryption.');
  assert.equal(synchronousCalls, 0);
});

test('legacy ciphertext rotates through the async provider without dropping concurrent model changes', async (t) => {
  const legacy = Buffer.from('v10-legacy-cipher'), rotated = Buffer.from('current-protected-cipher');
  let beginEncryption, finishEncryption;
  const started = new Promise((resolve) => { beginEncryption = resolve; });
  const encrypted = new Promise((resolve) => { finishEncryption = resolve; });
  const { directory, store } = await fixture(t, {
    isAsyncEncryptionAvailable: async () => true,
    decryptStringAsync: async (cipher) => { assert.deepEqual(cipher, legacy); return { result: KEY, shouldReEncrypt: true }; },
    encryptStringAsync: async (key) => { assert.equal(key, KEY); beginEncryption(); return encrypted; },
  });
  await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ encryptedKey: legacy.toString('base64'), textModel: 'original-model' }));
  const credential = store.getCredentials();
  await started;
  await store.saveSettings({ textModel: 'latest-model', imageModel: 'latest-image', voiceModel: 'latest-voice', videoModel: 'latest-video' });
  finishEncryption(rotated);
  assert.equal((await credential).apiKey, KEY);
  const disk = JSON.parse(await fs.readFile(path.join(directory, 'settings.json'), 'utf8'));
  assert.equal(disk.encryptedKey, rotated.toString('base64'));
  assert.equal(disk.textModel, 'latest-model');
  assert.equal(disk.imageModel, 'latest-image');
  assert.equal(disk.voiceModel, 'latest-voice');
  assert.equal(disk.videoModel, 'latest-video');
  assert.ok(!JSON.stringify(disk).includes(KEY));
  assert.equal((await fs.stat(path.join(directory, 'settings.json'))).mode & 0o777, 0o600);
});

test('explicit key removal or replacement wins over delayed async ciphertext rotation', async (t) => {
  for (const operation of ['clear', 'replace']) {
    const legacy = Buffer.from('v10-legacy-cipher'), rotated = Buffer.from('rotated-cipher'), replacement = Buffer.from('replacement-cipher');
    const newKey = 'fake-replacement-gemini-key-123456';
    let beginEncryption, finishEncryption;
    const started = new Promise((resolve) => { beginEncryption = resolve; });
    const pending = new Promise((resolve) => { finishEncryption = resolve; });
    const { directory, store } = await fixture(t, {
      isAsyncEncryptionAvailable: async () => true,
      decryptStringAsync: async () => ({ result: KEY, shouldReEncrypt: true }),
      encryptStringAsync: async (key) => { if (key === newKey) return replacement; beginEncryption(); return pending; },
    });
    await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ encryptedKey: legacy.toString('base64') }));
    const credential = store.getCredentials(); await started;
    await store.saveSettings(operation === 'clear' ? { clearKey: true } : { apiKey: newKey });
    finishEncryption(rotated); await credential;
    const disk = JSON.parse(await fs.readFile(path.join(directory, 'settings.json'), 'utf8'));
    assert.equal(disk.encryptedKey, operation === 'clear' ? null : replacement.toString('base64'));
  }
});

test('missing async methods never fall back to synchronous storage or overwrite an existing ciphertext', async (t) => {
  let synchronousCalls = 0;
  const forbidden = () => { synchronousCalls++; throw new Error('Forbidden sync fallback.'); };
  const { directory, store } = await fixture(t, { isEncryptionAvailable: forbidden, encryptString: forbidden, decryptString: forbidden });
  await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ encryptedKey: CIPHER.toString('base64') }));
  await assert.rejects(store.saveSettings({ apiKey: KEY }), /secure key storage is unavailable/i);
  await assert.rejects(store.getCredentials(), /unlock your macOS keychain/i);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'settings.json'), 'utf8')).encryptedKey, CIPHER.toString('base64'));
  assert.equal(synchronousCalls, 0);
});

test('saved API keys are encrypted, private on disk, and absent from public settings', async (t) => {
  const { directory, store } = await fixture(t);
  assert.equal((await store.getSettings()).hasKey, false);
  const returned = await store.saveSettings({ apiKey: KEY, textModel: 'gemini-test-model' });
  assert.equal(returned.hasKey, true);
  assert.ok(!JSON.stringify(returned).includes(KEY));
  assert.equal(returned.apiKey, undefined);
  const disk = await fs.readFile(path.join(directory, 'settings.json'), 'utf8');
  assert.ok(!disk.includes(KEY));
  assert.equal(JSON.parse(disk).encryptedKey, CIPHER.toString('base64'));
  assert.equal((await fs.stat(path.join(directory, 'settings.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await store.getCredentials(), { apiKey: KEY, textModel: 'gemini-test-model', imageModel: 'gemini-2.5-flash-image', voiceModel: 'gemini-3.1-flash-tts-preview', videoModel: 'veo-3.1-generate-preview' });
});

test('blank key updates preserve credentials; explicit deletion removes them', async (t) => {
  const { store } = await fixture(t);
  await store.saveSettings({ apiKey: KEY });
  await store.saveSettings({ apiKey: '', imageModel: 'image-new' });
  assert.equal((await store.getSettings()).hasKey, true);
  await store.saveSettings({ clearKey: true });
  assert.equal((await store.getSettings()).hasKey, false);
  await assert.rejects(store.getCredentials(), /add your Gemini API key/i);
});

test('secure storage absence never falls back to storing a key as plaintext', async (t) => {
  const { directory, store } = await fixture(t, { isAsyncEncryptionAvailable: async () => false, encryptStringAsync: async () => { throw new Error('must not encrypt'); }, decryptStringAsync: async () => { throw new Error('must not decrypt'); } });
  await assert.rejects(store.saveSettings({ apiKey: KEY }), /secure key storage/i);
  await assert.rejects(fs.access(path.join(directory, 'settings.json')));
  assert.equal((await store.getSettings()).encryptionAvailable, false);
});

test('concurrent settings writes preserve both the key and selected models', async (t) => {
  const { store } = await fixture(t);
  await Promise.all([store.saveSettings({ apiKey: KEY }), store.saveSettings({ textModel: 'text-a' }), store.saveSettings({ imageModel: 'image-b' })]);
  assert.deepEqual(await store.getCredentials(), { apiKey: KEY, textModel: 'text-a', imageModel: 'image-b', voiceModel: 'gemini-3.1-flash-tts-preview', videoModel: 'veo-3.1-generate-preview' });
});

test('malformed settings do not expose file content or secrets in errors', async (t) => {
  const { directory, store } = await fixture(t);
  await fs.writeFile(path.join(directory, 'settings.json'), KEY);
  await assert.rejects(store.getSettings(), (error) => { assert.ok(!error.message.includes(KEY)); return true; });
});

test('project parsing strips prototype manipulation at every nested level', () => {
  const parsed = parseProject('{"name":"Design","__proto__":{"polluted":true},"pages":[{"canvas":{"constructor":{"prototype":{"polluted":true}},"objects":[]}}]}');
  assert.equal(Object.hasOwn(parsed, '__proto__'), false);
  assert.equal(Object.hasOwn(parsed.pages[0].canvas, 'constructor'), false);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(JSON.parse(serializeProject(parsed)), parsed);
  assert.throws(() => parseProject('not JSON'), /readable Visro project/i);
  assert.throws(() => parseProject('[]'), /readable Visro project/i);
});

test('complex or cyclic projects fail safely', () => {
  const cyclic = {}; cyclic.child = cyclic;
  assert.throws(() => serializeProject(cyclic), /invalid data/i);
  let deep = { leaf: true }; for (let i = 0; i < 90; i++) deep = { child: deep };
  assert.throws(() => serializeProject(deep), /too complex/i);
});

test('native export validates the MIME type and filename rather than trusting renderer paths', () => {
  const file = decodeExport({ name: '../../hello:*', format: 'png', dataURL: 'data:image/png;base64,YWJj' });
  assert.equal(file.name, 'hello.png');
  assert.equal(file.data.toString(), 'abc');
  assert.throws(() => decodeExport({ format: 'png', dataURL: 'data:text/html;base64,YWJj' }), /chosen format/i);
  assert.throws(() => decodeExport({ format: '__proto__', dataURL: 'data:image/png;base64,YWJj' }), /choose PNG/i);
  assert.equal(safeName('\\/\0'), 'Untitled');
});

test('SVG export blocks executable and remote content, including base64 bypasses', () => {
  assert.equal(decodeExport({ name: 'Shape', format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' }).extension, 'svg');
  for (const svg of ['<svg><script>alert(1)</script></svg>', '<svg onload="attack()"/>', '<svg><foreignObject/></svg>', '<svg><image href="https://attacker.example"/></svg>']) assert.throws(() => decodeExport({ format: 'svg', svg }), /unsupported active/i);
  assert.throws(() => decodeExport({ format: 'svg', dataURL: 'data:image/svg+xml;base64,PHN2Zy8+' }), /requires a readable SVG/i);
});

test('secure asset routing cannot traverse the packaged app or access a foreign host', () => {
  const root = '/tmp/visro/dist';
  assert.equal(resolveAsset(root, 'visro://app/assets/editor.js'), '/tmp/visro/dist/assets/editor.js');
  assert.equal(resolveAsset(root, 'visro://app/'), '/tmp/visro/dist/index.html');
  for (const url of ['visro://other/assets/editor.js', 'visro://app/%2e%2e%2f%2e%2e%2fsecret', 'visro://app/%00secret', 'visro://app/%5c..%5csecret', 'https://app/assets/editor.js', 'visro://user@app/index.html']) assert.equal(resolveAsset(root, url), null);
});

test('desktop development navigation is restricted to the local Vite server', () => {
  assert.equal(devURL('http://127.0.0.1:5173'), 'http://127.0.0.1:5173/');
  assert.equal(devURL(undefined), null);
  for (const url of ['http://localhost:5173', 'https://127.0.0.1:5173', 'http://attacker.example:5173', 'http://127.0.0.1:9999', 'http://127.0.0.1:5173/?key=test']) assert.throws(() => devURL(url), /VISRO_DEV_URL/i);
  assert.throws(() => httpsURL('javascript:alert(1)'), /only HTTPS/i);
  assert.throws(() => httpsURL('https://secret:password@example.com'), /only HTTPS/i);
});

test('production CSP supports bundled ndarray code generation while keeping external scripts and networking blocked', () => {
  const csp = contentSecurityPolicy(false);
  assert.match(csp, /script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval';/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /connect-src 'self' blob: data:;/);
  assert.ok(!csp.includes('https:'));
  assert.ok(!csp.match(/script-src[^;]*'unsafe-inline'/));
});

test('cold protocol responses directly carry isolation and CSP headers with readable local asset bytes', async () => {
  const manifest = JSON.stringify({ '/models/isnet_fp16': { chunks: [{ name: 'local-model' }] } });
  const handler = createAssetHandler({ distDirectory: '/tmp/visro/dist', realpath: async (value) => value, fetchFile: async (url) => {
    assert.equal(url, 'file:///tmp/visro/dist/background-removal/1.7.0/resources.json');
    return new Response(manifest, { headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(manifest)) } });
  } });
  const result = await handler({ url: 'visro://app/background-removal/1.7.0/resources.json', method: 'GET', initiatorOrigin: 'visro://app' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
  assert.equal(result.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
  assert.equal(result.headers.get('Cross-Origin-Resource-Policy'), 'same-origin');
  assert.equal(result.headers.get('Content-Type'), 'application/json');
  assert.match(result.headers.get('Content-Security-Policy'), /connect-src 'self' blob: data:;/);
  assert.equal(await result.text(), manifest);
});

test('protocol handler rejects symlinks outside dist and foreign-origin access before reading bytes', async () => {
  let reads = 0;
  const handler = createAssetHandler({ distDirectory: '/tmp/visro/dist', realpath: async (value) => value.endsWith('secret') ? '/tmp/private-secret' : value, fetchFile: async () => { reads++; return new Response('secret'); } });
  assert.equal((await handler({ url: 'visro://app/secret', method: 'GET' })).status, 403);
  assert.equal((await handler({ url: 'visro://app/index.html', method: 'GET', initiatorOrigin: 'https://attacker.example' })).status, 403);
  assert.equal((await handler({ url: 'visro://app/index.html', method: 'POST' })).status, 403);
  assert.equal(reads, 0);
});

test('HEAD asset requests preserve headers while returning no document body', async () => {
  const handler = createAssetHandler({ distDirectory: '/tmp/visro/dist', realpath: async (value) => value, fetchFile: async () => new Response('local JavaScript', { headers: { 'Content-Type': 'text/javascript' } }) });
  const response = await handler({ url: 'visro://app/assets/app.mjs', method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/javascript');
  assert.equal(await response.text(), '');
});
