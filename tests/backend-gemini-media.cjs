'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createGeminiMediaService, decodeAudio, validateMediaRequest, operationPath, videoDownloadURL, safeRedirectURL } = require('../electron/gemini-media.cjs');
const { createMediaService } = require('../electron/media.cjs');
const { createSettingsStore } = require('../electron/settings.cjs');

const KEY = 'fake-gemini-key-for-tests-123456';
const MODEL = 'veo-3.1-generate-preview';
const OPERATION = `models/${MODEL}/operations/operation_123`;
const URI = 'https://generativelanguage.googleapis.com/v1beta/files/generated_video:download?alt=media';
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function pcm() { const bytes = Buffer.alloc(48000); for (let i = 0; i < 24000; i++) bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 24000) * 5000), i * 2); return bytes; }
const content = (inline) => ({ candidates: [{ content: { parts: [{ inlineData: inline }] } }] });

test('Gemini TTS uses the fixed authenticated endpoint and wraps documented PCM into playable WAV', async () => {
  let request;
  const inputPCM = pcm();
  const service = createGeminiMediaService({ apiKey: KEY, fetchImpl: async (url, options) => { request = { url, options }; return response(content({ mimeType: 'audio/L16;codec=pcm;rate=24000', data: inputPCM.toString('base64') })); } });
  const output = await service.run({ kind: 'voice', prompt: 'A clear voiceover.', voiceName: 'Puck', tone: 'warm' });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent');
  assert.equal(request.options.headers['x-goog-api-key'], KEY);
  assert.equal(request.options.redirect, 'error');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck');
  assert.ok(body.contents[0].parts[0].text.includes('A clear voiceover.'));
  assert.ok(!request.url.includes(KEY) && !request.options.body.includes(KEY));
  assert.equal(output.kind, 'audio');
  assert.equal(output.data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(output.data.toString('ascii', 8, 12), 'WAVE');
  assert.equal(output.data.readUInt32LE(24), 24000);
  assert.equal(output.data.readUInt16LE(22), 1);
  assert.equal(output.data.readUInt16LE(34), 16);
  assert.deepEqual(output.data.subarray(44), inputPCM);
});

test('TTS accepts complete WAV from newer editable models and rejects malformed or unsupported audio', async () => {
  const wav = decodeAudio({ mimeType: 'audio/l16;rate=24000', data: pcm().toString('base64') });
  let body;
  const service = createGeminiMediaService({ apiKey: KEY, voiceModel: 'gemini-3.8-flash-tts', fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return response(content({ mimeType: 'audio/wav', data: wav.toString('base64') })); } });
  assert.deepEqual((await service.run({ kind: 'voice', prompt: 'Speak exactly this.', tone: 'friendly' })).data, wav);
  assert.equal(body.contents[0].parts[0].text, 'Speak exactly this.');
  assert.deepEqual(body.contents[0].parts[0].speech_metadata, { style: 'friendly' });
  assert.deepEqual(body.generationConfig.speechConfig.voiceConfig, { voice: 'Kore' });
  for (const inline of [{ mimeType: 'audio/wav', data: Buffer.from('bad WAV').toString('base64') }, { mimeType: 'audio/l16', data: Buffer.from([1]).toString('base64') }, { mimeType: 'text/html', data: pcm().toString('base64') }, { mimeType: 'audio/l16;rate=1', data: pcm().toString('base64') }]) assert.throws(() => decodeAudio(inline));
});

test('Veo submits a real long-running job, polls and safely downloads without forwarding keys to CDN', async () => {
  const requests = [], progress = [];
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(20)]);
  const service = createGeminiMediaService({ apiKey: KEY, pollMs: 1, onProgress: (value) => progress.push(value), fetchImpl: async (url, options) => {
    requests.push({ url, options });
    switch (requests.length) {
      case 1: return response({ name: OPERATION, done: false });
      case 2: return response({ name: OPERATION, done: false });
      case 3: return response({ name: OPERATION, done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: URI } }] } } });
      case 4: return new Response(null, { status: 302, headers: { location: 'https://storage.googleapis.com/google-video-bucket/generated.mp4?X-Goog-Signature=signed' } });
      case 5: return new Response(mp4, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(mp4.length) } });
      default: throw new Error('Unexpected request');
    }
  } });
  const result = await service.run({ kind: 'video', prompt: 'A subtle pan over a mountain.', aspectRatio: '9:16', durationSeconds: 6 });
  assert.equal(result.kind, 'video');
  assert.deepEqual(result.data, mp4);
  assert.equal(requests[0].url, `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predictLongRunning`);
  assert.deepEqual(JSON.parse(requests[0].options.body).parameters, { numberOfVideos: 1, aspectRatio: '9:16', durationSeconds: 6, resolution: '720p' });
  assert.equal(requests[1].url, `https://generativelanguage.googleapis.com/v1beta/${OPERATION}`);
  assert.equal(requests[3].url, URI);
  assert.equal(requests[3].options.headers['x-goog-api-key'], KEY);
  assert.equal(requests[4].options.headers['x-goog-api-key'], undefined);
  assert.equal(requests[3].options.redirect, 'manual');
  assert.ok(requests.every((request) => !request.url.includes(KEY)));
  assert.ok(progress.some((value) => value.phase === 'poll'));
  assert.ok(progress.some((value) => value.phase === 'download'));
  assert.ok(progress.some((value) => value.phase === 'import'));
});

test('model responses cannot redirect authenticated operations or downloads to an arbitrary host', async () => {
  for (const name of ['https://attacker.example/key', 'models/other-model/operations/123', `models/${MODEL}/operations/../secret`, 'operations/abc?key=secret']) assert.throws(() => operationPath(name, MODEL));
  for (const uri of ['https://attacker.example/video', 'https://generativelanguage.googleapis.com.evil.example/v1beta/files/abc', 'file:///tmp/video', 'https://user:password@generativelanguage.googleapis.com/v1beta/files/abc', 'https://generativelanguage.googleapis.com/v1beta/models/secret', 'https://generativelanguage.googleapis.com/v1beta/files/%2e%2e']) assert.throws(() => videoDownloadURL(uri));
  assert.equal(videoDownloadURL(`${URI}&key=should-not-forward`), URI);
  for (const target of ['http://storage.googleapis.com/video', 'https://attacker.example/video', 'https://storage.googleapis.com/video?key=secret']) assert.throws(() => safeRedirectURL(target, URI));
  let calls = 0;
  const service = createGeminiMediaService({ apiKey: KEY, fetchImpl: async () => { calls++; return response({ name: 'https://attacker.example/op' }); } });
  await assert.rejects(service.run({ kind: 'video', prompt: 'An idea' }), /invalid video operation/);
  assert.equal(calls, 1);
});

test('stopping a pending Veo request aborts polling immediately and never downloads a result', async () => {
  const controller = new AbortController(); let calls = 0;
  const service = createGeminiMediaService({ apiKey: KEY, signal: controller.signal, onProgress: (progress) => { if (progress.phase === 'poll') controller.abort(); }, fetchImpl: async () => { calls++; return response({ name: OPERATION, done: false }); } });
  await assert.rejects(service.run({ kind: 'video', prompt: 'A video' }), /cancelled/);
  assert.equal(calls, 1);
});

test('Veo refuses a foreign download redirect before any credential or request can leave Google', async () => {
  const calls = [];
  const service = createGeminiMediaService({ apiKey: KEY, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return response({ name: OPERATION, done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: URI } }] } } });
    return new Response(null, { status: 302, headers: { location: 'https://attacker.example/collect' } });
  } });
  await assert.rejects(service.run({ kind: 'video', prompt: 'A short film' }), /unsupported download redirect/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => new URL(call.url).hostname === 'generativelanguage.googleapis.com'));
});

test('speech request deadlines abort fetch and oversized declared responses fail without allocating them', async () => {
  const service = createGeminiMediaService({ apiKey: KEY, timeoutMs: 5, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })) });
  await assert.rejects(service.run({ kind: 'voice', prompt: 'A speech' }), /took too long/);
  const oversized = createGeminiMediaService({ apiKey: KEY, fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': String(100 * 1024 * 1024) } }) });
  await assert.rejects(oversized.run({ kind: 'voice', prompt: 'A speech' }), /too large/);
});

test('media failures report quota/model guidance and redact the key, without accepting invalid requests', async () => {
  const service = createGeminiMediaService({ apiKey: KEY, fetchImpl: async () => response({ error: { message: `Quota exceeded for ${KEY}` } }, 429) });
  await assert.rejects(service.run({ kind: 'voice', prompt: 'Hello' }), (error) => /quota/i.test(error.message) && !error.message.includes(KEY));
  for (const input of [{ kind: 'voice', prompt: '' }, { kind: 'voice', prompt: 'Hi', voiceName: '<script>' }, { kind: 'video', prompt: 'A video', durationSeconds: 7 }, { kind: 'video', prompt: 'A video', aspectRatio: '4:3' }, { kind: 'video', prompt: 'x'.repeat(4001) }, { kind: 'voice', prompt: 'Hi', requestId: '../key' }]) assert.throws(() => validateMediaRequest(input));
});

test('voice/video model choices persist with an encrypted key and legacy settings acquire safe defaults', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-media-settings-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storage = { isAsyncEncryptionAvailable: async () => true, encryptStringAsync: async () => Buffer.from('ciphertext'), decryptStringAsync: async () => ({ result: KEY, shouldReEncrypt: false }) };
  const store = createSettingsStore({ directory, safeStorage: storage });
  assert.equal((await store.getSettings()).voiceModel, 'gemini-3.1-flash-tts-preview');
  await store.saveSettings({ apiKey: KEY, voiceModel: 'gemini-2.5-pro-preview-tts', videoModel: 'veo-3.1-fast-generate-preview' });
  const restored = createSettingsStore({ directory, safeStorage: storage });
  const settings = await restored.getSettings();
  assert.equal(settings.voiceModel, 'gemini-2.5-pro-preview-tts');
  assert.equal(settings.videoModel, 'veo-3.1-fast-generate-preview');
  assert.equal(settings.apiKey, undefined);
  assert.ok(!(await fs.readFile(path.join(directory, 'settings.json'), 'utf8')).includes(KEY));
});

const tools = path.resolve(__dirname, '../build/media-tools');
test('mocked AI bytes become real playable audio/video assets in the persistent local library', { skip: !existsSync(path.join(tools, 'ffmpeg')) }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-ai-media-integration-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const media = createMediaService({ directory: path.join(directory, 'library'), toolsDirectory: tools });
  const voice = createGeminiMediaService({ apiKey: KEY, fetchImpl: async () => response(content({ mimeType: 'audio/l16;codec=pcm;rate=24000', data: pcm().toString('base64') })) });
  const sound = await media.importBuffer(await voice.run({ kind: 'voice', prompt: 'Real local audio integration' }));
  assert.equal(sound.kind, 'audio');
  assert.ok(Math.abs(sound.duration - 1) < .1);
  assert.ok(sound.thumbnail.startsWith('data:image/jpeg;base64,'));
  const file = path.join(directory, 'video.mp4');
  await promisify(execFile)(path.join(tools, 'ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const videoBytes = await fs.readFile(file);
  const video = createGeminiMediaService({ apiKey: KEY, fetchImpl: async (url) => url.includes(':predictLongRunning') ? response({ name: OPERATION, done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: URI } }] } } }) : new Response(videoBytes) });
  const movie = await media.importBuffer(await video.run({ kind: 'video', prompt: 'Real local video integration' }));
  assert.equal(movie.kind, 'video');
  assert.equal(movie.width, 160);
  assert.ok(movie.thumbnail.startsWith('data:image/jpeg;base64,'));
  const restored = createMediaService({ directory: path.join(directory, 'library'), toolsDirectory: tools });
  assert.equal((await restored.listMedia()).length, 2);
  assert.equal((await media.mediaResponse(new Request(movie.src))).status, 200);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(media.importBuffer({ data: videoBytes, kind: 'video', name: 'Cancelled' }, { signal: cancelled.signal }), /cancelled/);
  assert.equal((await restored.listMedia()).length, 2);
});
