'use strict';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function validateModel(value) {
  if (typeof value !== 'string') throw new Error('Enter a valid Gemini model name.');
  const name = value.trim().replace(/^models\//, '');
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(name)) {
    throw new Error('Use a Gemini model name, such as gemini-2.5-flash.');
  }
  return name;
}

function validateKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(value.trim())) {
    throw new Error('Enter a valid Gemini API key from Google AI Studio.');
  }
  return value.trim();
}

function finite(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function color(value, fallback = '#26232B') {
  if (typeof value !== 'string') return fallback;
  if (/^#[\da-f]{3,4}$|^#[\da-f]{6}$|^#[\da-f]{8}$/i.test(value)) return value;
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)$/i.test(value)) return value;
  return value === 'transparent' ? value : fallback;
}

function decodeImage(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_BYTES * 1.4 + 100) {
    throw new Error('Use a PNG, JPEG, or WebP image smaller than 15 MB.');
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) {
    throw new Error('Use a valid PNG, JPEG, or WebP image.');
  }
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES || buffer.toString('base64') !== match[2]) {
    throw new Error('Use a PNG, JPEG, or WebP image smaller than 15 MB.');
  }
  return { mimeType: match[1], data: match[2] };
}

function sanitizeDesign(raw, requestedWidth = 1080, requestedHeight = 1080) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.elements)) {
    throw new Error('Gemini did not return an editable design. Try a more specific prompt.');
  }
  const width = Math.round(finite(raw.width, requestedWidth, 64, 8192));
  const height = Math.round(finite(raw.height, requestedHeight, 64, 8192));
  const elements = raw.elements.slice(0, 200).filter((item) => item && ['text', 'rect', 'circle'].includes(item.type)).map((item) => {
    const element = {
      type: item.type,
      x: finite(item.x, 0, -width, width * 2),
      y: finite(item.y, 0, -height, height * 2),
      width: finite(item.width, 100, 1, width * 2),
      height: finite(item.height, 100, 1, height * 2),
      fill: color(item.fill),
      opacity: finite(item.opacity, 1, 0, 1),
      angle: finite(item.angle, 0, -360, 360),
    };
    element.rotation = element.angle;
    if (item.type === 'text') {
      element.text = String(item.text ?? '').slice(0, 5000);
      element.fontSize = finite(item.fontSize, 40, 6, 800);
      element.fontFamily = typeof item.fontFamily === 'string' && /^[\w ,'-]{1,80}$/.test(item.fontFamily) ? item.fontFamily : 'Arial';
      element.fontWeight = ['normal', 'bold', 400, 500, 600, 700, 800, 900, '400', '500', '600', '700', '800', '900'].includes(item.fontWeight) ? String(item.fontWeight) : 'normal';
      element.align = ['left', 'center', 'right', 'justify'].includes(item.align) ? item.align : 'left';
    }
    return element;
  });
  if (!elements.length) throw new Error('Gemini returned an empty design. Try again with a clear layout request.');
  return { name: String(raw.name || 'AI design').slice(0, 150), width, height, background: color(raw.background, '#FFFFFF'), elements };
}

const DESIGN_SCHEMA = {
  type: 'OBJECT',
  required: ['name', 'width', 'height', 'background', 'elements'],
  properties: {
    name: { type: 'STRING' }, width: { type: 'NUMBER' }, height: { type: 'NUMBER' }, background: { type: 'STRING' },
    elements: { type: 'ARRAY', items: {
      type: 'OBJECT', required: ['type', 'x', 'y', 'width', 'height', 'fill'],
      properties: {
        type: { type: 'STRING', enum: ['text', 'rect', 'circle'] }, text: { type: 'STRING' },
        x: { type: 'NUMBER' }, y: { type: 'NUMBER' }, width: { type: 'NUMBER' }, height: { type: 'NUMBER' },
        fill: { type: 'STRING' }, fontSize: { type: 'NUMBER' }, fontFamily: { type: 'STRING' },
        fontWeight: { type: 'STRING' }, align: { type: 'STRING', enum: ['left', 'center', 'right', 'justify'] },
        opacity: { type: 'NUMBER' }, angle: { type: 'NUMBER' },
      },
    } },
  },
};

function redact(message, key) {
  return String(message || '').split(key).join('[redacted]').replace(/(?:key|api_key|x-goog-api-key)=?\s*[A-Za-z0-9_-]{20,}/gi, 'key=[redacted]').slice(0, 800);
}

async function readJson(response) {
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error('Gemini returned a response that is too large.');
  let text;
  if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Gemini returned a response that is too large.');
      chunks.push(Buffer.from(chunk));
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else {
    text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('Gemini returned a response that is too large.');
  }
  try { return JSON.parse(text); } catch { throw new Error('Gemini returned an unreadable response. Try again.'); }
}

function createGeminiService({ apiKey, textModel = DEFAULT_TEXT_MODEL, imageModel = DEFAULT_IMAGE_MODEL, fetchImpl = globalThis.fetch, timeoutMs = 150000 } = {}) {
  const key = validateKey(apiKey);
  const textModelName = validateModel(textModel);
  const imageModelName = validateModel(imageModel);
  if (typeof fetchImpl !== 'function') throw new Error('The Gemini network client is unavailable.');

  async function request(relative, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${BASE_URL}/${relative}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        redirect: 'error',
      });
      const data = await readJson(response);
      if (!response.ok) {
        const hints = { 400: 'Check the prompt and selected model.', 401: 'Check your API key in Settings.', 403: 'Check API key permissions and your Google AI Studio access.', 404: 'Choose an available Gemini model in Settings.', 429: 'Your Gemini quota was reached. Check Google AI Studio billing or try later.', 500: 'Google is temporarily unavailable. Try again.', 503: 'Google is temporarily unavailable. Try again.' };
        const detail = redact(data.error?.message, key);
        throw new Error(`Gemini request failed (${response.status}). ${hints[response.status] || 'Try again.'}${detail ? ` ${detail}` : ''}`);
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') throw new Error('Gemini took too long to respond. Try again.');
      if (error instanceof TypeError) throw new Error('Cannot reach Gemini. Check your internet connection and try again.');
      throw new Error(redact(error.message, key) || 'Gemini request failed.');
    } finally { clearTimeout(timer); }
  }

  async function listModels() {
    let pageToken = '';
    const result = new Map();
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
      const data = await request(`models?${query}`);
      for (const model of data.models || []) {
        if (!model.supportedGenerationMethods?.some((method) => ['generateContent', 'predictLongRunning'].includes(method))) continue;
        try {
          const name = validateModel(model.name);
          result.set(name, { name, displayName: String(model.displayName || name).slice(0, 150), description: String(model.description || '').slice(0, 1000), image: /image|nano-banana/i.test(name) });
        } catch { /* A malformed remote model cannot change the endpoint. */ }
      }
      pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      if (!pageToken) break;
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function runAI(input) {
    if (!input || typeof input !== 'object' || !['design', 'copy', 'image', 'edit', 'translate', 'rewrite', 'summarize', 'remix', 'resize'].includes(input.kind)) throw new Error('Choose a supported AI action.');
    const textAction = ['translate', 'rewrite', 'summarize'].includes(input.kind);
    const designAction = ['design', 'remix', 'resize'].includes(input.kind);
    if (typeof input.prompt !== 'string' || input.prompt.length > 12000 || (!input.prompt.trim() && !(textAction && typeof input.text === 'string' && input.text.trim()) && !['resize', 'remix'].includes(input.kind))) throw new Error('Enter a prompt between 1 and 12,000 characters.');
    if (input.text !== undefined && (typeof input.text !== 'string' || input.text.length > 40000)) throw new Error('Use up to 40,000 characters of source text.');
    if (input.language !== undefined && (typeof input.language !== 'string' || input.language.length > 80)) throw new Error('Enter a language name shorter than 80 characters.');
    if (input.tone !== undefined && (typeof input.tone !== 'string' || input.tone.length > 160)) throw new Error('Enter a tone shorter than 160 characters.');
    const width = Math.round(finite(input.width, 1080, 64, 8192));
    const height = Math.round(finite(input.height, 1080, 64, 8192));
    const imageAction = input.kind === 'image' || input.kind === 'edit';
    const parts = [];
    if (input.kind === 'edit' && !input.image) throw new Error('Select an image to edit first.');
    if (input.image) parts.push({ inlineData: decodeImage(input.image) });
    if (designAction) {
      let context = '';
      if (input.kind !== 'design') {
        const original = sanitizeDesign(input.design, width, height);
        context = input.kind === 'resize' ? `Resize and reflow this existing design for the requested canvas while preserving every word and its original visual identity. Adjust positions, line breaks, spacing, and scale for an intentional new aspect ratio. Existing design:\n${JSON.stringify(original)}\n` : `Remix this existing editable design according to the user brief, keeping its core message and copy. Create a deliberate alternative layout, typography, and palette. Existing design:\n${JSON.stringify(original)}\n`;
      }
      parts.push({ text: `Create a polished, editable graphic design for Visro. Canvas: ${width} x ${height} pixels. Return a JSON layout with name, width, height, background, and elements. Use only text, rect, and circle elements. Geometry uses x/y top-left pixels, except circle uses a bounding box. Order elements back to front. Use hex colors and fontFamily Arial, Georgia, or Helvetica. Use generous margins, clear typography, strong contrast, and a deliberate visual hierarchy. For text, width and height must fully fit the content. Include the user's requested copy directly. Return only the JSON layout. ${context}User brief:\n${input.prompt.trim()}` });
    } else if (textAction) {
      const source = (input.text || input.prompt).trim();
      if (!source) throw new Error('Select or enter some text first.');
      const instructions = {
        translate: `Translate the source text into ${input.language?.trim() || 'English'}. Preserve meaning, names, factual claims, paragraph structure, and tone.`,
        rewrite: `Rewrite the source text in a ${input.tone?.trim() || 'clear, concise'} tone. Preserve factual claims and the intended meaning.`,
        summarize: 'Summarize the source text accurately and concisely. Preserve important facts and distinguish uncertainty. Do not invent information.',
      };
      parts.push({ text: `${instructions[input.kind]} Return only the finished usable text, without introductory comments or code fences. ${input.text ? `Additional instruction: ${input.prompt.trim()}\n` : ''}Source text:\n${source}` });
    } else if (input.kind === 'copy') {
      parts.push({ text: `You write concise, compelling copy for visual designs. Follow the user's requested tone, format, and language. Return only the usable copy, without preambles or Markdown code fences. User request:\n${input.prompt.trim()}` });
    } else {
      parts.push({ text: input.prompt.trim() });
    }
    const generationConfig = imageAction ? { responseModalities: ['TEXT', 'IMAGE'] } : { temperature: 0.8, maxOutputTokens: 16384 };
    if (designAction) Object.assign(generationConfig, { responseMimeType: 'application/json', responseSchema: DESIGN_SCHEMA });
    const data = await request(`models/${imageAction ? imageModelName : textModelName}:generateContent`, { contents: [{ role: 'user', parts }], generationConfig });
    if (data.promptFeedback?.blockReason) throw new Error('Gemini could not complete this prompt because of its content filters. Try a different prompt.');
    const outputParts = (data.candidates?.[0]?.content?.parts || []).filter((part) => !part.thought);
    const text = outputParts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n').trim();
    if (imageAction) {
      const inline = outputParts.map((part) => part.inlineData || part.inline_data).find((part) => part?.data && IMAGE_TYPES.has(part.mimeType || part.mime_type));
      if (!inline) throw new Error(text ? `Gemini returned text without an image: ${text.slice(0, 400)}` : 'Gemini did not return an image. Check that the selected image model supports image generation.');
      const image = `data:${inline.mimeType || inline.mime_type};base64,${inline.data}`;
      decodeImage(image);
      return { image, ...(text ? { text: text.slice(0, 12000) } : {}) };
    }
    if (!text) throw new Error('Gemini did not return usable content. Try a different prompt.');
    if (input.kind === 'copy' || textAction) return { text: text.slice(0, 40000) };
    let design;
    try { design = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new Error('Gemini did not return a readable design. Try a more specific prompt.'); }
    return { design: sanitizeDesign({ ...design, width, height }, width, height) };
  }

  return { listModels, runAI };
}

module.exports = { createGeminiService, validateModel, validateKey, decodeImage, sanitizeDesign, DEFAULT_TEXT_MODEL, DEFAULT_IMAGE_MODEL };
