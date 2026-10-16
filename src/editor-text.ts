import type {IText, TextStyleDeclaration} from 'fabric';
import type {SelectionUpdate} from './editor-types';
import {formatTextSelection, getListEnterEdit, isTextSelectionInList, numericFontWeight} from './text-formatting';
import type {TextEdit, TextFormatAction, TextFormatResult, TextSelection} from './text-formatting';

const characterKeys = ['fill', 'stroke', 'strokeWidth', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'underline', 'linethrough'] as const;
type CharacterKey = typeof characterKeys[number];

function selectedRange(object: IText): TextSelection {
  if (!object.isEditing) return {start: 0, end: object._text.join('').length};
  const value = object.fromGraphemeToStringSelection(object.selectionStart, object.selectionEnd, object._text);
  return {start: value.selectionStart, end: value.selectionEnd};
}

function boundaries(graphemes: string[]): Map<number, number> {
  const result = new Map<number, number>([[0, 0]]);
  let offset = 0;
  graphemes.forEach((grapheme, index) => {offset += grapheme.length; result.set(offset, index + 1);});
  return result;
}

function replacementStyles(object: IText, edit: TextEdit, first: number, last: number, original: string[], styles: TextStyleDeclaration[], caseChange: boolean): TextStyleDeclaration[] {
  const inserted = object.graphemeSplit(edit.insert), anchor = edit.insert.startsWith('\n')
    ? styles[Math.max(0, first - 1)] ?? styles[first] ?? {}
    : styles[first] ?? styles[Math.max(0, first - 1)] ?? {};
  if (!caseChange || first === last) return inserted.map(() => ({...anchor}));
  // A glyph can expand during casing (ß→SS, İ→i + combining dot). Assign every
  // resulting glyph its source glyph's style rather than shifting later styles.
  const result: TextStyleDeclaration[] = [];
  let offset = 0;
  for (let index = first; index < last; index += 1) {
    const glyph = original[index], options = [glyph, glyph.toUpperCase(), glyph.toLowerCase()];
    const match = options.find(value => edit.insert.startsWith(value, offset));
    const count = match ? object.graphemeSplit(match).length : 1;
    for (let part = 0; part < count && result.length < inserted.length; part += 1) result.push({...styles[index]});
    offset += match?.length ?? inserted[result.length - 1]?.length ?? 1;
  }
  while (result.length < inserted.length) result.push({...styles[Math.max(first, last - 1)]});
  return result;
}

function applyResult(object: IText, result: TextFormatResult, caseChange = false): boolean {
  if (!result.edits.length || result.text === object._text.join('')) return false;
  // Fabric normalizes CRLF to one internal newline glyph. Use that same stream
  // for styles/cursors so an imported Windows paragraph cannot shift formatting.
  const original = [...object._text], offsets = boundaries(original);
  const styles = object.getSelectionStyles(0, original.length).map(style => ({...style}));
  const nextText: string[] = [], nextStyles: TextStyleDeclaration[] = [];
  let cursor = 0;
  for (const edit of result.edits) {
    const first = offsets.get(edit.start), last = offsets.get(edit.end);
    // Never apply a partial formatting operation to a malformed glyph offset.
    if (first === undefined || last === undefined || first < cursor) return false;
    for (let index = cursor; index < first; index += 1) {nextText.push(original[index]); nextStyles.push(styles[index]);}
    for (const glyph of object.graphemeSplit(edit.insert)) nextText.push(glyph);
    for (const style of replacementStyles(object, edit, first, last, original, styles, caseChange)) nextStyles.push(style);
    cursor = last;
  }
  for (let index = cursor; index < original.length; index += 1) {nextText.push(original[index]); nextStyles.push(styles[index]);}
  if (nextText.join('') !== result.text) return false;
  // Fabric insertChars recomputes wrapping/dimensions. Batch all edits so a long
  // paragraph does not trigger a complete layout once for every changed word.
  object.insertChars(result.text, nextStyles, 0, original.length);
  const range = object.fromStringToGraphemeSelection(result.selectionStart, result.selectionEnd, result.text);
  object.selectionStart = range.selectionStart;
  object.selectionEnd = range.selectionEnd;
  if (object.hiddenTextarea) object.hiddenTextarea.value = object.text;
  object._updateTextarea();
  return true;
}

export function formatTextObject(object: IText, action: TextFormatAction): boolean {
  const result = formatTextSelection(object._text.join(''), selectedRange(object), action);
  const changed = applyResult(object, result, action.type === 'case');
  if (changed && action.type === 'list' && isTextSelectionInList(object.text, {start: result.selectionStart, end: result.selectionEnd})) object.set('textAlign', 'left');
  return changed;
}

/** Return false outside a list so Fabric can handle a normal paragraph Enter. */
export function continueTextObjectList(object: IText): boolean {
  if (!object.isEditing) return false;
  const result = getListEnterEdit(object._text.join(''), selectedRange(object));
  return result ? applyResult(object, result) : false;
}

/** Return false outside lists, preserving the editor's normal Tab behavior. */
export function indentTextObjectList(object: IText, direction: 1 | -1): boolean {
  if (!object.isEditing || !isTextSelectionInList(object._text.join(''), selectedRange(object))) return false;
  // Consume Tab even at the indentation limit; it must not leave the textbox.
  formatTextObject(object, {type: 'indent', direction});
  return true;
}

export function getTextObjectSelectionStyle(object: IText): Partial<SelectionUpdate> {
  if (!object.isEditing || object.selectionStart === object.selectionEnd) return {};
  const style = object.getSelectionStyles(object.selectionStart, object.selectionStart + 1, true)[0];
  if (!style) return {};
  return Object.fromEntries(characterKeys.map(key => [key, style[key]]).filter(([, value]) => value !== undefined)) as Partial<SelectionUpdate>;
}

function cleanUpdate(update: SelectionUpdate): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of characterKeys) {
    const value = update[key];
    if (value === undefined) continue;
    if (key === 'fontSize' || key === 'strokeWidth') {
      if (typeof value === 'number' && Number.isFinite(value)) values[key] = Math.max(key === 'fontSize' ? 1 : 0, Math.min(key === 'fontSize' ? 600 : 1000, value));
    } else if (key === 'fontWeight') values[key] = numericFontWeight(value as number | string);
    else if (key === 'underline' || key === 'linethrough') {if (typeof value === 'boolean') values[key] = value;}
    else if (typeof value === 'string' && value.length <= 1000) values[key] = value;
  }
  if (update.align && ['left', 'center', 'right', 'justify'].includes(update.align)) values.textAlign = update.align;
  if (typeof update.lineHeight === 'number' && Number.isFinite(update.lineHeight)) values.lineHeight = Math.max(.5, Math.min(5, update.lineHeight));
  const spacing = update.letterSpacing ?? update.charSpacing;
  if (typeof spacing === 'number' && Number.isFinite(spacing)) values.charSpacing = Math.max(-200, Math.min(1000, spacing));
  return values;
}

/** Character properties affect only the editing range. Paragraph properties
 * (alignment/spacing) affect the textbox because Fabric lays them out per box. */
export function applyTextObjectStyle(object: IText, update: SelectionUpdate): boolean {
  const values = cleanUpdate(update), character: Record<string, unknown> = {}, whole: Record<string, unknown> = {};
  const selection = object.isEditing && object.selectionStart < object.selectionEnd;
  for (const [key, value] of Object.entries(values)) (selection && characterKeys.includes(key as CharacterKey) ? character : whole)[key] = value;
  let changed = false;
  if (Object.keys(character).length) {
    const current = object.getSelectionStyles(object.selectionStart, object.selectionEnd, true);
    changed = current.some(style => Object.entries(character).some(([key, value]) => style[key as CharacterKey] !== value));
    if (changed) object.setSelectionStyles(character, object.selectionStart, object.selectionEnd);
  }
  for (const [key, value] of Object.entries(whole)) {
    if (characterKeys.includes(key as CharacterKey) && object.styleHas(key as CharacterKey)) {object.removeStyle(key as CharacterKey); changed = true;}
    if (object.get(key as keyof IText) !== value) {object.set(key, value); changed = true;}
  }
  if (changed) {object.set('dirty', true); object.initDimensions(); object.setCoords(); object._updateTextarea();}
  return changed;
}
