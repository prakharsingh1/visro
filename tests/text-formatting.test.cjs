const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {transformSync}=require('esbuild');

const moduleValue={exports:{}};
new Function('module','exports',transformSync(readFileSync(join(__dirname,'../src/text-formatting.ts'),'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code)(moduleValue,moduleValue.exports);
const {formatTextSelection:format,getTextListStyle,getListEnterEdit,numericFontWeight}=moduleValue.exports;
const whole=text=>({start:0,end:text.length});
const list=(text,style='cycle',selection=whole(text))=>format(text,selection,{type:'list',style});

function checkEdits(original,result){
  let rebuilt=original;
  for(let index=result.edits.length-1;index>=0;index--){
    const edit=result.edits[index];
    assert.ok(edit.start>=0&&edit.end>=edit.start&&edit.end<=original.length);
    if(index>0)assert.ok(result.edits[index-1].end<=edit.start,'edits in original offsets cannot overlap');
    rebuilt=rebuilt.slice(0,edit.start)+edit.insert+rebuilt.slice(edit.end);
  }
  assert.equal(rebuilt,result.text,'reverse edit application must reproduce the result for Fabric style-preserving insertion');
  assert.ok(result.selectionStart>=0&&result.selectionStart<=result.selectionEnd&&result.selectionEnd<=result.text.length);
}

test('list cycles plain → bullets → numbers → plain without flattening blank paragraphs or CRLF',()=>{
  const original='First\r\n\r\nSecond\r\nThird';
  const bullets=list(original);assert.equal(bullets.text,'• First\r\n\r\n• Second\r\n• Third');checkEdits(original,bullets);
  const numbers=list(bullets.text);assert.equal(numbers.text,'1. First\r\n\r\n1. Second\r\n2. Third');checkEdits(bullets.text,numbers);
  const plain=list(numbers.text);assert.equal(plain.text,original);checkEdits(numbers.text,plain);
});

test('selection ending at a paragraph start leaves that paragraph and surrounding text untouched',()=>{
  const text='Unchanged\nFirst\nSecond\nUntouched';
  const range={start:text.indexOf('First')+2,end:text.indexOf('Untouched')};
  const result=list(text,'bullet',range);
  assert.equal(result.text,'Unchanged\n• First\n• Second\nUntouched');
  assert.equal(result.text.slice(result.selectionStart,result.selectionEnd),'rst\n• Second\n');
  checkEdits(text,result);
});

test('collapsed caret formats only its current paragraph and follows inserted or removed prefix',()=>{
  const text='Before\nCurrent\nAfter',start=text.indexOf('Current');
  const result=list(text,'bullet',{start,end:start});
  assert.equal(result.text,'Before\n• Current\nAfter');assert.equal(result.selectionStart,start+2);assert.equal(result.selectionEnd,start+2);
  const removed=list(result.text,'bullet',{start:result.selectionStart,end:result.selectionEnd});
  assert.equal(removed.text,text);assert.equal(removed.selectionStart,start);checkEdits(text,result);
});

test('empty paragraph can start a list while multi-line blank paragraphs stay blank',()=>{
  const result=list('','bullet',{start:0,end:0});assert.equal(result.text,'• ');assert.equal(result.selectionStart,2);
  const empty='   \n\n';assert.equal(list(empty,'numbered').text,empty);
  assert.equal(list('Before\n\nAfter','bullet',{start:7,end:7}).text,'Before\n• \nAfter');
});

test('mixed list prefixes normalize as one list and selected numbering continues prior siblings',()=>{
  const mixed='• First\n2. Second\nThird';assert.equal(list(mixed,'bullet').text,'• First\n• Second\n• Third');
  const text='3. Earlier\nFirst\nSecond\nUnchanged';
  const result=list(text,'numbered',{start:text.indexOf('First'),end:text.indexOf('Unchanged')});
  assert.equal(result.text,'3. Earlier\n4. First\n5. Second\nUnchanged');checkEdits(text,result);
});

test('nested numbering restarts children and resumes each parent depth',()=>{
  const text='• Parent\n  • First child\n  • Second child\n• Next parent';
  assert.equal(list(text,'numbered').text,'1. Parent\n  1. First child\n  2. Second child\n2. Next parent');
});

test('cycle uses selected paragraph kind even when other paragraphs have different formatting',()=>{
  const text='Plain\n• Item\nOther',start=text.indexOf('Item');
  assert.equal(getTextListStyle(text),'mixed');assert.equal(getTextListStyle(text,{start,end:start}),'bullet');
  const result=list(text,'cycle',{start,end:start});assert.equal(result.text,'Plain\n1. Item\nOther');checkEdits(text,result);
});

test('indent/outdent target selected paragraphs and renumber moved nested items',()=>{
  const text='1. Parent\n2. Child\n3. Following',start=text.indexOf('2. Child'),end=text.indexOf('3. Following');
  const indented=format(text,{start,end},{type:'indent',direction:1});
  assert.equal(indented.text,'1. Parent\n  1. Child\n3. Following');checkEdits(text,indented);
  const outdented=format(indented.text,{start:indented.selectionStart,end:indented.selectionEnd},{type:'indent',direction:-1});
  assert.equal(outdented.text,text);checkEdits(indented.text,outdented);
  assert.equal(format('\t• Item',whole('\t• Item'),{type:'indent',direction:-1}).text,'• Item');
  const maximum='                • Item';assert.equal(format(maximum,whole(maximum),{type:'indent',direction:1}).text,maximum);
  const topLevel='7. Item';assert.equal(format(topLevel,whole(topLevel),{type:'indent',direction:-1}).text,topLevel,'outdent at depth zero must not renumber an unchanged list');
});

test('case conversion respects actual selected substring, emoji and length-changing Unicode',()=>{
  const text='Before 😊 straße AFTER',start=text.indexOf('straße'),end=start+'straße'.length;
  const result=format(text,{start,end},{type:'case',value:'upper'});
  assert.equal(result.text,'Before 😊 STRASSE AFTER');assert.equal(result.text.slice(result.selectionStart,result.selectionEnd),'STRASSE');checkEdits(text,result);
  const toggled=format(result.text,{start:result.selectionStart,end:result.selectionEnd},{type:'case',value:'toggle'});
  assert.equal(toggled.text,'Before 😊 strasse AFTER');checkEdits(result.text,toggled);
});

test('title and sentence case preserve apostrophes, list prefixes, punctuation and paragraphs',()=>{
  const text='• DON’T STOP. keep GOING!\r\n2. NEXT paragraph';
  assert.equal(format(text,whole(text),{type:'case',value:'title'}).text,'• Don’t Stop. Keep Going!\r\n2. Next Paragraph');
  const result=format(text,whole(text),{type:'case',value:'sentence'});
  assert.equal(result.text,'• Don’t stop. Keep going!\r\n2. Next paragraph');checkEdits(text,result);
});

test('case at a collapsed cursor is a no-op and invalid offsets never split a surrogate pair',()=>{
  const text='A 😊 B';assert.equal(format(text,{start:2,end:2},{type:'case',value:'upper'}).text,text);
  const result=format(text,{start:3,end:4},{type:'case',value:'lower'});assert.equal(result.text,text);assert.equal(result.selectionStart,2);assert.equal(result.selectionEnd,4);
  assert.equal(format('Abc',{start:Infinity,end:99},{type:'case',value:'lower'}).text,'abc');
});

test('numeric font weights preserve medium and semibold instead of collapsing them to normal or bold',()=>{
  assert.equal(numericFontWeight(500),500);assert.equal(numericFontWeight('600'),600);assert.equal(numericFontWeight('bold'),700);assert.equal(numericFontWeight('normal'),400);assert.equal(numericFontWeight('unrecognised'),400);
});

test('Enter continues a numbered list, renumbers following siblings and preserves paragraph body text',()=>{
  const text='1. First\r\n  1. Child\r\n2. Second\r\n\r\nAfter',caret=text.indexOf('\r\n');
  const result=getListEnterEdit(text,{start:caret,end:caret});
  assert.equal(result.text,'1. First\r\n2. \r\n  1. Child\r\n3. Second\r\n\r\nAfter');
  assert.equal(result.selectionStart,'1. First\r\n2. '.length);assert.equal(result.selectionEnd,result.selectionStart);checkEdits(text,result);
});

test('Enter on an empty list item exits the list and ordinary paragraphs keep normal Enter behavior',()=>{
  const text='• First\n  • \nAfter',caret=text.indexOf('\nAfter');
  const result=getListEnterEdit(text,{start:caret,end:caret});assert.equal(result.text,'• First\n\nAfter');assert.equal(result.selectionStart,'• First\n'.length);checkEdits(text,result);
  assert.equal(getListEnterEdit('A paragraph',{start:4,end:4}),null);
});
