'use strict';

const FONTS = new Set(['Arial', 'Helvetica Neue', 'Georgia', 'Courier New']);
const color = (value, fallback) => value === undefined ? fallback : typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : (() => { throw new Error('Choose a six-digit caption colour.'); })();
const bounded = (value, fallback, min, max, label) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
};

function validateCaptions(value, duration, style = {}, height = 1080) {
  if (value !== undefined && (!Array.isArray(value) || value.length > 1000)) throw new Error('A video can contain up to 1,000 captions.');
  let characters = 0;
  const captions = (value || []).map(cue => {
    if (!cue || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(cue.text)) throw new Error('Each caption needs readable text of up to 2,000 characters.');
    characters += cue.text.length;
    const start = bounded(cue.start, undefined, 0, duration, 'Caption start');
    const end = bounded(cue.end, undefined, 0, duration + 0.001, 'Caption end');
    if (start === undefined || end === undefined || end - start < 0.01) throw new Error('Each caption must end after its start and stay within the video.');
    return { start, end: Math.min(end, duration), text: cue.text.replace(/\r\n?/g, '\n') };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  if (characters > 200000) throw new Error('Caption text must total fewer than 200,000 characters.');
  if (!style || typeof style !== 'object' || Array.isArray(style)) throw new Error('Choose a valid caption style.');
  if (style.fontFamily !== undefined && !FONTS.has(style.fontFamily)) throw new Error('Choose a supported caption font.');
  if (style.position !== undefined && !['top', 'middle', 'bottom'].includes(style.position)) throw new Error('Choose a caption position.');
  if (style.align !== undefined && !['left', 'center', 'right'].includes(style.align)) throw new Error('Choose caption alignment.');
  if (style.box !== undefined && typeof style.box !== 'boolean') throw new Error('Choose a caption background.');
  return { captions, captionStyle: {
    fontFamily: style.fontFamily || 'Arial', fontSize: bounded(style.fontSize, Math.max(12, Math.round(height * 0.05)), 8, 240, 'Caption font size'),
    color: color(style.color, '#FFFFFF'), background: color(style.background, '#000000'),
    box: style.box ?? true, backgroundOpacity: bounded(style.backgroundOpacity, 0.72, 0, 1, 'Caption background opacity'),
    position: style.position || 'bottom', align: style.align || 'center', margin: bounded(style.margin, 5, 0, 25, 'Caption margin'),
  } };
}

function assTimestamp(value) {
  const centiseconds = Math.round(value * 100);
  return `${Math.floor(centiseconds / 360000)}:${String(Math.floor(centiseconds / 6000) % 60).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}
function assColor(value, opacity = 1) {
  const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0');
  return `&H${alpha}${value.slice(5, 7)}${value.slice(3, 5)}${value.slice(1, 3)}`.toUpperCase();
}
function assText(text) {
  // libass supports escaped literal braces. A word joiner after a literal
  // backslash prevents user text such as \N or \h becoming an ASS command.
  return text.replace(/\\/g, '\\\u2060').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
}
function buildASS(captions, style, width, height) {
  const alignment = { bottom: 0, middle: 3, top: 6 }[style.position] + { left: 1, center: 2, right: 3 }[style.align];
  const horizontal = Math.round(width * 0.05), vertical = Math.round(height * style.margin / 100);
  const outline = style.box ? Math.max(2, Math.round(style.fontSize * 0.13)) : Math.max(1, style.fontSize * 0.04);
  const background = assColor(style.background, style.backgroundOpacity);
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style.fontFamily},${style.fontSize},${assColor(style.color)},${assColor(style.color)},${style.box ? background : '&H00000000'},${background},-1,0,0,0,100,100,0,0,${style.box ? 3 : 1},${outline},0,${alignment},${horizontal},${horizontal},${vertical},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return header + captions.map(cue => `Dialogue: 0,${assTimestamp(cue.start)},${assTimestamp(cue.end)},Default,,0,0,0,,${assText(cue.text)}`).join('\n') + '\n';
}

module.exports = { validateCaptions, buildASS, assText };
