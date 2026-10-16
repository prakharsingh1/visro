const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {build}=require('esbuild');

let Textbox,environment,helpers;
before(async()=>{
  const fabric=await import('fabric/node');Textbox=fabric.Textbox;environment=fabric.getEnv();
  const output=await build({entryPoints:[join(__dirname,'../src/editor-text.ts')],bundle:true,platform:'node',format:'cjs',write:false});
  const moduleValue={exports:{}};new Function('module','exports',output.outputFiles[0].text)(moduleValue,moduleValue.exports);helpers=moduleValue.exports;
});
const source=object=>object._text.join('');
function objectFor(text){return new Textbox(text,{width:220,fontSize:24,fontFamily:'Arial',fontWeight:400,fill:'#111111'});}
function select(object,start,end){
  object.isEditing=true;
  const range=object.fromStringToGraphemeSelection(start,end,source(object));
  object.selectionStart=range.selectionStart;object.selectionEnd=range.selectionEnd;
  object.hiddenTextarea??=environment.document.createElement('textarea');object.hiddenTextarea.value=source(object);
  object._updateTextarea();
}
function glyphIndex(object,substring){return object.graphemeSplit(source(object).slice(0,source(object).indexOf(substring))).length;}
function styleAt(object,substring){const index=glyphIndex(object,substring);return object.getSelectionStyles(index,index+1,true)[0];}
function colour(object,substring,fill){const index=glyphIndex(object,substring);object.setSelectionStyles({fill},index,index+object.graphemeSplit(substring).length);}
function dispose(object){object.isEditing=false;object.abortCursorAnimation();object.dispose();}

test('selected Unicode casing preserves emoji, each expanded glyph style, following styles and textarea cursor',()=>{
  const object=objectFor('🙂 abstraße Z');
  try{
    colour(object,'ß','#ff0000');colour(object,'e','#00ff00');colour(object,'Z','#0000ff');
    object.setSelectionStyles({fontStyle:'italic'},0,1);
    const start=source(object).indexOf('ab'),end=source(object).indexOf(' Z');select(object,start,end);
    assert.equal(helpers.formatTextObject(object,{type:'case',value:'upper'}),true);
    assert.equal(object.text,'🙂 ABSTRASSE Z');
    const double=glyphIndex(object,'SS');assert.equal(object.getSelectionStyles(double,double+1,true)[0].fill,'#ff0000');assert.equal(object.getSelectionStyles(double+1,double+2,true)[0].fill,'#ff0000');
    assert.equal(styleAt(object,'E').fill,'#00ff00');assert.equal(styleAt(object,'Z').fill,'#0000ff');assert.equal(object.getSelectionStyles(0,1,true)[0].fontStyle,'italic');
    assert.equal(object.hiddenTextarea.value,object.text);assert.equal(object.hiddenTextarea.selectionStart,start);assert.equal(object.hiddenTextarea.selectionEnd,end+1);
    assert.equal(object._text.slice(object.selectionStart,object.selectionEnd).join(''),'ABSTRASSE');
  }finally{dispose(object);}
});

test('lowercase expansion retains the original style on combining marks without shifting the next character',()=>{
  const object=objectFor('İX');
  try{
    colour(object,'İ','#ff0000');colour(object,'X','#00ff00');select(object,0,2);
    helpers.formatTextObject(object,{type:'case',value:'lower'});assert.equal(object.text,'i̇x');
    const graphemes=object.graphemeSplit(object.text);assert.equal(graphemes[0],'i̇');
    assert.deepEqual(object.getSelectionStyles(0,graphemes.length,true).map(style=>style.fill),['#ff0000','#00ff00']);
    assert.equal(object.hiddenTextarea.selectionEnd,3);
  }finally{dispose(object);}
});

test('logical selected lines become a real list, preserve blank paragraphs/body styling and align left',()=>{
  const object=objectFor('Before\nAlpha\n\nBeta\nAfter');
  try{
    object.set('textAlign','center');colour(object,'Beta','#00ff00');colour(object,'After','#0000ff');
    const start=source(object).indexOf('Alpha'),end=source(object).indexOf('After');select(object,start,end);
    assert.equal(helpers.formatTextObject(object,{type:'list',style:'bullet'}),true);
    assert.equal(object.text,'Before\n• Alpha\n\n• Beta\nAfter');assert.equal(object.textAlign,'left');assert.equal(styleAt(object,'Beta').fill,'#00ff00');assert.equal(styleAt(object,'After').fill,'#0000ff');
    assert.equal(object.hiddenTextarea.selectionStart,start);assert.equal(object.hiddenTextarea.selectionEnd,end+4);
    assert.equal(helpers.formatTextObject(object,{type:'list',style:'cycle'}),true);assert.equal(object.text,'Before\n1. Alpha\n\n1. Beta\nAfter');
  }finally{dispose(object);}
});

test('Enter continues numbered lists with inherited typing style and preserves following text styles',()=>{
  const object=objectFor('1. First\n2. Second');
  try{
    colour(object,'First','#ff0000');colour(object,'Second','#00ff00');const caret=source(object).indexOf('\n');select(object,caret,caret);
    assert.equal(helpers.continueTextObjectList(object),true);assert.equal(object.text,'1. First\n2. \n3. Second');
    const inserted=glyphIndex(object,'2. ');assert.equal(object.getSelectionStyles(inserted,inserted+1,true)[0].fill,'#ff0000');
    assert.equal(styleAt(object,'Second').fill,'#00ff00');assert.equal(object.hiddenTextarea.selectionStart,'1. First\n2. '.length);assert.equal(object.selectionStart,object.selectionEnd);
  }finally{dispose(object);}
});

test('empty list Enter exits; Tab indentation is consumed only inside an editing list',()=>{
  const object=objectFor('• First\n• \nAfter');
  try{
    const caret=source(object).indexOf('\nAfter');select(object,caret,caret);
    assert.equal(helpers.continueTextObjectList(object),true);assert.equal(object.text,'• First\n\nAfter');assert.equal(object.hiddenTextarea.selectionStart,'• First\n'.length);
    assert.equal(helpers.continueTextObjectList(object),false);assert.equal(helpers.indentTextObjectList(object,1),false);
    select(object,3,3);assert.equal(helpers.indentTextObjectList(object,1),true);assert.equal(object.text,'  • First\n\nAfter');
    assert.equal(helpers.indentTextObjectList(object,-1),true);assert.equal(object.text,'• First\n\nAfter');
    assert.equal(helpers.indentTextObjectList(object,-1),true,'Tab stays in a list even when outdent is already at zero');assert.equal(object.text,'• First\n\nAfter');
  }finally{dispose(object);}
});

test('font/style controls affect selected characters while paragraph controls affect the box',()=>{
  const object=objectFor('first SECOND last');
  try{
    const start=source(object).indexOf('SECOND');select(object,start,start+6);
    assert.equal(helpers.applyTextObjectStyle(object,{fontWeight:500,fontSize:31,fontStyle:'italic',underline:true,linethrough:true,fill:'#123456',align:'right',lineHeight:1.7}),true);
    assert.equal(object.fontWeight,400);assert.equal(object.fontSize,24);assert.equal(styleAt(object,'first').fontWeight,400);
    const selected=styleAt(object,'SECOND');assert.equal(selected.fontWeight,500);assert.equal(selected.fontSize,31);assert.equal(selected.fill,'#123456');assert.equal(selected.fontStyle,'italic');assert.equal(selected.underline,true);assert.equal(selected.linethrough,true);
    assert.equal(object.textAlign,'right');assert.equal(object.lineHeight,1.7);assert.equal(helpers.getTextObjectSelectionStyle(object).fontWeight,500);
    assert.equal(helpers.applyTextObjectStyle(object,{fontWeight:500,fontSize:31}),false,'unchanged selected styles do not create a new history operation');
  }finally{dispose(object);}
});

test('whole-object style changes clear only that property’s character overrides and survive Fabric serialization',async()=>{
  const object=objectFor('first second');let restored;
  try{
    colour(object,'second','#ff0000');const index=glyphIndex(object,'second');object.setSelectionStyles({fontWeight:600,underline:true},index,index+6);
    assert.equal(helpers.applyTextObjectStyle(object,{fontWeight:700}),true);assert.equal(styleAt(object,'first').fontWeight,700);assert.equal(styleAt(object,'second').fontWeight,700);assert.equal(styleAt(object,'second').fill,'#ff0000');assert.equal(styleAt(object,'second').underline,true);
    helpers.formatTextObject(object,{type:'case',value:'upper'});
    restored=await Textbox.fromObject(object.toObject());assert.equal(restored.text,'FIRST SECOND');assert.equal(styleAt(restored,'SECOND').fill,'#ff0000');assert.equal(styleAt(restored,'SECOND').underline,true);assert.equal(styleAt(restored,'SECOND').fontWeight,700);
  }finally{dispose(object);if(restored)dispose(restored);}
});

test('many changed words perform one Fabric wrapping/layout pass and no-op case performs none',()=>{
  const object=objectFor(Array.from({length:150},(_,index)=>`word${index}`).join(' '));
  try{
    let layouts=0;const original=object.initDimensions;object.initDimensions=function(){layouts++;return original.call(this);};
    assert.equal(helpers.formatTextObject(object,{type:'case',value:'upper'}),true);assert.equal(layouts,1);
    assert.equal(helpers.formatTextObject(object,{type:'case',value:'upper'}),false);assert.equal(layouts,1);
  }finally{dispose(object);}
});

test('imported CRLF uses Fabric’s normalized glyph offsets without losing paragraph or following styles',()=>{
  const object=objectFor('Before\r\nStraße\r\nAfter');
  try{
    colour(object,'After','#00ff00');const start=source(object).indexOf('Straße');select(object,start,start+'Straße'.length);
    helpers.formatTextObject(object,{type:'case',value:'upper'});assert.equal(object.text,'Before\nSTRASSE\nAfter');assert.equal(styleAt(object,'After').fill,'#00ff00');assert.equal(object.hiddenTextarea.selectionStart,start);assert.equal(object.hiddenTextarea.selectionEnd,start+7);
  }finally{dispose(object);}
});
