import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Download, Grid2X2, FileText, Image as ImageIcon, Search, X, Undo2, Redo2, ArrowDownAZ, ArrowUpAZ, ChevronDown, ChevronUp } from "lucide-react";
import { desktop, saveExport } from "./bridge";
import type { StudioEditor } from "./editor";
import { changeSheetStructure, cellPosition, columnLabel, evaluateCell, findSheetCells, normalizeSheet, replaceSheetText, sortSheetRows } from "./spreadsheet";
import type { SheetContent, SheetAxis } from "./spreadsheet";

export function sanitizeDocument(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (!["P", "DIV", "SPAN", "BR", "IMG", "HR", "B", "STRONG", "I", "EM", "U", "S", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A", "TABLE", "TR", "TD", "TH", "TBODY", "THEAD"].includes(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attribute of Array.from(el.attributes)) {
      if (attribute.name !== "style" && attribute.name !== "href" && !(el.tagName === "IMG" && attribute.name === "src")) el.removeAttribute(attribute.name);
    }
    if (el.tagName === "IMG" && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(el.getAttribute("src") || "")) {
      el.remove();
      continue;
    }
    if (el.hasAttribute("href") && !/^https?:\/\//i.test(el.getAttribute("href") || "")) el.removeAttribute("href");
    if (el.hasAttribute("style")) {
      const safe = (el as HTMLElement).style;
      el.setAttribute("style", ["color", "background-color", "font-size", "font-family", "font-weight", "font-style", "text-decoration", "text-align"].map(property => `${property}:${safe.getPropertyValue(property).replace(/[<>]/g, "")}`).join(";"));
    }
  }
  return doc.body.innerHTML;
}

function textDownload(name: string, format: string, text: string, mime: string) {
  return saveExport(name, format, `data:${mime};base64,${btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(""))}`);
}

type EditorProps = { id: string; name: string; getEditor: () => StudioEditor | null; initial?: unknown; onNotify: (message: string) => void };
type TextMatch = { start: number; end: number };

function documentText(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let text = "", current: Node | null, previousBlock: Element | null = null;
  while ((current = walker.nextNode())) {
    const value = current.textContent || "";
    if (!value) continue;
    const block = current.parentElement?.closest("p,h1,h2,h3,li,td,th,blockquote,div") || null;
    if (previousBlock && block !== previousBlock) text += "\n";
    nodes.push({ node: current as Text, start: text.length, end: text.length + value.length });
    text += value; previousBlock = block;
  }
  return { text, nodes };
}

function textMatches(text: string, query: string, matchCase: boolean): TextMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
  return Array.from(text.matchAll(pattern), match => ({ start: match.index!, end: match.index! + match[0].length }));
}

function documentRange(root: Node, match: TextMatch): Range | null {
  const { nodes } = documentText(root);
  const first = nodes.find(entry => entry.end > match.start);
  const last = nodes.find(entry => entry.end >= match.end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, match.start - first.start);
  range.setEnd(last.node, match.end - last.start);
  return range;
}

export function DocumentEditor({ id, name, getEditor, initial, onNotify }: EditorProps) {
  const ref = useRef<HTMLDivElement>(null), imageInput = useRef<HTMLInputElement>(null), findInput = useRef<HTMLInputElement>(null);
  const [findOpen, setFindOpen] = useState(false), [query, setQuery] = useState(""), [replacement, setReplacement] = useState(""), [matchCase, setMatchCase] = useState(false);
  const [matchIndex, setMatchIndex] = useState(-1), [revision, setRevision] = useState(0);
  const matches = textMatches(documentText(ref.current || document.createDocumentFragment()).text, query, matchCase);
  useEffect(() => {
    if (ref.current) {
      const html = sanitizeDocument(typeof initial === "string" ? initial : "<h1>Untitled document</h1><p>Start writing, or use Visro AI to turn your ideas into a first draft.</p>");
      if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
    }
  }, [id, initial]);
  useEffect(() => { if (findOpen) findInput.current?.focus(); }, [findOpen]);
  useEffect(() => { setMatchIndex(-1); }, [query, matchCase, id]);
  const persist = () => {
    getEditor()?.setProjectMetadata({ kind: "document", content: sanitizeDocument(ref.current?.innerHTML || "") });
    setRevision(value => value + 1);
  };
  const format = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    persist();
  };
  const revealMatch = (index: number) => {
    if (!ref.current || !matches.length) { setMatchIndex(-1); return; }
    const next = (index + matches.length) % matches.length;
    const range = documentRange(ref.current, matches[next]);
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: "nearest" });
    setMatchIndex(next);
  };
  const replaceCurrent = () => {
    if (!matches.length || !ref.current) return;
    const index = matchIndex < 0 ? 0 : Math.min(matchIndex, matches.length - 1);
    const range = documentRange(ref.current, matches[index]);
    if (!range) return;
    ref.current.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(range);
    document.execCommand("insertText", false, replacement);
    persist(); setMatchIndex(-1);
  };
  const replaceAll = () => {
    if (!matches.length || !ref.current) return;
    const copy = ref.current.cloneNode(true) as HTMLDivElement;
    for (const match of [...matches].reverse()) {
      const range = documentRange(copy, match);
      if (range) { range.deleteContents(); range.insertNode(document.createTextNode(replacement)); }
    }
    ref.current.focus();
    const range = document.createRange(); range.selectNodeContents(ref.current);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    // A single native editing command keeps Replace all reversible with one Undo.
    document.execCommand("insertHTML", false, sanitizeDocument(copy.innerHTML));
    persist(); setMatchIndex(-1); onNotify(`Replaced ${matches.length} occurrence${matches.length === 1 ? "" : "s"}.`);
  };
  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && ["f", "h"].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation(); setFindOpen(true); requestAnimationFrame(() => findInput.current?.focus());
    }
    if (event.key === "Escape" && findOpen) { event.preventDefault(); event.stopPropagation(); setFindOpen(false); ref.current?.focus(); }
  };
  const addImage = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 20 * 1024 * 1024) { onNotify("Choose a PNG, JPG, WebP or GIF smaller than 20 MB."); return; }
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read image.")); reader.readAsDataURL(file); });
    format("insertHTML", `<p><img src="${data}"></p><p><br></p>`);
  };
  const exportPDF = async () => {
    if (!desktop) { onNotify("Use the Mac app to export a document PDF."); return; }
    try {
      const result = await desktop.printDocument({ name, html: `<html><meta charset="utf-8"><body>${sanitizeDocument(ref.current?.innerHTML || "")}</body></html>` });
      if (result) onNotify("Document exported as PDF.");
    } catch (error) { onNotify(error instanceof Error ? error.message : "PDF export failed."); }
  };
  const exportHTML = async () => {
    const html = sanitizeDocument(ref.current?.innerHTML || "");
    await textDownload(name, "html", `<!doctype html><html><meta charset="utf-8"><title>${name.replace(/[<>]/g, "")}</title><style>body{max-width:800px;margin:64px auto;font:18px/1.6 Arial;padding:32px}h1{font-size:40px}blockquote{border-left:3px solid #8b3dff;padding-left:20px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}</style><body>${html}</body></html>`, "text/html");
    onNotify("Document exported as HTML.");
  };
  return <div className="document-suite" onKeyDown={keyboard} data-document-revision={revision}>
    <div className="document-formatbar">
      <FileText size={20} />
      <button title="Undo document edit" aria-label="Undo document edit" onMouseDown={event => { event.preventDefault(); format("undo"); }}><Undo2 size={18} /></button>
      <button title="Redo document edit" aria-label="Redo document edit" onMouseDown={event => { event.preventDefault(); format("redo"); }}><Redo2 size={18} /></button>
      <select aria-label="Paragraph style" onChange={event => format("formatBlock", event.target.value)} defaultValue="p">{[["p", "Paragraph"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"], ["blockquote", "Quote"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Document font" onChange={event => format("fontName", event.target.value)}>{["Arial", "Georgia", "Helvetica", "Verdana", "Courier New"].map(font => <option key={font}>{font}</option>)}</select>
      {[["bold", Bold, "Bold"], ["italic", Italic, "Italic"], ["underline", Underline, "Underline"], ["insertUnorderedList", List, "Bulleted list"], ["insertOrderedList", ListOrdered, "Numbered list"], ["justifyLeft", AlignLeft, "Align left"], ["justifyCenter", AlignCenter, "Align center"], ["justifyRight", AlignRight, "Align right"]].map(([command, Icon, label]) => {
        const I = Icon as typeof Bold;
        return <button key={String(command)} title={String(label)} aria-label={String(label)} onMouseDown={event => { event.preventDefault(); format(String(command)); }}><I size={18} /></button>;
      })}
      <input type="color" aria-label="Document text colour" onChange={event => format("foreColor", event.target.value)} />
      <button title="Find and replace (⌘F)" aria-label="Find and replace in document" onClick={() => setFindOpen(value => !value)}><Search size={18} /></button>
      <button className="quiet-button" title="Insert photo" onClick={() => imageInput.current?.click()}><ImageIcon size={18} /></button>
      <button className="quiet-button" title="Insert table" onClick={() => format("insertHTML", '<table><tbody><tr><th>Heading</th><th>Heading</th><th>Heading</th></tr><tr><td>Text</td><td>Text</td><td>Text</td></tr><tr><td>Text</td><td>Text</td><td>Text</td></tr></tbody></table><p><br></p>')}><Grid2X2 size={18} /></button>
      <button className="quiet-button" onClick={() => void exportPDF()}><Download size={18} />PDF</button>
      <button className="quiet-button" onClick={() => void exportHTML()}>HTML</button>
      <button className="quiet-button" onClick={() => { const text = ref.current?.innerText || ""; getEditor()?.addText("body"); getEditor()?.updateSelected({ text, fontSize: 24, width: 650, left: 72, top: 72 }); onNotify("Document text added to the design canvas."); }}>Add to design</button>
    </div>
    {findOpen && <div className="document-formatbar document-findbar" role="search" aria-label="Find and replace in document">
      <Search size={16} /><input ref={findInput} aria-label="Find in document" value={query} placeholder="Find" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); revealMatch(matchIndex < 0 ? (event.shiftKey ? matches.length - 1 : 0) : matchIndex + (event.shiftKey ? -1 : 1)); } }} />
      <span role="status">{matches.length ? `${matchIndex < 0 ? 0 : Math.min(matchIndex + 1, matches.length)} of ${matches.length}` : "No matches"}</span>
      <button title="Previous match" aria-label="Previous document match" disabled={!matches.length} onMouseDown={event => event.preventDefault()} onClick={() => revealMatch(matchIndex < 0 ? matches.length - 1 : matchIndex - 1)}><ChevronUp size={17} /></button>
      <button title="Next match" aria-label="Next document match" disabled={!matches.length} onMouseDown={event => event.preventDefault()} onClick={() => revealMatch(matchIndex + 1)}><ChevronDown size={17} /></button>
      <input aria-label="Replace in document" value={replacement} placeholder="Replace with" onChange={event => setReplacement(event.target.value)} />
      <button className="quiet-button" disabled={!matches.length} onClick={replaceCurrent}>Replace</button><button className="quiet-button" disabled={!matches.length} onClick={replaceAll}>Replace all</button>
      <label><input type="checkbox" checked={matchCase} onChange={event => setMatchCase(event.target.checked)} /> Match case</label>
      <button aria-label="Close document find" onClick={() => { setFindOpen(false); ref.current?.focus(); }}><X size={17} /></button>
    </div>}
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void addImage(file); event.target.value = ""; }} />
    <div className="document-scroll"><div ref={ref} className="document-paper" contentEditable suppressContentEditableWarning role="textbox" aria-label="Document content" onInput={persist} onBlur={persist} onPaste={event => {
      event.preventDefault();
      const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith("image/"));
      if (image) { void addImage(image); return; }
      const html = event.clipboardData.getData("text/html");
      if (html) document.execCommand("insertHTML", false, sanitizeDocument(html));
      else document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      persist();
    }} /></div>
  </div>;
}

const DEFAULT_SHEET: SheetContent = { cells: { A1: "Month", B1: "Revenue", A2: "January", B2: "4200", A3: "February", B3: "6800", A4: "March", B4: "5600", A6: "Total", B6: "=SUM(B2:B4)" }, rows: 20, columns: 8 };

export function SheetEditor({ id, name, getEditor, initial, onNotify }: EditorProps) {
  const [sheet, setSheet] = useState(() => normalizeSheet(initial || DEFAULT_SHEET)), [active, setActive] = useState("A1");
  const [findOpen, setFindOpen] = useState(false), [query, setQuery] = useState(""), [replacement, setReplacement] = useState(""), [matchCase, setMatchCase] = useState(false), [header, setHeader] = useState(true);
  const [historyVersion, setHistoryVersion] = useState(0);
  const sheetRef = useRef(sheet), savedSignature = useRef(JSON.stringify(sheet)), currentId = useRef(id);
  const past = useRef<SheetContent[]>([]), future = useRef<SheetContent[]>([]), transaction = useRef({ key: "", time: 0 });
  const grid = useRef<HTMLTableElement>(null), findInput = useRef<HTMLInputElement>(null);
  const matches = findSheetCells(sheet, query, matchCase), position = cellPosition(active) || { row: 0, column: 0 };
  useEffect(() => {
    const next = normalizeSheet(initial || DEFAULT_SHEET), signature = JSON.stringify(next);
    if (currentId.current !== id || signature !== savedSignature.current) {
      currentId.current = id; past.current = []; future.current = []; transaction.current = { key: "", time: 0 };
      sheetRef.current = next; savedSignature.current = signature; setSheet(next); setActive("A1"); setHistoryVersion(value => value + 1);
    }
  }, [id, initial]);
  useEffect(() => { if (findOpen) findInput.current?.focus(); }, [findOpen]);
  const publish = (next: SheetContent) => {
    sheetRef.current = next; savedSignature.current = JSON.stringify(next); setSheet(next);
    getEditor()?.setProjectMetadata({ kind: "sheet", content: next });
    setHistoryVersion(value => value + 1);
  };
  const update = (next: SheetContent, key = "") => {
    if (JSON.stringify(next) === savedSignature.current) return;
    const now = Date.now();
    if (!key || transaction.current.key !== key || now - transaction.current.time > 650) {
      past.current.push(sheetRef.current); if (past.current.length > 100) past.current.shift();
    }
    future.current = []; transaction.current = { key, time: now }; publish(next);
  };
  const history = (redo = false) => {
    const source = redo ? future.current : past.current, target = redo ? past.current : future.current;
    const next = source.pop(); if (!next) return;
    target.push(sheetRef.current); transaction.current = { key: "", time: 0 }; publish(next);
    const location = cellPosition(active)!;
    setActive(columnLabel(Math.min(location.column, next.columns - 1)) + (Math.min(location.row, next.rows - 1) + 1));
  };
  const selectCell = (reference: string, focus = true) => {
    setActive(reference);
    if (focus) requestAnimationFrame(() => {
      const input = grid.current?.querySelector<HTMLInputElement>(`input[aria-label="Cell ${reference}"]`);
      input?.focus(); input?.select(); input?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };
  const changeStructure = (axis: SheetAxis, after = false, remove = false) => {
    const index = (axis === "row" ? position.row : position.column) + (after ? 1 : 0);
    const next = changeSheetStructure(sheetRef.current, axis, index, remove);
    if (next === sheetRef.current) { onNotify(remove ? "Keep at least one row and column." : "Sheets support up to 200 rows and 26 columns."); return; }
    update(next);
    const row = Math.min(next.rows - 1, axis === "row" && !remove ? index : position.row);
    const column = Math.min(next.columns - 1, axis === "column" && !remove ? index : position.column);
    selectCell(columnLabel(column) + (row + 1));
  };
  const findNext = (backward = false) => {
    if (!matches.length) return;
    const index = matches.indexOf(active);
    selectCell(matches[index < 0 ? (backward ? matches.length - 1 : 0) : (index + (backward ? -1 : 1) + matches.length) % matches.length]);
  };
  const keyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const command = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    if (command && ["z", "y"].includes(key)) { event.preventDefault(); event.stopPropagation(); history(key === "y" || event.shiftKey); return; }
    if (command && ["f", "h"].includes(key)) { event.preventDefault(); event.stopPropagation(); setFindOpen(true); requestAnimationFrame(() => findInput.current?.focus()); return; }
    if (event.key === "Escape" && findOpen) { event.preventDefault(); event.stopPropagation(); setFindOpen(false); selectCell(active); }
  };
  const matrix = () => Array.from({ length: sheet.rows }, (_, row) => Array.from({ length: sheet.columns }, (_, column) => evaluateCell(sheet.cells[columnLabel(column) + (row + 1)] || "", sheet.cells)));
  return <div className="document-suite sheet-suite" onKeyDown={keyboard} data-sheet-history={historyVersion}>
    <div className="document-formatbar">
      <Grid2X2 size={20} /><button title="Undo sheet edit (⌘Z)" aria-label="Undo sheet edit" disabled={!past.current.length} onClick={() => history()}><Undo2 size={18} /></button><button title="Redo sheet edit (⇧⌘Z)" aria-label="Redo sheet edit" disabled={!future.current.length} onClick={() => history(true)}><Redo2 size={18} /></button>
      <strong>{active}</strong><input className="formula-input" aria-label="Formula bar" value={sheet.cells[active] || ""} onChange={event => update({ ...sheetRef.current, cells: { ...sheetRef.current.cells, [active]: event.target.value } }, active)} placeholder="Enter a value or =SUM(A1:A5)" />
      <select aria-label="Insert or delete rows and columns" value="" onChange={event => { const [axis, action] = event.target.value.split(":"); changeStructure(axis as SheetAxis, action === "after", action === "delete"); }}><option value="" disabled>Insert / Delete</option><option value="row:before">Insert row above</option><option value="row:after">Insert row below</option><option value="row:delete">Delete row</option><option value="column:before">Insert column left</option><option value="column:after">Insert column right</option><option value="column:delete">Delete column</option></select>
      <button title={`Sort by column ${columnLabel(position.column)} ascending`} aria-label="Sort sheet ascending" onClick={() => { update(sortSheetRows(sheetRef.current, position.column, "ascending", header)); onNotify(`Sorted rows by column ${columnLabel(position.column)} ascending.`); }}><ArrowDownAZ size={19} /></button>
      <button title={`Sort by column ${columnLabel(position.column)} descending`} aria-label="Sort sheet descending" onClick={() => { update(sortSheetRows(sheetRef.current, position.column, "descending", header)); onNotify(`Sorted rows by column ${columnLabel(position.column)} descending.`); }}><ArrowUpAZ size={19} /></button>
      <label className="sheet-header-toggle"><input type="checkbox" checked={header} onChange={event => setHeader(event.target.checked)} /> Header row</label>
      <button title="Find and replace (⌘F)" aria-label="Find and replace in sheet" onClick={() => setFindOpen(value => !value)}><Search size={18} /></button>
      <button className="quiet-button" onClick={async () => { const csv = matrix().map(row => row.map(value => '"' + value.replace(/"/g, '""') + '"').join(",")).join("\n"); await textDownload(name, "csv", csv, "text/csv"); onNotify("Spreadsheet exported."); }}><Download size={16} />CSV</button>
      <button className="quiet-button" onClick={() => { getEditor()?.addTable({ rows: Math.min(sheet.rows, 20), columns: Math.min(sheet.columns, 10), data: matrix(), header: true }); onNotify("Sheet added as an editable design table."); }}>Add to design</button>
    </div>
    {findOpen && <div className="document-formatbar document-findbar" role="search" aria-label="Find and replace in sheet">
      <Search size={16} /><input ref={findInput} aria-label="Find in sheet" placeholder="Find" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); findNext(event.shiftKey); } }} /><span role="status">{matches.length} matching cell{matches.length === 1 ? "" : "s"}</span>
      <button title="Previous match" aria-label="Previous sheet match" disabled={!matches.length} onClick={() => findNext(true)}><ChevronUp size={17} /></button><button title="Next match" aria-label="Next sheet match" disabled={!matches.length} onClick={() => findNext()}><ChevronDown size={17} /></button>
      <input aria-label="Replace in sheet" placeholder="Replace with" value={replacement} onChange={event => setReplacement(event.target.value)} /><button className="quiet-button" disabled={!matches.length} onClick={() => { const reference = matches.includes(active) ? active : matches[0]; update(replaceSheetText(sheetRef.current, query, replacement, [reference], matchCase)); selectCell(reference); }}>Replace</button>
      <button className="quiet-button" disabled={!matches.length} onClick={() => { update(replaceSheetText(sheetRef.current, query, replacement, matches, matchCase)); onNotify(`Replaced text in ${matches.length} cell${matches.length === 1 ? "" : "s"}.`); }}>Replace all</button><label><input type="checkbox" checked={matchCase} onChange={event => setMatchCase(event.target.checked)} /> Match case</label><button aria-label="Close sheet find" onClick={() => { setFindOpen(false); selectCell(active); }}><X size={17} /></button>
    </div>}
    <div className="sheet-scroll"><table ref={grid} className="sheet-grid"><thead><tr><th />{Array.from({ length: sheet.columns }, (_, column) => <th key={column}><button aria-label={`Select column ${columnLabel(column)}`} onClick={() => selectCell(columnLabel(column) + (position.row + 1))}>{columnLabel(column)}</button></th>)}</tr></thead><tbody>{Array.from({ length: sheet.rows }, (_, row) => <tr key={row}><th><button aria-label={`Select row ${row + 1}`} onClick={() => selectCell(columnLabel(position.column) + (row + 1))}>{row + 1}</button></th>{Array.from({ length: sheet.columns }, (_, column) => {
      const reference = columnLabel(column) + (row + 1);
      return <td className={active === reference ? "selected-cell" : ""} key={column}><input aria-label={`Cell ${reference}`} value={active === reference ? sheet.cells[reference] || "" : evaluateCell(sheet.cells[reference] || "", sheet.cells)} onFocus={() => setActive(reference)} onChange={event => update({ ...sheetRef.current, cells: { ...sheetRef.current.cells, [reference]: event.target.value } }, reference)} onKeyDown={event => {
        if (event.key === "Enter" && !event.altKey && !event.metaKey && !event.ctrlKey) { event.preventDefault(); selectCell(columnLabel(column) + (Math.max(0, Math.min(sheet.rows - 1, row + (event.shiftKey ? -1 : 1))) + 1)); }
        if (event.key === "Tab") { event.preventDefault(); const target = Math.max(0, Math.min(sheet.rows * sheet.columns - 1, row * sheet.columns + column + (event.shiftKey ? -1 : 1))); selectCell(columnLabel(target % sheet.columns) + (Math.floor(target / sheet.columns) + 1)); }
      }} onPaste={event => {
        const text = event.clipboardData.getData("text/plain"); if (!text.includes("\t") && !text.includes("\n")) return;
        if (text.length > 4 * 1024 * 1024) { event.preventDefault(); onNotify("Paste spreadsheet data smaller than 4 MB."); return; }
        event.preventDefault(); const cells = { ...sheetRef.current.cells }, lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").slice(0, 200 - row); let columns = sheetRef.current.columns;
        lines.forEach((line, rowOffset) => line.split("\t").slice(0, 26 - column).forEach((value, columnOffset) => { cells[columnLabel(column + columnOffset) + (row + rowOffset + 1)] = value; columns = Math.max(columns, column + columnOffset + 1); }));
        update({ ...sheetRef.current, cells, rows: Math.max(sheetRef.current.rows, row + lines.length), columns });
      }} /></td>;
    })}</tr>)}</tbody></table></div>
    <footer className="sheet-status">Sheet 1 · {sheet.rows} rows × {sheet.columns} columns · SUM, AVERAGE, MIN, MAX, COUNT, cell references and arithmetic</footer>
  </div>;
}
