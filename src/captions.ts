import type { CaptionCue, CaptionStyle } from './bridge';

export const CAPTION_FONTS: CaptionStyle['fontFamily'][] = ['Arial', 'Helvetica Neue', 'Georgia', 'Courier New'];
export function defaultCaptionStyle(height = 1080): CaptionStyle {
  return { fontFamily: 'Arial', fontSize: Math.max(12, Math.round(height * .05)), color: '#ffffff', background: '#000000', box: true, backgroundOpacity: .72, position: 'bottom', align: 'center', margin: 5 };
}
export function normalizeCaptionStyle(value: unknown, height = 1080): CaptionStyle {
  const style = value && typeof value === 'object' ? value as Partial<CaptionStyle> : {}, fallback = defaultCaptionStyle(height);
  return {
    fontFamily: CAPTION_FONTS.includes(style.fontFamily!) ? style.fontFamily! : fallback.fontFamily,
    fontSize: typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) ? Math.max(8, Math.min(240, style.fontSize)) : fallback.fontSize,
    color: typeof style.color === 'string' && /^#[0-9a-f]{6}$/i.test(style.color) ? style.color : fallback.color,
    background: typeof style.background === 'string' && /^#[0-9a-f]{6}$/i.test(style.background) ? style.background : fallback.background,
    box: typeof style.box === 'boolean' ? style.box : fallback.box,
    backgroundOpacity: typeof style.backgroundOpacity === 'number' && Number.isFinite(style.backgroundOpacity) ? Math.max(0, Math.min(1, style.backgroundOpacity)) : fallback.backgroundOpacity,
    margin: typeof style.margin === 'number' && Number.isFinite(style.margin) ? Math.max(0, Math.min(25, style.margin)) : fallback.margin,
    position: ['top', 'middle', 'bottom'].includes(style.position!) ? style.position! : fallback.position,
    align: ['left', 'center', 'right'].includes(style.align!) ? style.align! : fallback.align,
  };
}
export function captionTimestamp(time: number, separator = '.'): string {
  const milliseconds = Math.max(0, Math.round(time * 1000));
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}${separator}${String(milliseconds % 1000).padStart(3, '0')}`;
}
export function readCaptionTimestamp(value: string): number {
  const match = /^(?:(\d{1,2}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid caption timestamp: ${value.slice(0, 40)}`);
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  if (seconds > 3600) throw new Error('Captions can cover up to one hour.');
  return seconds;
}
function plainCaption(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', lrm: '\u200e', rlm: '\u200f' };
  return text.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|lrm|rlm);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  }).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
}
export function parseCaptions(source: string): CaptionCue[] {
  if (source.length > 2 * 1024 * 1024) throw new Error('Choose an SRT or WebVTT file smaller than 2 MB.');
  const normalized = source.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new Error('The captions file is empty.');
  const blocks = normalized.split(/\n[\t ]*\n/), cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (/^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE\s*$|REGION\s*$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => line.includes('-->'));
    if (index < 0) throw new Error('A caption is missing its start and end timestamps.');
    const timing = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[index]);
    if (!timing) throw new Error('A caption has an invalid timestamp range.');
    const start = readCaptionTimestamp(timing[1]), end = readCaptionTimestamp(timing[2]);
    if (end - start < .01) throw new Error('Each caption must end after its start.');
    const text = plainCaption(lines.slice(index + 1).join('\n'));
    if (!text || text.length > 2000) throw new Error('Each caption needs text of up to 2,000 characters.');
    cues.push({ id: crypto.randomUUID(), start, end, text });
    if (cues.length > 1000) throw new Error('Import up to 1,000 captions at a time.');
  }
  if (!cues.length) throw new Error('No timed captions were found in this file.');
  if (cues.reduce((sum, cue) => sum + cue.text.length, 0) > 200000) throw new Error('Caption text must total fewer than 200,000 characters.');
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}
export function serializeCaptions(cues: CaptionCue[], format: 'srt' | 'vtt'): string {
  const ordered = cues.filter(cue => cue.text.trim()).slice().sort((a, b) => a.start - b.start || a.end - b.end);
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + ordered.map((cue, i) => `${format === 'srt' ? `${i + 1}\n` : ''}${captionTimestamp(cue.start, format === 'srt' ? ',' : '.')} --> ${captionTimestamp(cue.end, format === 'srt' ? ',' : '.')}\n${cue.text.replace(/\r\n?/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`).join('\n\n') + '\n';
}
export function locateScene(scenes: { duration: number }[], time: number): { index: number; start: number; offset: number } {
  let start = 0;
  for (let index = 0; index < scenes.length; index++) {
    const duration = Math.max(0, scenes[index].duration);
    if (time < start + duration || index === scenes.length - 1) return { index, start, offset: Math.max(0, Math.min(duration, time - start)) };
    start += duration;
  }
  return { index: 0, start: 0, offset: 0 };
}
