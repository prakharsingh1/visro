const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let fabric,environment,render;
before(async()=>{
 fabric=await import('fabric');const node=await import('fabric/node');environment=node.getEnv();fabric.setEnv(environment);
 const result=await build({entryPoints:[path.join(__dirname,'../src/design-thumbnails.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
 const file=path.join(__dirname,`thumbnail-render-build-${process.pid}.mjs`);await fs.writeFile(file,result.outputFiles[0].text);
 try{({renderProjectThumbnail:render}=await import(pathToFileURL(file).href));}finally{await fs.unlink(file);}
});
async function pixels(data){const image=await fabric.FabricImage.fromURL(data),element=image.getElement(),canvas=environment.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(element,0,0);return{width:canvas.width,height:canvas.height,pixel:(x,y)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data],all:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data};}

test('a saved template paints real art at a bounded cover size without touching an independent live canvas',async()=>{
 const project=JSON.parse(await fs.readFile(path.join(__dirname,'project-restored-design.fixture.json'),'utf8')),original=structuredClone(project);
 const live=new fabric.Canvas(environment.document.createElement('canvas'),{width:657,height:341,enableRetinaScaling:false});
 try{
  const selection=new fabric.Rect({left:64.5,top:45.25,width:92,height:71,fill:'#ff00aa'});live.add(selection);live.setActiveObject(selection);live.setViewportTransform([.61,0,0,.61,78.25,32.75]);
  const before={width:live.width,height:live.height,viewport:[...live.viewportTransform],json:live.toJSON(),selected:live.getActiveObject()},domCanvases=environment.document.querySelectorAll('canvas').length;
  const output=await render(project);assert.match(output,/^data:image\/png;base64,/);
  const image=await pixels(output);assert.equal(image.width,480);assert.equal(image.height,480);
  const background=image.pixel(0,0);let different=0;for(let i=0;i<image.all.length;i+=4)if(Math.abs(image.all[i]-background[0])+Math.abs(image.all[i+1]-background[1])+Math.abs(image.all[i+2]-background[2])>45)different++;
  assert.ok(different>15000,'real text and shapes should paint, rather than only the paper color');
  assert.equal(live.width,before.width);assert.equal(live.height,before.height);assert.deepEqual(live.viewportTransform,before.viewport);assert.deepEqual(live.toJSON(),before.json);assert.equal(live.getActiveObject(),before.selected);assert.equal(environment.document.querySelectorAll('canvas').length,domCanvases);assert.deepEqual(project,original);
 }finally{await live.dispose();}
});

test('the cover uses the first page and preserves clipped photo crop, nested objects and background gradient',async()=>{
 const source=environment.document.createElement('canvas');source.width=100;source.height=100;const context=source.getContext('2d');context.fillStyle='#ff0044';context.fillRect(0,0,50,100);context.fillStyle='#0033ff';context.fillRect(50,0,50,100);
 const image=new fabric.FabricImage(source,{originX:'left',originY:'top',left:110,top:50,cropX:50,cropY:0,width:50,height:100,scaleX:1.6,scaleY:.8,clipPath:new fabric.Circle({radius:25,scaleY:2,originX:'center',originY:'center'})});
 const group=new fabric.Group([new fabric.Rect({left:0,top:0,width:70,height:30,fill:'#00cc55'}),new fabric.Textbox('Cover art',{left:0,top:35,width:100,fontSize:16,fill:'#111111'})],{originX:'left',originY:'top',left:220,top:80});
 const project={version:1,name:'Photo crop',width:400,height:240,pages:[{id:'cover',name:'Cover',background:'#ffffff',backgroundGradient:{colors:['#ff0000','#ffffff'],angle:0},canvas:{objects:[image.toObject(),group.toObject()]}},{id:'later',name:'Active later page',background:'#00ff00',canvas:{objects:[]}}],activePageId:'later',brand:{colors:[],fonts:[]}};
 const original=structuredClone(project),output=await pixels(await render(project));
 assert.deepEqual(output.pixel(150,90),[0,51,255,255],'the center must use the blue source crop');
 assert.notDeepEqual(output.pixel(110,50),[0,51,255,255],'the circular frame clips its photo corner');
 assert.ok(output.pixel(5,5)[1]<10&&output.pixel(395,5)[1]>245,'the first-page red-to-white gradient must remain visible');
 assert.deepEqual(project,original);
});

test('aborted thumbnail work rejects without altering the saved project',async()=>{
 const project=JSON.parse(await fs.readFile(path.join(__dirname,'project-restored-design.fixture.json'),'utf8')),original=structuredClone(project),controller=new AbortController();controller.abort();
 await assert.rejects(render(project,controller.signal),error=>error.name==='AbortError');assert.deepEqual(project,original);
});
