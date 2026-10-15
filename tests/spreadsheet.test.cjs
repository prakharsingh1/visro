const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../src/spreadsheet.ts');
test('spreadsheet formulas compute ranges, references and arithmetic without evaluating code',async()=>{
  const {evaluateCell,columnLabel}=await modulePromise;
  const cells={A1:'10',A2:'20',A3:'30',B1:'=SUM(A1:A3)',B2:'=AVERAGE(A1:A3)',B3:'=B1*2+MIN(A1:A3)'};
  assert.equal(evaluateCell(cells.B1,cells),'60');assert.equal(evaluateCell(cells.B2,cells),'20');assert.equal(evaluateCell(cells.B3,cells),'130');
  assert.equal(evaluateCell('=2*(3+4)-5/2',cells),'11.5');assert.equal(evaluateCell('=COUNT(A1:A3)',cells),'3');
  assert.equal(evaluateCell('=globalThis.secret',cells),'#ERROR!');assert.equal(evaluateCell('=1/0',cells),'#ERROR!');
  assert.equal(evaluateCell('=A1',{A1:'=A2',A2:'=A1'}),'#ERROR!');assert.equal(evaluateCell('=SUM(A1:ZZ99999)',cells),'#ERROR!');
  assert.equal(columnLabel(25),'Z');assert.equal(columnLabel(26),'AA');assert.equal(columnLabel(51),'AZ');
});
test('CSV preserves quoted commas, multiline cells, quotes, and CRLF without retaining phantom rows',async()=>{
  const {parseCSV}=await modulePromise;
  assert.deepEqual(parseCSV('\ufeffName,Note\r\n"A, B","line 1\nline 2"\r\nC,"said ""hello"""\r\n'),[['Name','Note'],['A, B','line 1\nline 2'],['C','said "hello"']]);
  assert.deepEqual(parseCSV(''),[]);assert.throws(()=>parseCSV('a,"broken'),/unclosed quote/);assert.throws(()=>parseCSV('x'.repeat(4*1024*1024+1)),/4 MB/);
});

test('sheet sorting preserves records, keeps headers, sorts numbers numerically and moves relative formulas',async()=>{
  const {sortSheetRows,evaluateCell}=await modulePromise;
  const sheet={rows:8,columns:4,cells:{A1:'Name',B1:'Score',C1:'Doubled',D1:'Rate',A2:'Ten',B2:'10',C2:'=B2*2+$D$2',D2:'5',A3:'Two',B3:'2',C3:'=B3*2+$D$2',A4:'Seven',B4:'7',C4:'=B4*2+$D$2'}};
  const sorted=sortSheetRows(sheet,1,'ascending');
  assert.equal(sorted.cells.A1,'Name');assert.equal(sorted.cells.A2,'Two');assert.equal(sorted.cells.B2,'2');assert.equal(sorted.cells.C2,'=B2*2+$D$2');
  assert.equal(sorted.cells.A3,'Seven');assert.equal(sorted.cells.A4,'Ten');assert.equal(sorted.cells.D4,'5');assert.equal(sorted.rows,8);
  assert.equal(evaluateCell('=$B$2+B$3+$B4',sorted.cells),'19');
  assert.equal(sortSheetRows(sheet,1,'descending').cells.A2,'Ten');
  assert.equal(sheet.cells.A2,'Ten');assert.equal(sheet.cells.A3,'Two');
});

test('sheet insertions and deletions shift cells and repair formulas including absolute references and ranges',async()=>{
  const {changeSheetStructure,evaluateCell}=await modulePromise;
  const sheet={rows:5,columns:3,cells:{A1:'Value',A2:'10',A3:'20',A4:'30',B5:'=SUM(A2:A4)',C5:'=$A$3+A2'}};
  const inserted=changeSheetStructure(sheet,'row',2);
  assert.equal(inserted.rows,6);assert.equal(inserted.cells.A4,'20');assert.equal(inserted.cells.B6,'=SUM(A2:A5)');assert.equal(inserted.cells.C6,'=$A$4+A2');assert.equal(evaluateCell(inserted.cells.B6,inserted.cells),'60');
  const removed=changeSheetStructure(sheet,'row',2,true);
  assert.equal(removed.rows,4);assert.equal(removed.cells.A3,'30');assert.equal(removed.cells.B4,'=SUM(A2:A3)');assert.equal(removed.cells.C4,'=#REF!+A2');assert.equal(evaluateCell(removed.cells.B4,removed.cells),'40');
  const column=changeSheetStructure(sheet,'column',0);
  assert.equal(column.cells.C5,'=SUM(B2:B4)');assert.equal(column.cells.D5,'=$B$3+B2');
  const shrunk=changeSheetStructure(sheet,'row',1,true);assert.equal(shrunk.cells.B4,'=SUM(A2:A3)');
  assert.equal(changeSheetStructure({cells:{A1:'x'},rows:1,columns:1},'row',0,true).rows,1);
  const deleted=changeSheetStructure({cells:{A1:'1',B1:'=SUM(A1:A1)'},rows:2,columns:2},'row',0,true);assert.equal(deleted.rows,1);assert.deepEqual(deleted.cells,{});
});

test('sheet find and replace is literal, case-aware and leaves unmatched cells and formula text intact',async()=>{
  const {findSheetCells,replaceSheetText}=await modulePromise;
  const sheet={rows:4,columns:3,cells:{A1:'A.b A.b',A2:'a.B',B1:'Axb',C3:'=A1&"A.b"'}};
  assert.deepEqual(findSheetCells(sheet,'a.b'),['A1','A2','C3']);assert.deepEqual(findSheetCells(sheet,'A.b',true),['A1','C3']);
  const changed=replaceSheetText(sheet,'A.b','$&',undefined,true);assert.equal(changed.cells.A1,'$& $&');assert.equal(changed.cells.A2,'a.B');assert.equal(changed.cells.B1,'Axb');assert.equal(changed.cells.C3,'=A1&"$&"');
  assert.equal(sheet.cells.A1,'A.b A.b');assert.equal(replaceSheetText(sheet,'','x'),sheet);
});

test('sheet normalization bounds imported grids and rejects out-of-range or malformed cells',async()=>{
  const {normalizeSheet,cellPosition}=await modulePromise;
  assert.deepEqual(normalizeSheet({rows:3,columns:2,cells:{A1:'safe',B3:'last',C1:'outside',A4:'outside',A0:'invalid','__proto__':'bad',B1:12}}),{rows:3,columns:2,cells:{A1:'safe',B3:'last'}});
  assert.equal(normalizeSheet({rows:99999,columns:99999}).rows,200);assert.equal(normalizeSheet({rows:99999,columns:99999}).columns,26);assert.deepEqual(cellPosition('AA12'),{row:11,column:26});assert.equal(cellPosition('A0'),null);
});
