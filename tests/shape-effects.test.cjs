const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let fabric,environment,api,ShapeEffects;
const props=['id','visroName','visroLocked','visroMetadata','visroGradient','visroShapeEffect','visroShapeEffectBase','visroShapeEffectRole','objectCaching'];
before(async()=>{
 fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);fabric.FabricObject.customProperties=[...new Set([...fabric.FabricObject.customProperties,...props])];
 const result=await build({stdin:{contents:"export * from './src/shape-effects';export {ShapeEffects} from './src/ShapeEffects';",resolveDir:path.join(__dirname,'..'),loader:'ts'},bundle:true,platform:'node',format:'esm',external:['fabric','react','react-dom/server'],loader:{'.css':'empty'},write:false}),file=path.join(__dirname,`shape-effects-build-${process.pid}.mjs`);await fs.writeFile(file,result.outputFiles[0].text);
 try{api=await import(pathToFileURL(file).href);ShapeEffects=api.ShapeEffects;}finally{await fs.unlink(file);}
});
function shape(){const object=new fabric.Rect({left:120,top:120,width:100,height:100,fill:'#e44432',stroke:null,strokeWidth:0,originX:'left',originY:'top'});object.id=crypto.randomUUID();object.visroName='Editable original';object.visroMetadata={altText:'Keep my description'};return object;}
function surface(){return new fabric.StaticCanvas(environment.document.createElement('canvas'),{width:400,height:400,enableRetinaScaling:false,renderOnAddRemove:false});}
function pixel(canvas,x,y){return[...canvas.getContext().getImageData(x,y,1,1).data];}
function near(actual,expected,message){assert.ok(Math.abs(actual-expected)<.0001,`${message}: ${actual} ~= ${expected}`);}

test('the 15 verified presets map to four native mechanisms and retain their distinct base palettes',()=>{
 const list=api.SHAPE_EFFECT_PRESETS;assert.equal(list.length,15);assert.equal(new Set(list.map(item=>item.id)).size,15);assert.equal(list.filter(item=>item.section==='basic').length,4);
 assert.deepEqual([...new Set(list.map(item=>item.effect.type))].sort(),['drop','echo','glitch','glow']);
 for(const preset of list){assert.deepEqual(api.normalizeShapeEffect({preset:preset.id}),preset.effect);if(preset.section==='advanced')assert.ok(api.SHAPE_EFFECT_BASE_STYLES[preset.id]);}
 assert.deepEqual(api.SHAPE_EFFECT_BASE_STYLES.metallic.fill.colors,['#ba943e','#f3f4e3','#dbd299','#6f511a']);assert.equal(api.SHAPE_EFFECT_BASE_STYLES.aura.fill.type,'radial');assert.equal(api.SHAPE_EFFECT_BASE_STYLES.retro.strokeWidth,7);
 const normalized=api.normalizeShapeEffect({type:'drop',direction:800,offset:-20,blur:900,transparency:NaN,color:'url(https://example.com/asset.svg)'});assert.equal(normalized.direction,180);assert.equal(normalized.offset,0);assert.equal(normalized.blur,100);assert.equal(normalized.transparency,30);assert.equal(normalized.color,'#000000');
 assert.equal(api.normalizeShapeEffect({preset:'none'},api.normalizeShapeEffect({preset:'drop'})).type,'none');
});

test('Drop is a real directional native shadow with the observed percent-opacity control',async()=>{
 const source=shape(),before=source.toObject(props),paint=await api.createShapeEffectObject(source,{preset:'drop',direction:0,offset:20,blur:0,transparency:100,color:'#123456'}),canvas=surface();
 try{assert.equal(paint.type,'group');const shadow=api.getShapeEffectBase(paint).shadow;assert.ok(shadow instanceof fabric.Shadow);assert.equal(shadow.offsetX,20);assert.equal(shadow.offsetY,0);assert.equal(new fabric.Color(shadow.color).getAlpha(),1);canvas.add(paint);canvas.renderAll();assert.deepEqual(pixel(canvas,230,170),[18,52,86,255]);assert.deepEqual(pixel(canvas,170,170),[228,68,50,255]);assert.deepEqual(source.toObject(props),before);assert.equal(paint.id,source.id);assert.deepEqual(paint.visroMetadata,source.visroMetadata);
  api.applyShapeEffectPatch(paint,{transparency:0});canvas.renderAll();assert.equal(pixel(canvas,230,170)[3],0);
 }finally{await canvas.dispose();}
});

test('Echo, Glitch and Glow paint genuinely different native effects without moving selection geometry',async()=>{
 for(const type of ['echo','glitch','glow']){
  const source=shape(),bounds=source.getBoundingRect(),paint=await api.createShapeEffectObject(source,{type,direction:0,offset:20,intensity:80,color:'#ff00ff',color2:'#00ffff'}),canvas=surface();
  try{canvas.add(paint);canvas.renderAll();const after=paint.getBoundingRect();for(const key of ['left','top','width','height'])near(after[key],bounds[key],`${type} ${key}`);assert.equal(paint.getObjects().length,type==='glow'?1:3);assert.equal(api.getShapeEffectBase(paint).type,'rect');assert.deepEqual(pixel(canvas,170,170),[228,68,50,255]);
   if(type==='echo'){assert.ok(pixel(canvas,250,170)[3]>0);assert.equal(pixel(canvas,110,170)[3],0);}
   else if(type==='glitch'){assert.deepEqual(pixel(canvas,110,170),[255,0,255,255]);assert.deepEqual(pixel(canvas,230,170),[0,255,255,255]);}
   else{assert.ok(pixel(canvas,110,170)[3]>0);assert.ok(api.getShapeEffectBase(paint).shadow.blur>0);}
  }finally{await canvas.dispose();}
 }
});

test('None preserves current fill/stroke/opacity and restores an original native shadow',async()=>{
 const source=shape();source.set({stroke:'#334455',strokeWidth:7,opacity:.61,shadow:new fabric.Shadow({color:'#112233',blur:4,offsetX:2,offsetY:3})});const originalShadow=source.shadow.toObject();
 const wrapped=await api.createShapeEffectObject(source,{preset:'echo'});assert.equal(api.updateShapeEffectBase(wrapped,{fill:'#00aa44',stroke:'#3366ee',strokeWidth:5}),true);
 const plain=await api.createShapeEffectObject(wrapped,{type:'none'});assert.equal(plain.type,'rect');assert.equal(plain.id,source.id);assert.equal(plain.fill,'#00aa44');assert.equal(plain.stroke,'#3366ee');assert.equal(plain.strokeWidth,5);assert.equal(plain.opacity,.61);assert.deepEqual(plain.shadow.toObject(),originalShadow);assert.equal(api.getShapeEffect(plain).type,'none');assert.equal(plain.visroShapeEffectRole,undefined);
 const metallic=await api.createShapeEffectObject(source,{preset:'metallic'}),removed=await api.createShapeEffectObject(metallic,{type:'none'});assert.ok(removed.fill instanceof fabric.Gradient);assert.equal(removed.stroke,'#ab8115');assert.equal(removed.strokeWidth,7);assert.deepEqual(removed.fill.colorStops.map(stop=>stop.color),api.SHAPE_EFFECT_BASE_STYLES.metallic.fill.colors);
});

test('native save/reopen and SVG export retain every preset, editable vectors and visible paint',async()=>{
 for(const preset of api.SHAPE_EFFECT_PRESETS){
  const canvas=surface(),restored=surface();try{
   const object=await api.createShapeEffectObject(shape(),{preset:preset.id});canvas.add(object);canvas.renderAll();const before=pixel(canvas,170,170),saved=JSON.parse(JSON.stringify(canvas.toObject(props)));assert.equal(saved.objects[0].type,'Group');assert.ok(!JSON.stringify(saved).includes('data:image'));assert.ok(object.getObjects().every(child=>child instanceof fabric.FabricObject));
   await restored.loadFromJSON(saved);restored.renderAll();const reopened=restored.getObjects()[0];assert.equal(api.getShapeEffect(reopened).preset,preset.id);assert.deepEqual(pixel(restored,170,170),before,`${preset.id} reopened paint`);assert.equal(api.getShapeEffectBase(reopened).type,'rect');const svg=restored.toSVG();assert.match(svg,/<rect/);assert.doesNotMatch(svg,/<image/);if(['drop','glow'].includes(preset.effect.type))assert.match(svg,/<filter/);
  }finally{await canvas.dispose();await restored.dispose();}
 }
});

test('transformed and nested vector bases retain their scene matrix, IDs and native gradient',async()=>{
 const source=new fabric.Path('M0 0 H140 V40 L90 100 H0 Z',{left:20,top:30,angle:23,skewX:11,skewY:4,scaleX:1.25,scaleY:.8,flipX:true,fill:'#aa3344',strokeWidth:0}),other=new fabric.Circle({radius:20,left:200,top:100});source.id='nested-source';new fabric.Group([source,other],{left:140,top:130,angle:19,scaleX:1.1,scaleY:.7,flipX:true});const before=source.calcTransformMatrix(),previous=source.toObject(props);
 const effect=await api.createShapeEffectObject(source,{preset:'digital'});effect.calcTransformMatrix().forEach((value,index)=>near(value,before[index],'wrapped scene matrix'));assert.equal(effect.id,'nested-source');assert.ok(api.getShapeEffectBase(effect).fill instanceof fabric.Gradient);const removed=await api.createShapeEffectObject(effect,{type:'none'});removed.calcTransformMatrix().forEach((value,index)=>near(value,before[index],'removed scene matrix'));assert.deepEqual(source.toObject(props),previous);
 const ids=[];const visit=node=>{if(node.id)ids.push(node.id);if(node instanceof fabric.Group)node.getObjects().forEach(visit);};visit(effect);assert.equal(ids.length,new Set(ids).size);
});

test('selection bounds retain native uniform and scaling strokes under rotation and skew',async()=>{
 for(const strokeUniform of [false,true])for(const skewX of [0,13]){
  const source=new fabric.Rect({originX:'center',originY:'center',left:170,top:180,width:100,height:80,fill:'#ff0000',stroke:'#123456',strokeWidth:10,strokeUniform,scaleX:2,scaleY:.8,angle:19,skewX}),before=source.getBoundingRect(),effect=await api.createShapeEffectObject(source,{preset:'echo'}),after=effect.getBoundingRect();
  for(const key of ['left','top','width','height'])near(after[key],before[key],`${strokeUniform}/${skewX} ${key}`);
 }
});

test('control-only refresh reuses vector parts and unsupported or cancelled work stays untouched',async()=>{
 const source=shape(),effect=await api.createShapeEffectObject(source,{preset:'glitch'}),parts=effect.getObjects();assert.equal(api.applyShapeEffectPatch(effect,{offset:37,color:'#112233'}),true);assert.deepEqual(effect.getObjects(),parts);assert.equal(api.getShapeEffect(effect).offset,37);assert.equal(api.applyShapeEffectPatch(effect,{type:'echo'}),false);assert.equal(api.updateShapeEffectBase(effect,{opacity:.2,left:999}),false);
 for(const object of [new fabric.FabricText('Imported label'),new fabric.Textbox('Text'),new fabric.Group([]),new fabric.ActiveSelection([shape()]),new fabric.FabricImage(environment.document.createElement('canvas'))]){assert.equal(api.supportsShapeEffect(object),false);await assert.rejects(api.createShapeEffectObject(object,{type:'drop'}),/native vector/);}
 const before=source.toObject(props),abort=new AbortController(),pending=api.createShapeEffectObject(source,{type:'echo'},{signal:abort.signal});abort.abort();await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(source.toObject(props),before);
});

test('native effect trees paint directly and removing an effect restores original cache choices',async()=>{const a=shape(),b=shape();b.set({left:260,objectCaching:false});const original=new fabric.Group([a,b],{objectCaching:true}),expected=[original.objectCaching,...original.getObjects().map(node=>node.objectCaching)],wrapped=await api.createShapeEffectObject(original,{preset:'echo'});const visit=node=>{assert.equal(node.objectCaching,false);if(node instanceof fabric.Group)node.getObjects().forEach(visit);};visit(wrapped);const plain=await api.createShapeEffectObject(wrapped,{type:'none'});assert.deepEqual([plain.objectCaching,...plain.getObjects().map(node=>node.objectCaching)],expected);assert.equal(original.objectCaching,true);assert.equal(original.getObjects()[0].objectCaching,true);});

test('the panel exposes the observed rows, inline controls, advanced presets and Remove effect',async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const render=type=>renderToStaticMarkup(React.createElement(ShapeEffects,{effect:api.normalizeShapeEffect({type}),onChange(){}}));
 const drop=render('drop');assert.equal((drop.match(/aria-label="Apply /g)||[]).length,15);assert.ok(drop.indexOf('Drop settings')<drop.indexOf('Apply Glitch effect'));for(const label of ['direction','offset','blur','transparency']){assert.ok(drop.includes(`aria-label="Effect ${label}"`));assert.ok(drop.includes(`aria-label="Decrease effect ${label}"`));assert.ok(drop.includes(`aria-label="Increase effect ${label}"`));}assert.match(drop,/Remove effect/);assert.match(drop,/#8b3dff/);
 const glitch=render('glitch');assert.ok(glitch.indexOf('Glitch settings')>glitch.indexOf('Apply Glitch effect'));assert.ok(glitch.indexOf('Glitch settings')<glitch.indexOf('Advanced</h3>'));assert.match(glitch,/Second effect color/);assert.doesNotMatch(glitch,/Effect blur/);
 const glow=render('glow');assert.match(glow,/Effect intensity/);assert.doesNotMatch(glow,/Effect direction/);
});
