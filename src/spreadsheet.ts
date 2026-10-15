export function columnLabel(index:number):string {let result="";for(let n=index+1;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
export function evaluateCell(value:string,cells:Record<string,string>,seen=new Set<string>()):string {
  if(!value.startsWith("="))return value;
  value=value.replace(/\$?([A-Za-z]+)\$?(\d+)/g,(_match,column,row)=>column+row);
  const cell=(ref:string):number=>{if(seen.has(ref))throw new Error("cycle");const next=new Set(seen);next.add(ref);const raw=evaluateCell(cells[ref]||"0",cells,next);const number=Number(raw);if(!Number.isFinite(number))throw new Error("value");return number;};
  const range=(s:string)=>{const [a,b]=s.split(":");const parse=(r:string)=>{const match=r.match(/^([A-Z]+)(\d+)$/);if(!match)throw new Error("reference");let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;return [col-1,Number(match[2])-1];};const [ac,ar]=parse(a),[bc,br]=parse(b||a);if((Math.abs(bc-ac)+1)*(Math.abs(br-ar)+1)>5000)throw new Error("range");const out:number[]=[];for(let r=Math.min(ar,br);r<=Math.max(ar,br);r++)for(let c=Math.min(ac,bc);c<=Math.max(ac,bc);c++)out.push(cell(columnLabel(c)+(r+1)));return out;};
  try {let expression=value.slice(1).toUpperCase().replace(/(SUM|AVERAGE|MIN|MAX|COUNT)\(([^()]+)\)/g,(_m,fn,args)=>{const numbers:number[]=String(args).split(",").flatMap((v:string)=>v.trim().match(/^[A-Z]+\d+(:[A-Z]+\d+)?$/)?range(v.trim()):[Number(v)]);if(numbers.some(n=>!Number.isFinite(n)))throw new Error("value");const sum=numbers.reduce((a,b)=>a+b,0);return String(fn==="SUM"?sum:fn==="AVERAGE"?sum/numbers.length:fn==="MIN"?Math.min(...numbers):fn==="MAX"?Math.max(...numbers):numbers.length);}).replace(/[A-Z]+\d+/g,ref=>String(cell(ref)));
    if(!/^[\d\s.+\-*/()%]+$/.test(expression)||expression.length>500)throw new Error("formula");
    const tokens=expression.match(/\d+(?:\.\d+)?|\.\d+|[()+\-*/%]/g)||[];let i=0;
    const primary=():number=>{const t=tokens[i++];if(t==="-")return -primary();if(t==="+")return primary();if(t==="("){const v=add();if(tokens[i++]!==")")throw new Error("parenthesis");return v;}const n=Number(t);if(t===undefined||!Number.isFinite(n))throw new Error("number");return n;};
    const mul=():number=>{let v=primary();while(["*","/","%"].includes(tokens[i])){const op=tokens[i++],n=primary();v=op==="*"?v*n:op==="/"?v/n:v%n;}return v;};
    const add=():number=>{let v=mul();while(["+","-"].includes(tokens[i])){const op=tokens[i++],n=mul();v=op==="+"?v+n:v-n;}return v;};
    const result=add();if(i!==tokens.length||!Number.isFinite(result))throw new Error("invalid");return String(Math.round(result*1e8)/1e8);
  }catch{return "#ERROR!";}
}

export function parseCSV(text:string):string[][] {
  if(text.length>4*1024*1024)throw new Error("Choose a CSV smaller than 4 MB.");
  const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else if(quoted||value.length===0)quoted=!quoted;else value+=c;}
    else if(!quoted&&c===','){row.push(value);value="";}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value="";}
    else value+=c;
  }
  if(quoted)throw new Error("The CSV contains an unclosed quote.");
  if(value.length||row.length){row.push(value);rows.push(row);}
  if(rows[0]?.[0])rows[0][0]=rows[0][0].replace(/^\uFEFF/,"");
  return rows;
}


export type SheetContent = { cells: Record<string, string>; rows: number; columns: number };
export type SheetAxis = "row" | "column";
export const SHEET_LIMITS = { rows: 200, columns: 26 };

export function cellPosition(reference: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(reference);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, column: column - 1 };
}

export function normalizeSheet(value: unknown): SheetContent {
  const input = value && typeof value === "object" ? value as Partial<SheetContent> : {};
  const rows = Math.max(1, Math.min(SHEET_LIMITS.rows, Math.floor(Number(input.rows) || 20)));
  const columns = Math.max(1, Math.min(SHEET_LIMITS.columns, Math.floor(Number(input.columns) || 8)));
  const cells: Record<string, string> = {};
  if (input.cells && typeof input.cells === "object") {
    for (const [reference, content] of Object.entries(input.cells)) {
      const position = cellPosition(reference);
      if (position && position.row < rows && position.column < columns && typeof content === "string" && content) {
        cells[reference] = content.slice(0, 32768);
      }
    }
  }
  return { cells, rows, columns };
}

// Moving a formula with its row keeps relative references attached to that row.
function moveFormula(value: string, rowDelta: number): string {
  if (!value.startsWith("=")) return value;
  return value.replace(/(\$?[A-Z]+)(\$?)([1-9]\d*)/gi, (_match, column, absolute, row) => {
    const target = Number(row) + (absolute ? 0 : rowDelta);
    return target > 0 ? `${column}${absolute}${target}` : "#REF!";
  });
}

export function sortSheetRows(sheet: SheetContent, column: number, direction: "ascending" | "descending", header = true): SheetContent {
  if (column < 0 || column >= sheet.columns) return sheet;
  const start = header ? 1 : 0;
  let end = start;
  for (const reference of Object.keys(sheet.cells)) {
    const position = cellPosition(reference);
    if (position && sheet.cells[reference].trim()) end = Math.max(end, position.row + 1);
  }
  const order = Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  order.sort((left, right) => {
    const a = evaluateCell(sheet.cells[columnLabel(column) + (left + 1)] || "", sheet.cells);
    const b = evaluateCell(sheet.cells[columnLabel(column) + (right + 1)] || "", sheet.cells);
    if (!a.trim() || !b.trim()) return !a.trim() ? (!b.trim() ? left - right : 1) : -1;
    const numericA = Number(a), numericB = Number(b);
    const comparison = Number.isFinite(numericA) && Number.isFinite(numericB) ? numericA - numericB : collator.compare(a, b);
    return (direction === "ascending" ? comparison : -comparison) || left - right;
  });
  const cells = { ...sheet.cells };
  for (let row = start; row < end; row++) {
    for (let c = 0; c < sheet.columns; c++) delete cells[columnLabel(c) + (row + 1)];
  }
  order.forEach((source, index) => {
    const target = start + index;
    for (let c = 0; c < sheet.columns; c++) {
      const value = sheet.cells[columnLabel(c) + (source + 1)];
      if (value) cells[columnLabel(c) + (target + 1)] = moveFormula(value, target - source);
    }
  });
  return { ...sheet, cells };
}

function adjustFormula(value: string, axis: SheetAxis, index: number, remove: boolean): string {
  if (!value.startsWith("=")) return value;
  const reference = (raw: string, rangeEdge?: "start" | "end") => {
    const match = /^(\$?)([A-Z]+)(\$?)([1-9]\d*)$/i.exec(raw);
    if (!match) return raw;
    const position = cellPosition(match[2].toUpperCase() + match[4]);
    if (!position) return raw;
    const coordinate = axis === "row" ? position.row : position.column;
    let target = coordinate;
    if (remove && coordinate === index) {
      if (!rangeEdge) return "#REF!";
      target = rangeEdge === "end" ? Math.max(0, coordinate - 1) : coordinate;
    } else if (coordinate >= index) target += remove ? -1 : 1;
    const column = axis === "column" ? columnLabel(target) : match[2];
    const row = axis === "row" ? target + 1 : Number(match[4]);
    return `${match[1]}${column}${match[3]}${row}`;
  };
  return value.replace(/\$?[A-Z]+\$?[1-9]\d*(?::\$?[A-Z]+\$?[1-9]\d*)?/gi, token => {
    if (!token.includes(":")) return reference(token);
    const [first, last] = token.split(":");
    const a = cellPosition(first.replaceAll("$", "").toUpperCase());
    const b = cellPosition(last.replaceAll("$", "").toUpperCase());
    if (remove && a && b && (axis === "row" ? a.row === index && b.row === index : a.column === index && b.column === index)) return "#REF!";
    return `${reference(first, "start")}:${reference(last, "end")}`;
  });
}

export function changeSheetStructure(sheet: SheetContent, axis: SheetAxis, index: number, remove = false): SheetContent {
  const length = axis === "row" ? sheet.rows : sheet.columns;
  const limit = axis === "row" ? SHEET_LIMITS.rows : SHEET_LIMITS.columns;
  if (remove ? length <= 1 || index < 0 || index >= length : length >= limit || index < 0 || index > length) return sheet;
  const cells: Record<string, string> = {};
  for (const [reference, value] of Object.entries(sheet.cells)) {
    const position = cellPosition(reference);
    if (!position) continue;
    const coordinate = axis === "row" ? position.row : position.column;
    if (remove && coordinate === index) continue;
    if (coordinate >= index) {
      if (axis === "row") position.row += remove ? -1 : 1;
      else position.column += remove ? -1 : 1;
    }
    cells[columnLabel(position.column) + (position.row + 1)] = adjustFormula(value, axis, index, remove);
  }
  return { cells, rows: sheet.rows + (axis === "row" ? (remove ? -1 : 1) : 0), columns: sheet.columns + (axis === "column" ? (remove ? -1 : 1) : 0) };
}

export function findSheetCells(sheet: SheetContent, query: string, matchCase = false): string[] {
  if (!query) return [];
  const needle = matchCase ? query : query.toLocaleLowerCase();
  return Object.keys(sheet.cells).filter(reference => {
    const value = sheet.cells[reference];
    return (matchCase ? value : value.toLocaleLowerCase()).includes(needle);
  }).sort((a, b) => {
    const left = cellPosition(a)!, right = cellPosition(b)!;
    return left.row - right.row || left.column - right.column;
  });
}

export function replaceSheetText(sheet: SheetContent, query: string, replacement: string, references = findSheetCells(sheet, query), matchCase = false): SheetContent {
  if (!query || !references.length) return sheet;
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "g" : "gi");
  const cells = { ...sheet.cells };
  for (const reference of references) {
    if (!(reference in cells)) continue;
    const result = cells[reference].replace(pattern, () => replacement);
    if (result) cells[reference] = result;
    else delete cells[reference];
  }
  return { ...sheet, cells };
}
