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
