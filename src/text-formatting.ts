/** Text offsets in this module are UTF-16 offsets, like textarea.selectionStart.
 * Fabric's grapheme offsets must be converted at the editor boundary. */
export interface TextSelection { start: number; end: number }
export type TextCase = 'upper' | 'lower' | 'title' | 'sentence' | 'toggle';
export type TextListStyle = 'bullet' | 'numbered';
export type TextFormatAction =
  | {type: 'list'; style: TextListStyle | 'cycle'}
  | {type: 'indent'; direction: 1 | -1}
  | {type: 'case'; value: TextCase};
/** Non-overlapping replacements in ORIGINAL text, sorted by start. Apply in reverse. */
export interface TextEdit { start: number; end: number; insert: string }
export interface TextFormatResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  edits: TextEdit[];
}

interface Line { start: number; end: number; next: number; text: string }
interface Prefix { indent: string; marker: string; body: string; style: TextListStyle | null; number: number }
const INDENT = '  ', MAX_INDENT = 16;

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of text.matchAll(/\r\n|\n|\r/g)) {
    const end = match.index!;
    lines.push({start, end, next: end + match[0].length, text: text.slice(start, end)});
    start = end + match[0].length;
  }
  lines.push({start, end: text.length, next: text.length + 1, text: text.slice(start)});
  return lines;
}

function prefixOf(text: string): Prefix {
  const match = /^([ \t]*)(?:(•|◦|▪|‣|\d+[.)])([ \t]+))?/.exec(text)!;
  const marker = match[2] ? match[2] + match[3] : '';
  const number = parseInt(marker, 10);
  return {indent: match[1], marker, body: text.slice(match[0].length), style: !marker ? null : /^\d/.test(marker) ? 'numbered' : 'bullet', number: Number.isSafeInteger(number) ? number : 0};
}

function boundedSelection(text: string, selection: TextSelection): TextSelection {
  const bound = (value: number) => Math.max(0, Math.min(text.length, Number.isFinite(value) ? Math.floor(value) : 0));
  let start = Math.min(bound(selection.start), bound(selection.end));
  let end = Math.max(bound(selection.start), bound(selection.end));
  // A caller with a DOM offset inside a surrogate pair must not tear the emoji apart.
  const insidePair = (offset: number) => offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
  if (insidePair(start)) start -= 1;
  if (insidePair(end)) end += 1;
  return {start, end};
}

function selectedLines(lines: Line[], selection: TextSelection): number[] {
  // Ending a selection at the next paragraph's start does not select that paragraph.
  const last = selection.end > selection.start ? selection.end - 1 : selection.end;
  return lines.flatMap((line, index) => line.start <= last && line.next > selection.start ? [index] : []);
}

export function getTextListStyle(text: string, selection: TextSelection = {start: 0, end: text.length}): TextListStyle | 'mixed' | 'none' {
  const lines = linesOf(text), range = boundedSelection(text, selection);
  const styles = selectedLines(lines, range).map(index => lines[index].text).filter(line => line.trim()).map(line => prefixOf(line).style ?? 'none');
  if (!styles.length) return 'none';
  return styles.every(style => style === styles[0]) ? styles[0] : 'mixed';
}

function lineEdit(line: Line, replacement: string): TextEdit | null {
  if (line.text === replacement) return null;
  let before = 0, after = 0;
  while (before < line.text.length && before < replacement.length && line.text[before] === replacement[before]) before += 1;
  while (after < line.text.length - before && after < replacement.length - before && line.text[line.text.length - 1 - after] === replacement[replacement.length - 1 - after]) after += 1;
  return {start: line.start + before, end: line.end - after, insert: replacement.slice(before, replacement.length - after)};
}

const indentWidth = (indent: string) => indent.replace(/\t/g, INDENT).length;

function listEdits(text: string, selection: TextSelection, action: Exclude<TextFormatAction, {type: 'case'}>): TextEdit[] {
  const lines = linesOf(text), indices = selectedLines(lines, selection), selected = new Set(indices);
  if (action.type === 'list' && action.style === 'cycle') {
    const current = getTextListStyle(text, selection);
    action = {type: 'list', style: current === 'bullet' || current === 'numbered' ? 'numbered' : 'bullet'};
  }
  const collapsed = selection.start === selection.end;
  const applicable = indices.filter(index => lines[index].text.trim() || collapsed);
  const remove = action.type === 'list' && applicable.length > 0 && applicable.every(index => prefixOf(lines[index].text).style === action.style);
  const changed = new Map<number, string>();
  for (const index of applicable) {
    const line = lines[index], prefix = prefixOf(line.text);
    if (action.type === 'list') changed.set(index, prefix.indent + (remove ? '' : action.style === 'bullet' ? '• ' : '1. ') + prefix.body);
    else {
      const indent = action.direction === 1
        ? prefix.indent + ' '.repeat(Math.max(0, Math.min(INDENT.length, MAX_INDENT - indentWidth(prefix.indent))))
        : prefix.indent.startsWith('\t') ? prefix.indent.slice(1) : prefix.indent.replace(/^ {1,2}/, '');
      const replacement = indent + prefix.marker + prefix.body;
      if (replacement !== line.text) changed.set(index, replacement);
    }
  }
  // Number selected sibling items in order, continuing a preceding numbered
  // paragraph at the same depth. Unselected paragraph text stays untouched.
  const counters = new Map<number, number>();
  for (let index = 0; index <= (indices.at(-1) ?? -1); index += 1) {
    const prefix = prefixOf(changed.get(index) ?? lines[index].text);
    if (prefix.style !== 'numbered') { counters.clear(); continue; }
    const depth = indentWidth(prefix.indent);
    for (const key of counters.keys()) if (key > depth) counters.delete(key);
    if (selected.has(index) && changed.has(index)) {
      const number = (counters.get(depth) ?? 0) + 1;
      changed.set(index, `${prefix.indent}${number}. ${prefix.body}`);
      counters.set(depth, number);
    } else counters.set(depth, prefix.number);
  }
  return [...changed].flatMap(([index, replacement]) => {
    const edit = lineEdit(lines[index], replacement);
    return edit ? [edit] : [];
  });
}

function caseEdits(text: string, selection: TextSelection, value: TextCase): TextEdit[] {
  if (selection.start === selection.end) return [];
  const source = text.slice(selection.start, selection.end), edits: TextEdit[] = [];
  if (value === 'toggle') value = source === source.toUpperCase() ? 'lower' : 'upper';
  let sentenceStart = true, previousEnd = 0;
  for (const match of source.matchAll(/\p{L}[\p{L}\p{M}\p{N}'’\u200c\u200d]*/gu)) {
    const word = match[0], offset = match.index!;
    const gap = source.slice(previousEnd, offset);
    if (/[.!?\r\n]/.test(gap)) sentenceStart = true;
    const lower = word.toLowerCase(), first = Array.from(lower)[0];
    const insert = value === 'upper' ? word.toUpperCase() : value === 'lower' ? lower : value === 'title' || sentenceStart ? first.toUpperCase() + lower.slice(first.length) : lower;
    if (word !== insert) edits.push({start: selection.start + offset, end: selection.start + offset + word.length, insert});
    sentenceStart = false;
    previousEnd = offset + word.length;
  }
  return edits;
}

function mapOffset(offset: number, edits: TextEdit[], affinity: 'left' | 'right'): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.start) break;
    if (offset > edit.end || offset === edit.end && edit.end > edit.start) {
      delta += edit.insert.length - (edit.end - edit.start);
      continue;
    }
    return edit.start + delta + (affinity === 'right' ? edit.insert.length : 0);
  }
  return offset + delta;
}

function applyEdits(text: string, edits: TextEdit[]): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const edit of edits) {parts.push(text.slice(cursor, edit.start), edit.insert); cursor = edit.end;}
  parts.push(text.slice(cursor));
  return parts.join('');
}

export function formatTextSelection(text: string, selection: TextSelection, action: TextFormatAction): TextFormatResult {
  const range = boundedSelection(text, selection);
  const edits = action.type === 'case' ? caseEdits(text, range, action.value) : listEdits(text, range, action);
  const result = applyEdits(text, edits);
  return {text: result, selectionStart: mapOffset(range.start, edits, range.start === range.end ? 'right' : 'left'), selectionEnd: mapOffset(range.end, edits, 'right'), edits};
}

/** Handle Enter only when the caret/selection starts inside an existing list.
 * Returning null allows the editor's normal Enter handling to proceed. */
export function getListEnterEdit(text: string, selection: TextSelection): TextFormatResult | null {
  const range = boundedSelection(text, selection), lines = linesOf(text);
  const lineIndex = selectedLines(lines, {start: range.start, end: range.start})[0];
  if (lineIndex === undefined) return null;
  const line = lines[lineIndex], prefix = prefixOf(line.text);
  if (!prefix.style || range.start < line.start + prefix.indent.length + prefix.marker.length) return null;
  const edits: TextEdit[] = [];
  let caret: number;
  if (!prefix.body.trim() && range.end <= line.end) {
    edits.push({start: line.start, end: line.end, insert: ''});
    caret = line.start;
  } else {
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const number = prefix.number < Number.MAX_SAFE_INTEGER ? prefix.number + 1 : 1;
    const marker = prefix.style === 'numbered' ? `${number}. ` : '• ';
    const insert = newline + prefix.indent + marker;
    edits.push({start: range.start, end: range.end, insert});
    caret = range.start + insert.length;
    // Inserting an item in the middle of a numbered run must not leave duplicate
    // numbers. Only sibling markers change; every following body/style survives.
    if (prefix.style === 'numbered') {
      let counter = number;
      const depth = indentWidth(prefix.indent);
      for (let index = lineIndex + 1; index < lines.length; index += 1) {
        const next = lines[index]; if (next.start < range.end) continue;
        const item = prefixOf(next.text), itemDepth = indentWidth(item.indent);
        if (!item.style || itemDepth < depth) break;
        if (item.style !== 'numbered' || itemDepth !== depth) continue;
        counter = counter < Number.MAX_SAFE_INTEGER ? counter + 1 : 1;
        const edit = lineEdit(next, `${item.indent}${counter}. ${item.body}`);
        if (edit) edits.push(edit);
      }
    }
  }
  const result = applyEdits(text, edits);
  return {text: result, selectionStart: caret, selectionEnd: caret, edits};
}

export function isTextSelectionInList(text: string, selection: TextSelection): boolean {
  const lines = linesOf(text), range = boundedSelection(text, selection);
  const indices = selectedLines(lines, range).filter(index => lines[index].text.trim());
  return indices.length > 0 && indices.every(index => prefixOf(lines[index].text).style !== null);
}

export const TEXT_FONT_WEIGHTS = [
  {value: 100, label: 'Thin'}, {value: 200, label: 'Extra light'},
  {value: 300, label: 'Light'}, {value: 400, label: 'Regular'},
  {value: 500, label: 'Medium'}, {value: 600, label: 'Semi bold'},
  {value: 700, label: 'Bold'}, {value: 800, label: 'Extra bold'},
  {value: 900, label: 'Black'},
] as const;

export function numericFontWeight(weight: number | string): number {
  if (weight === 'bold' || weight === 'bolder') return 700;
  if (weight === 'normal' || weight === 'lighter') return 400;
  const value = Number(weight);
  return Number.isFinite(value) && value >= 1 && value <= 1000 ? value : 400;
}
