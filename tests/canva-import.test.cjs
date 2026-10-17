const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
const JSZip=require('jszip');
let api,fabric,env;
before(async()=>{
  fabric=await import('fabric');env=(await import('fabric/node')).getEnv();fabric.setEnv(env);
  const result=await build({stdin:{contents:"export * from './src/canva-import'; export {StudioEditor} from './src/editor';",resolveDir:path.join(__dirname,'..'),loader:'ts'},bundle:true,platform:'node',format:'esm',external:['fabric','jszip'],write:false});
  const temporary=path.join(__dirname,`canva-import-build-${process.pid}.mjs`);await fs.writeFile(temporary,result.outputFiles[0].text);try{api=await import(pathToFileURL(temporary).href);}finally{await fs.unlink(temporary);}
});
const esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function xfrm(x,y,w,h,extra=''){return `<a:xfrm ${extra}><a:off x="${x*9525}" y="${y*9525}"/><a:ext cx="${w*9525}" cy="${h*9525}"/></a:xfrm>`;}
function shape(name,x,y,w,h,{fill='ee3355',preset='rect',rotation='',text='',font='Arial'}={}){return `<p:sp><p:nvSpPr><p:cNvPr id="1" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x,y,w,h,rotation)}<a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${fill?`<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`:'<a:noFill/>'}</p:spPr>${text?`<p:txBody><a:bodyPr lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr sz="1800" b="1"><a:solidFill><a:srgbClr val="112233"/></a:solidFill><a:latin typeface="${esc(font)}"/></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></p:txBody>`:''}</p:sp>`;}
function picture(){return `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Photo crop"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="photo"/><a:srcRect l="25000" r="25000" t="0" b="0"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(200,20,100,100,'rot="1800000" flipH="1"')}<a:prstGeom prst="rect"/></p:spPr></p:pic>`;}
async function pptx(slides,{image,extraFiles={}}={}){
  const zip=new JSZip(),ns='xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  zip.file('[Content_Types].xml','<Types/>');zip.file('ppt/presentation.xml',`<p:presentation ${ns}><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="s${i+1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${400*9525}" cy="${300*9525}"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels',`<Relationships>${slides.map((_,i)=>`<Relationship Id="s${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i+1}.xml"/>`).join('')}</Relationships>`);
  slides.forEach((content,i)=>{zip.file(`ppt/slides/slide${i+1}.xml`,`<p:sld ${ns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="faf5ec"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${content}</p:spTree></p:cSld></p:sld>`);if(image)zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`,'<Relationships><Relationship Id="photo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/photo.png"/></Relationships>');});
  if(image)zip.file('ppt/media/photo.png',image);for(const [name,value] of Object.entries(extraFiles))zip.file(name,value);
  return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
}
function count(objects){let result=0;for(const object of objects){if(object.type==='Group')result+=count(object.objects);else result++;}return result;}

test('Canva PowerPoint export imports native multi-page text, rich style, shape order and allows editing after reopening',async()=>{
  const data=await pptx([shape('Background block',10,20,80,50)+shape('Editable headline',100,40,250,70,{fill:'',text:'Original words'}),shape('Page two circle',20,30,60,60,{preset:'ellipse',fill:'44aaff'})]);
  const {project,report}=await api.parseCanvaPowerPoint(data,'Original export');
  assert.equal(project.pages.length,2);assert.equal(report.textLayers,1);assert.equal(report.vectorLayers,2);assert.equal(report.layers,3);assert.equal(project.pages[0].background,'#faf5ec');
  assert.equal(project.pages[0].canvas.objects[0].name,'Background block');assert.equal(project.pages[0].canvas.objects[1].name,'Editable headline');assert.equal(project.pages[0].canvas.objects[1].text,'Original words');assert.equal(project.pages[0].canvas.objects[1].fontWeight,'bold');assert.equal(project.pages[0].canvas.objects[1].fill,'#112233');
  const editor=new api.StudioEditor(env.document.createElement('canvas'));
  try{await editor.loadProject(project);const text=editor.canvas.getObjects()[1];assert.ok(text instanceof fabric.Textbox);editor.selectLayer(text.id);editor.updateSelected({text:'Changed locally'});assert.equal(editor.canvas.getObjects()[1].text,'Changed locally');await editor.undo();assert.equal(editor.canvas.getObjects()[1].text,'Original words');const stored=editor.serialize();await editor.loadProject(stored);assert.equal(editor.canvas.getObjects()[1].text,'Original words');assert.equal(editor.state.pages.length,2);await editor.setPage(project.pages[1].id);assert.ok(editor.canvas.getObjects()[0] instanceof fabric.Ellipse);}finally{editor.destroy();}
});

test('nested PowerPoint groups keep exported hierarchy, rotation, child coordinates and stacking through reload',async()=>{
  const group=`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Original grouped card"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm rot="5400000"><a:off x="${100*9525}" y="${50*9525}"/><a:ext cx="${200*9525}" cy="${100*9525}"/><a:chOff x="0" y="0"/><a:chExt cx="${100*9525}" cy="${50*9525}"/></a:xfrm></p:grpSpPr>${shape('Back',0,0,100,50)}${shape('Front',10,10,20,20,{fill:'22aa88'})}</p:grpSp>`;
  const {project,report}=await api.parseCanvaPowerPoint(await pptx([group]));assert.equal(report.groups,1);assert.equal(report.layers,2);assert.equal(project.pages[0].canvas.objects.length,1);assert.equal(project.pages[0].canvas.objects[0].type,'Group');assert.equal(project.pages[0].canvas.objects[0].name,'Original grouped card');
  const editor=new api.StudioEditor(env.document.createElement('canvas'));try{await editor.loadProject(project);const group=editor.canvas.getObjects()[0];assert.ok(group instanceof fabric.Group);const [back,front]=group.getObjects();assert.equal(back.name,'Back');assert.equal(front.name,'Front');const center=back.getCenterPoint();assert.ok(Math.abs(center.x-200)<.01);assert.ok(Math.abs(center.y-100)<.01);assert.ok(Math.abs(back.getTotalAngle()-90)<.01);const json=editor.serialize();await editor.loadProject(json);assert.equal(editor.canvas.getObjects()[0].getObjects().length,2);assert.equal(editor.canvas.getObjects()[0].visroName,'Original grouped card');assert.equal(editor.canvas.getObjects()[0].getObjects()[0].visroName,'Back');assert.equal(count(json.pages[0].canvas.objects),2);}finally{editor.destroy();}
});

test('PowerPoint embedded cropped image keeps pixels, native crop, flip and rotation without remote fetch',async()=>{
  const canvas=env.document.createElement('canvas');canvas.width=200;canvas.height=100;const context=canvas.getContext('2d');context.fillStyle='#ee0000';context.fillRect(0,0,100,100);context.fillStyle='#0000ee';context.fillRect(100,0,100,100);const image=Buffer.from(canvas.toDataURL().split(',')[1],'base64');
  const {project,report}=await api.parseCanvaPowerPoint(await pptx([picture()],{image}));assert.equal(report.imageLayers,1);const data=project.pages[0].canvas.objects[0];assert.equal(data.cropX,50);assert.equal(data.width,100);assert.equal(data.height,100);assert.equal(Boolean(data.flipX)!==Boolean(data.flipY),true,'the imported transform must retain the reflection');assert.match(data.src,/^data:image\/png;base64,/);
  const editor=new api.StudioEditor(env.document.createElement('canvas'));try{await editor.loadProject(project);const photo=editor.canvas.getObjects()[0];assert.ok(photo instanceof fabric.FabricImage);assert.equal(photo.cropX,50);const matrix=photo.calcTransformMatrix();assert.ok(matrix[0]*matrix[3]-matrix[1]*matrix[2]<0);assert.ok(Math.abs(photo.getCenterPoint().x-250)<.01);assert.ok(Math.abs(photo.getCenterPoint().y-70)<.01);editor.canvas.renderAll();const first=editor.canvas.toDataURL();assert.ok(first.length>1000);await editor.loadProject(editor.serialize());assert.equal(editor.canvas.toDataURL(),first);}finally{editor.destroy();}
});

test('unsupported PowerPoint layers and missing fonts are reported instead of silently flattening the slide',async()=>{
  const unsupported='<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr name="Revenue chart"/></p:nvGraphicFramePr></p:graphicFrame>';
  const {project,report}=await api.parseCanvaPowerPoint(await pptx([shape('Text',20,30,300,100,{text:'Editable',font:'Not Installed 123',fill:''})+unsupported]));assert.equal(project.pages[0].canvas.objects[0].type,'Textbox');assert.ok(report.issues.some(issue=>issue.kind==='font'&&issue.detail.includes('Not Installed 123')));assert.ok(report.issues.some(issue=>issue.kind==='unsupported'&&issue.detail.includes('Revenue chart')));assert.equal(report.imageLayers,0);
});

test('SVG import preserves exported nested vector groups, text and order as native editable layers',async()=>{
  const {project,report}=await api.parseCanvaSVG('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><g id="Card" transform="translate(50 40)"><rect width="180" height="120" fill="#ff3355"/><g id="Label"><text x="12" y="45" font-family="Arial" font-size="24">Editable SVG</text><circle cx="150" cy="80" r="12" fill="#0033ff"/></g></g></svg>','Original SVG');
  assert.equal(project.pages[0].canvas.objects.length,1);assert.equal(project.pages[0].canvas.objects[0].type,'Group');assert.equal(project.pages[0].canvas.objects[0].name,'Card');assert.equal(report.groups,2);assert.equal(report.textLayers,1);assert.equal(report.vectorLayers,2);
  const editor=new api.StudioEditor(env.document.createElement('canvas'));try{await editor.loadProject(project);const root=editor.canvas.getObjects()[0];assert.equal(root.getObjects()[0].fill,'#ff3355');const nested=root.getObjects()[1];assert.equal(nested.getObjects()[0].text,'Editable SVG');assert.ok(nested.getObjects()[0] instanceof fabric.Textbox,'SVG live text must support actual text editing');const bounds=root.getBoundingRect();assert.ok(Math.abs(bounds.left-50)<1);assert.ok(Math.abs(bounds.top-40)<1);const stored=editor.serialize();await editor.loadProject(stored);assert.equal(editor.canvas.getObjects()[0].getObjects()[1].getObjects()[0].text,'Editable SVG');}finally{editor.destroy();}
});

test('SVG import explicitly reports text outlined at export and rejects active, external or oversized input',async()=>{
  const {report}=await api.parseCanvaSVG('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0 L100 0 L100 100 Z" fill="red"/></svg>');assert.ok(report.issues.some(issue=>issue.detail.includes('no live text')));
  for(const body of ['<script>alert(1)</script>','<foreignObject/>','<image href="https://attacker.invalid/photo.png"/>','<rect onclick="alert(1)"/>','<style>@import "https://attacker.invalid/font.css";</style>'])await assert.rejects(api.parseCanvaSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`),/active|external|unsafe/i);
  await assert.rejects(api.parseCanvaSVG('<!DOCTYPE svg [<!ENTITY x "bad">]><svg/>'),/unsafe/);await assert.rejects(api.parseCanvaSVG('<svg width="9000" height="100"/>'),/dimensions/);
});

test('Canva import rejects private .canva files, cancellation, invalid/empty slide trees and archive traversal',async()=>{
  await assert.rejects(api.importCanvaExport(new File(['{}'],'design.canva')),/PowerPoint.*SVG/);
  const abort=new AbortController();abort.abort();await assert.rejects(api.importCanvaExport(new File([''],'design.pptx'),{signal:abort.signal}),{name:'AbortError'});
  await assert.rejects(api.parseCanvaPowerPoint(await pptx(['<p:graphicFrame/>'])),/no supported editable layers/);
  const unsafe=await pptx([shape('safe',0,0,50,50)],{extraFiles:{'../../unsafe.xml':'<bad/>'}});await assert.rejects(api.parseCanvaPowerPoint(unsafe),/unsafe archive paths/);
});

test('a real PowerPoint package written by PptxGenJS imports native editable rich text, gradient-free shapes and picture layers',async()=>{
  const {default:PptxGenJS}=await import('pptxgenjs');const pptx=new PptxGenJS();pptx.defineLayout({name:'ORIGINAL',width:8,height:6});pptx.layout='ORIGINAL';const slide=pptx.addSlide();slide.background={color:'112233'};
  slide.addShape(pptx.ShapeType.rect,{x:.3,y:.4,w:2,h:1,fill:{color:'ffcc33'},line:{color:'000000',width:1}});
  slide.addText([{text:'Hello ',options:{bold:true,color:'ff0000'}},{text:'layers',options:{italic:true,color:'00aa66'}}],{x:1,y:2,w:4,h:1,fontFace:'Arial',fontSize:24,margin:0});
  const source=env.document.createElement('canvas');source.width=200;source.height=100;source.getContext('2d').fillRect(0,0,200,100);slide.addImage({data:source.toDataURL(),x:5,y:1,w:2,h:1});
  const data=await pptx.write({outputType:'arraybuffer'});const {project,report}=await api.parseCanvaPowerPoint(data,'Written fixture');assert.equal(report.textLayers,1);assert.equal(report.vectorLayers,1);assert.equal(report.imageLayers,1);assert.equal(project.width,768);assert.equal(project.height,576);assert.equal(project.pages[0].background,'#112233');
  const editor=new api.StudioEditor(env.document.createElement('canvas'));try{await editor.loadProject(project);const [rect,text,image]=editor.canvas.getObjects();assert.ok(rect instanceof fabric.Rect);assert.ok(text instanceof fabric.Textbox);assert.ok(image instanceof fabric.FabricImage);assert.equal(text.text,'Hello layers');assert.equal(text.getSelectionStyles(0,1)[0].fontWeight,'bold');assert.equal(text.getSelectionStyles(6,7)[0].fontStyle,'italic');assert.equal(text.getSelectionStyles(6,7)[0].fontWeight,'normal');assert.equal(text.getSelectionStyles(6,7)[0].fill,'#00aa66');assert.ok(Math.abs(rect.getCenterPoint().x-124.8)<.01);assert.ok(Math.abs(rect.getCenterPoint().y-86.4)<.01);}finally{editor.destroy();}
});

test('horizontal and vertical exported lines remain visible native path layers rather than singular transforms',async()=>{
  const {project}=await api.parseCanvaPowerPoint(await pptx([shape('Horizontal',20,30,100,0,{preset:'line',fill:''}).replace('<a:noFill/>','<a:noFill/><a:ln w="19050"><a:solidFill><a:srgbClr val="ff0000"/></a:solidFill></a:ln>')+shape('Vertical',150,30,0,100,{preset:'line',fill:''}).replace('<a:noFill/>','<a:noFill/><a:ln w="19050"><a:solidFill><a:srgbClr val="0000ff"/></a:solidFill></a:ln>')]));assert.equal(project.pages[0].canvas.objects.length,2);const objects=await fabric.util.enlivenObjects(project.pages[0].canvas.objects);for(const object of objects){assert.ok(object instanceof fabric.Path);const matrix=object.calcTransformMatrix();assert.ok(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])>.01);assert.equal(object.strokeWidth,2);}
});

test('PowerPoint transparent outlines never hide opaque fills, and fill/stroke alpha survive pixels and reopen independently',async()=>{
  const {default:PptxGenJS}=await import('pptxgenjs');const pptx=new PptxGenJS();pptx.defineLayout({name:'ORIGINAL',width:8,height:6});pptx.layout='ORIGINAL';const slide=pptx.addSlide();
  slide.addShape(pptx.ShapeType.rect,{x:1,y:1,w:2,h:1,fill:{color:'FFCC33'},line:{color:'000000',transparency:100,width:4}});
  slide.addShape(pptx.ShapeType.rect,{x:4,y:1,w:2,h:1,fill:{color:'FF0000',transparency:50},line:{color:'0000FF',width:6}});
  const {project}=await api.parseCanvaPowerPoint(await pptx.write({outputType:'arraybuffer'}),'Independent paint alpha');
  assert.equal(project.pages[0].canvas.objects[0].opacity,1);assert.equal(project.pages[0].canvas.objects[0].fill,'#ffcc33');assert.equal(project.pages[0].canvas.objects[0].stroke,null);assert.equal(project.pages[0].canvas.objects[1].opacity,1);assert.equal(project.pages[0].canvas.objects[1].fill,'rgba(255,0,0,0.5)');assert.equal(project.pages[0].canvas.objects[1].stroke,'#0000ff');
  const surface=new fabric.StaticCanvas(env.document.createElement('canvas'),{width:768,height:576,enableRetinaScaling:false,renderOnAddRemove:false,backgroundColor:'#ffffff'});
  try{surface.add(...await fabric.util.enlivenObjects(project.pages[0].canvas.objects));surface.renderAll();const ctx=surface.getContext();assert.deepEqual(Array.from(ctx.getImageData(192,144,1,1).data),[255,204,51,255]);assert.deepEqual(Array.from(ctx.getImageData(480,144,1,1).data),[255,128,128,255]);assert.deepEqual(Array.from(ctx.getImageData(384,144,1,1).data),[0,0,255,255]);const before=surface.toDataURL();const serialized=surface.toObject(['id','visroName']);await surface.loadFromJSON(serialized);surface.renderAll();assert.equal(surface.toDataURL(),before);}finally{await surface.dispose();}
});
