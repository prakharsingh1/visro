'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiService, validateModel, decodeImage, sanitizeDesign } = require('../electron/gemini.cjs');

const KEY = 'fake-gemini-key-for-tests-123456';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5E0AAAAASUVORK5CYII=';
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const content = (...parts) => ({ candidates: [{ content: { parts } }] });

test('Gemini requests use only the fixed Google host and keep the key in a header', async () => {
  let seen;
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async (url, options) => { seen = { url, options }; return response(content({ text: 'Your next idea starts here.' })); } });
  assert.deepEqual(await service.runAI({ kind: 'copy', prompt: 'A concise tagline' }), { text: 'Your next idea starts here.' });
  assert.equal(seen.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(seen.options.headers['x-goog-api-key'], KEY);
  assert.equal(seen.options.redirect, 'error');
  assert.ok(!seen.url.includes(KEY));
  assert.ok(!seen.options.body.includes(KEY));
});

test('model names cannot inject paths, operations, query parameters, or destinations', () => {
  assert.equal(validateModel('models/gemini-2.5-flash'), 'gemini-2.5-flash');
  for (const model of ['../secret', 'models/gemini/elsewhere', 'gemini:generateContent?key=x', 'https://attacker.example', 'gemini%2fattack', 'models/../gemini']) {
    assert.throws(() => createGeminiService({ apiKey: KEY, textModel: model, fetchImpl: () => { throw new Error('must not fetch'); } }), /model name/i);
  }
});

test('invalid prompts and missing edit images are rejected before network use', async () => {
  let calls = 0;
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async () => { calls++; return response({}); } });
  for (const input of [{ kind: 'copy', prompt: '' }, { kind: 'copy', prompt: 'x'.repeat(12001) }, { kind: 'other', prompt: 'test' }, { kind: 'edit', prompt: 'Remove this' }]) await assert.rejects(service.runAI(input));
  assert.equal(calls, 0);
});

test('editable design requests use structured JSON and strip untrusted style properties', async () => {
  let body;
  const raw = { name: 'Poster', width: 1200, height: 800, background: 'url(https://attacker.example)', elements: [
    { type: 'text', text: 'A good idea', x: 50, y: 60, width: 900, height: 140, fill: '#FFAA00', fontSize: 60, opacity: 900, fontFamily: 'url(https://attacker.example)', onClick: 'attack' },
    { type: 'image', src: 'https://attacker.example', x: 0 },
  ] };
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return response(content({ text: JSON.stringify(raw) })); } });
  const result = await service.runAI({ kind: 'design', prompt: 'Make a poster', width: 1200, height: 800 });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.generationConfig.responseSchema.properties.elements);
  assert.equal(result.design.elements.length, 1);
  assert.equal(result.design.elements[0].fontFamily, 'Arial');
  assert.equal(result.design.elements[0].opacity, 1);
  assert.equal(result.design.background, '#FFFFFF');
  assert.equal(result.design.elements[0].onClick, undefined);
});

test('design sanitizer rejects empty or unreadable layouts and clamps geometry', () => {
  assert.throws(() => sanitizeDesign({ elements: [] }), /empty design/i);
  assert.throws(() => sanitizeDesign({ elements: 'bad' }), /editable design/i);
  const design = sanitizeDesign({ width: 1e9, height: 0, elements: [{ type: 'rect', x: Infinity, y: -1e8, width: 1e8, height: 0, fill: 'javascript:alert(1)' }] });
  assert.equal(design.width, 8192);
  assert.equal(design.height, 64);
  assert.equal(design.elements[0].x, 0);
  assert.equal(design.elements[0].y, -64);
  assert.equal(design.elements[0].height, 1);
});

test('image edits send inline image bytes and return a renderable data URL', async () => {
  let body, url;
  const inline = decodeImage(PNG);
  const service = createGeminiService({ apiKey: KEY, imageModel: 'custom-image-model', fetchImpl: async (target, options) => { url = target; body = JSON.parse(options.body); return response(content({ text: 'Done' }, { inlineData: inline })); } });
  assert.deepEqual(await service.runAI({ kind: 'edit', prompt: 'Make the sky blue', image: PNG }), { image: PNG, text: 'Done' });
  assert.ok(url.endsWith('/models/custom-image-model:generateContent'));
  assert.deepEqual(body.contents[0].parts[0].inlineData, inline);
  assert.deepEqual(body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
});

test('image generation accepts REST snake_case image responses', async () => {
  const inline = decodeImage(PNG);
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async () => response(content({ inline_data: { mime_type: inline.mimeType, data: inline.data } })) });
  assert.deepEqual(await service.runAI({ kind: 'image', prompt: 'A tiny test image' }), { image: PNG });
});

test('image inputs cannot fetch arbitrary URLs and reject malformed base64', () => {
  for (const input of ['https://attacker.example/image.png', 'data:text/html;base64,AAAA', 'data:image/png;base64,%%%=', 'data:image/png;base64,AA==AAAA', 'data:image/png;base64,A', 'data:image/png;base64,AB==']) assert.throws(() => decodeImage(input));
});

test('Gemini errors provide quota guidance without returning key material', async () => {
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async () => response({ error: { message: `Quota reached for key ${KEY}` } }, 429) });
  await assert.rejects(service.runAI({ kind: 'copy', prompt: 'Test' }), (error) => { assert.match(error.message, /quota/i); assert.ok(!error.message.includes(KEY)); return true; });
});

test('Gemini content filters and text-only image failures are visible to the user', async () => {
  const blocked = createGeminiService({ apiKey: KEY, fetchImpl: async () => response({ promptFeedback: { blockReason: 'SAFETY' } }) });
  await assert.rejects(blocked.runAI({ kind: 'copy', prompt: 'Test' }), /content filters/i);
  const textOnly = createGeminiService({ apiKey: KEY, fetchImpl: async () => response(content({ text: 'Try a different subject.' })) });
  await assert.rejects(textOnly.runAI({ kind: 'image', prompt: 'Test' }), /text without an image/i);
});

test('model listing paginates, deduplicates and filters non-generation models', async () => {
  const urls = [];
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async (url) => {
    urls.push(url);
    return response(urls.length === 1 ? { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed-only', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'a&b=unsafe' } : { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash-image', displayName: 'Image', supportedGenerationMethods: ['generateContent'] }, { name: '../../evil', supportedGenerationMethods: ['generateContent'] }] });
  } });
  const models = await service.listModels();
  assert.equal(models.length, 2);
  assert.equal(models.find((model) => model.name.endsWith('-image')).image, true);
  assert.ok(urls[1].includes('pageToken=a%26b%3Dunsafe'));
  assert.ok(!urls.some((url) => url.includes(KEY)));
});

test('request timeouts abort the request and report an actionable error', async () => {
  const service = createGeminiService({ apiKey: KEY, timeoutMs: 5, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) });
  await assert.rejects(service.runAI({ kind: 'copy', prompt: 'Test' }), /took too long/i);
});

test('thought parts are never inserted into the user design copy', async () => {
  const service = createGeminiService({ apiKey: KEY, fetchImpl: async () => response(content({ thought: true, text: 'Hidden reasoning' }, { text: 'A clear headline' })) });
  assert.deepEqual(await service.runAI({ kind: 'copy', prompt: 'Test' }), { text: 'A clear headline' });
});
