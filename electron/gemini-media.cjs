'use strict';

const { validateKey, validateModel, decodeImage } = require('./gemini.cjs');
const { DEFAULT_VOICE_MODEL, DEFAULT_VIDEO_MODEL } = require('./settings.cjs');
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GOOGLE_HOST = 'generativelanguage.googleapis.com';
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VOICES = new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);

function validateMediaRequest(input) {
  if (!input || typeof input !== 'object' || !['voice', 'video'].includes(input.kind)) throw new Error('Choose voice or video generation.');
  const prompt = input.kind === 'voice' && typeof input.text === 'string' && input.text.trim() ? input.text.trim() : input.prompt?.trim?.();
  if (typeof prompt !== 'string' || !prompt || prompt.length > (input.kind === 'voice' ? 12000 : 4000)) throw new Error(input.kind === 'voice' ? 'Enter between 1 and 12,000 characters of speech.' : 'Describe a video in up to 4,000 characters.');
  if (input.tone !== undefined && (typeof input.tone !== 'string' || input.tone.length > 160)) throw new Error('Enter a speech style shorter than 160 characters.');
  if (input.requestId !== undefined && (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId))) throw new Error('The AI request identifier is invalid.');
  const result = { kind: input.kind, prompt, tone: input.tone || '', voiceName: input.voiceName || 'Kore', aspectRatio: input.aspectRatio || '16:9', durationSeconds: input.durationSeconds ?? 8 };
  if (!VOICES.has(result.voiceName)) throw new Error('Choose one of Gemini’s supported voices.');
  if (!['16:9', '9:16'].includes(result.aspectRatio)) throw new Error('Choose landscape 16:9 or portrait 9:16.');
  if (![4, 6, 8].includes(result.durationSeconds)) throw new Error('Choose a 4, 6, or 8 second video.');
  if (input.image && input.kind === 'video') result.image = decodeImage(input.image);
  return result;
}

function decodeBase64(value, limit) {
  if (typeof value !== 'string' || !value || value.length > limit * 1.4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Google returned unreadable media bytes.');
  const data = Buffer.from(value, 'base64');
  if (!data.length || data.length > limit || data.toString('base64') !== value) throw new Error('Google returned unreadable media bytes.');
  return data;
}

function decodeAudio(inline) {
  const mime = inline?.mimeType || inline?.mime_type || '';
  const data = decodeBase64(inline?.data, MAX_AUDIO_BYTES);
  if (/^audio\/(?:wav|x-wav)(?:;|$)/i.test(mime)) {
    if (data.length < 44 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Google returned an invalid WAV file.');
    return data;
  }
  if (!/^audio\/(?:l16|pcm)(?:;|$)/i.test(mime) || (mime.match(/codec=([^;]+)/i)?.[1] || 'pcm').toLowerCase() !== 'pcm') throw new Error('Choose a Gemini speech model that returns PCM or WAV audio.');
  const rate = Number(mime.match(/rate=(\d+)/i)?.[1] || 24000), channels = Number(mime.match(/channels=(\d+)/i)?.[1] || 1);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 || ![1, 2].includes(channels) || data.length % (channels * 2)) throw new Error('Google returned invalid PCM audio.');
  // Gemini's audio/L16 response is documented as signed 16-bit little-endian
  // PCM. Wrap those bytes directly in a WAV container without a subprocess.
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function operationPath(value, model) {
  const prefixes = [`models/${validateModel(model)}/operations/`, 'operations/'];
  const prefix = prefixes.find((candidate) => typeof value === 'string' && value.startsWith(candidate));
  if (!prefix || !/^[A-Za-z0-9_-]{1,200}$/.test(value.slice(prefix.length))) throw new Error('Google returned an invalid video operation.');
  return value;
}

function videoDownloadURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Google did not return a downloadable video.'); }
  const match = /^\/(?:download\/)?v1(?:beta)?\/files\/([A-Za-z0-9_-]{1,200})(?::download)?$/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== GOOGLE_HOST || url.port || url.username || url.password || !match) throw new Error('Google returned an unsupported video download location.');
  // Match the official SDK's files/<name>:download route. Reconstructing this
  // discards query credentials and prevents model responses changing endpoints.
  return `${BASE_URL}/files/${match[1]}:download?alt=media`;
}

function safeRedirectURL(value, previous) {
  let url;
  try { url = new URL(value, previous); } catch { throw new Error('Google returned an unsupported download redirect.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || ![GOOGLE_HOST, 'storage.googleapis.com'].includes(url.hostname)) throw new Error('Google returned an unsupported download redirect.');
  if (url.hostname === GOOGLE_HOST) return videoDownloadURL(url.href);
  if ([...url.searchParams.keys()].some((name) => /^(?:key|api_key|x-goog-api-key)$/i.test(name))) throw new Error('Google returned an unsupported download redirect.');
  return url.href;
}

async function readBytes(response, maxBytes, onBytes) {
  const total = Number(response.headers?.get?.('content-length') || 0);
  if (total > maxBytes) throw new Error('Google returned media that is too large.');
  const chunks = []; let size = 0;
  if (response.body?.[Symbol.asyncIterator]) {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Google returned media that is too large.');
      chunks.push(Buffer.from(chunk)); if (onBytes) onBytes(size, total);
    }
  } else {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) throw new Error('Google returned media that is too large.');
    chunks.push(data); if (onBytes) onBytes(data.length, total);
  }
  return Buffer.concat(chunks);
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('AI media generation cancelled.')); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('AI media generation cancelled.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function createGeminiMediaService({ apiKey, voiceModel = DEFAULT_VOICE_MODEL, videoModel = DEFAULT_VIDEO_MODEL, fetchImpl = globalThis.fetch, signal, onProgress = () => {}, pollMs = 10000, timeoutMs = 600000 } = {}) {
  const key = validateKey(apiKey), voiceModelName = validateModel(voiceModel), videoModelName = validateModel(videoModel);
  const clean = (message) => String(message || '').split(key).join('[redacted]').replace(/(?:key|api_key|x-goog-api-key)=?\s*[A-Za-z0-9_-]{20,}/gi, 'key=[redacted]').slice(0, 600);
  function check() { if (signal?.aborted) throw new Error('AI media generation cancelled.'); }
  function fail(status, message) {
    const hint = { 400: 'Check the prompt and selected model.', 401: 'Check your Gemini key in Settings.', 403: 'Enable access and billing for this model in Google AI Studio.', 404: 'Choose an available voice or Veo model in Settings.', 429: 'Google quota was reached. Check Google AI Studio billing or try later.' }[status] || 'Google could not complete this request. Try again.';
    return new Error(`Gemini media request failed (${status}). ${hint} ${clean(message)}`.trim());
  }
  async function fetchJSON(relative, body, jobSignal) {
    check();
    const response = await fetchImpl(`${BASE_URL}/${relative}`, { method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: jobSignal, redirect: 'error' });
    const bytes = await readBytes(response, 60 * 1024 * 1024);
    let data; try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Google returned an unreadable media response.'); }
    if (!response.ok) throw fail(response.status, data.error?.message);
    return data;
  }
  async function downloadVideo(value, jobSignal) {
    let url = videoDownloadURL(value);
    for (let redirect = 0; redirect < 4; redirect++) {
      check();
      if (url.includes(key)) throw new Error('Google returned an unsupported download location.');
      const headers = new URL(url).hostname === GOOGLE_HOST ? { 'x-goog-api-key': key } : {};
      const response = await fetchImpl(url, { method: 'GET', headers, signal: jobSignal, redirect: 'manual' });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        url = safeRedirectURL(location, url); continue;
      }
      if (!response.ok) throw fail(response.status, 'The generated video could not be downloaded.');
      const data = await readBytes(response, MAX_VIDEO_BYTES, (bytes, total) => onProgress({ phase: 'download', percent: total ? 80 + Math.round(bytes / total * 10) : 85, message: 'Downloading your generated video' }));
      if (data.length < 12 || data.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Google did not return a readable MP4 video.');
      return data;
    }
    throw new Error('Google returned too many download redirects.');
  }
  async function run(input) {
    const request = validateMediaRequest(input);
    check();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      onProgress({ phase: 'generate', percent: 5, message: request.kind === 'voice' ? 'Gemini is generating your voiceover' : 'Google Veo is generating your video' });
      if (request.kind === 'voice') {
        const modern = /^gemini-(?:3\.8|[4-9]\.)/.test(voiceModelName);
        const voiceConfig = modern ? { voice: request.voiceName } : { prebuiltVoiceConfig: { voiceName: request.voiceName } };
        const part = { text: !modern && request.tone ? `Read in a ${request.tone} style:\n${request.prompt}` : request.prompt, ...(modern && request.tone ? { speech_metadata: { style: request.tone } } : {}) };
        const response = await fetchJSON(`models/${voiceModelName}:generateContent`, { contents: [{ role: 'user', parts: [part] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig } } }, controller.signal);
        if (response.promptFeedback?.blockReason) throw new Error('Gemini could not generate this speech because of its content filters.');
        const inline = (response.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought).map((part) => part.inlineData || part.inline_data).find((part) => part?.data);
        if (!inline) throw new Error('Gemini did not return speech. Check the voice model in Settings.');
        const data = decodeAudio(inline);
        onProgress({ phase: 'import', percent: 90, message: 'Saving your voiceover to the local media library' });
        return { data, kind: 'audio', name: `Gemini voice ${request.voiceName}` };
      }
      const instance = { prompt: request.prompt, ...(request.image ? { image: { inlineData: { data: request.image.data, mimeType: request.image.mimeType } } } : {}) };
      let operation = await fetchJSON(`models/${videoModelName}:predictLongRunning`, { instances: [instance], parameters: { numberOfVideos: 1, aspectRatio: request.aspectRatio, durationSeconds: request.durationSeconds, resolution: '720p' } }, controller.signal);
      const operationName = operationPath(operation.name, videoModelName);
      const started = Date.now();
      while (!operation.done) {
        check();
        onProgress({ phase: 'poll', percent: Math.min(75, 15 + Math.round((Date.now() - started) / 5000)), message: 'Google Veo is rendering. This may take a few minutes.' });
        await abortableDelay(pollMs, controller.signal);
        operation = await fetchJSON(operationName, undefined, controller.signal);
      }
      if (operation.error) throw new Error(`Google video generation failed. ${clean(operation.error.message)}`);
      const output = operation.response?.generateVideoResponse || operation.response || {};
      const video = output.generatedSamples?.[0]?.video || output.generatedVideos?.[0]?.video;
      if (!video) throw new Error(`Veo did not return a video. ${clean(output.raiMediaFilteredReasons?.join(' ') || 'The prompt may have been filtered; try another prompt.')}`);
      const data = video.videoBytes || video.bytesBase64Encoded ? decodeBase64(video.videoBytes || video.bytesBase64Encoded, MAX_VIDEO_BYTES) : await downloadVideo(video.uri, controller.signal);
      check();
      onProgress({ phase: 'import', percent: 92, message: 'Saving your video to the local media library' });
      return { data, kind: 'video', name: `Veo video ${request.durationSeconds}s` };
    } catch (error) {
      if (signal?.aborted) throw new Error('AI media generation cancelled.');
      if (controller.signal.aborted || error.name === 'AbortError') throw new Error('Google media generation took too long. Try again or choose a faster model.');
      if (error instanceof TypeError) throw new Error('Cannot reach Google. Check your internet connection and try again.');
      throw new Error(clean(error.message) || 'Google media generation failed.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  return { run };
}

module.exports = { createGeminiMediaService, validateMediaRequest, decodeAudio, operationPath, videoDownloadURL, safeRedirectURL, VOICES };
