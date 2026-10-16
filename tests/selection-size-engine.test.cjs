const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');

let StudioEditor,environment;
before(async()=>{
  const fabric=await import('fabric');environment=(await import('fabric/node')).getEnv();fabric.setEnv(environment);
  const output=await build({entryPoints:[path.join(__dirname,'../src/editor.ts')],bundle:true,platform:'node',format:'esm',external:['fabric'],write:false});
  const temporary=path.join(__dirname,`selection-size-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);
  try{({StudioEditor}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
const near=(actual,expected,message,tolerance=.00001)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: ${actual} ≈ ${expected}`);
const geometry=object=>({left:object.left,top:object.top,width:object.getScaledWidth(),height:object.getScaledHeight()});
function setup(kind,uniform=false){
  const studio=new StudioEditor(environment.document.createElement('canvas'),{width:800,height:600});
  studio.addShape(kind);const object=studio.canvas.getActiveObject();object.set({strokeUniform:uniform,scaleX:1.7,scaleY:.8});
  studio.updateSelected({stroke:'#123456',strokeWidth:8});
  return{studio,object,id:object.id};
}

for(const [name,kind,uniform] of [['ordinary stroked rectangle','rect',false],['uniform-stroke rectangle','rect',true],['zero-height round-cap line','line',false]]){
  test(`Position dimensions match painted 500×300 bounds for a ${name} and restore with one Undo`,async()=>{
    const {studio,object,id}=setup(kind,uniform);
    try{
      if(kind==='line')assert.equal(object.height,0,'the regression must exercise a truly zero-height line');
      const before=geometry(object);
      studio.updateSelected({width:500,height:300});
      near(object.getScaledWidth(),500,'painted width');near(object.getScaledHeight(),300,'painted height');
      near(object.left,before.left,'left anchor');near(object.top,before.top,'top anchor');
      assert.ok(Number.isFinite(object.scaleX)&&Number.isFinite(object.scaleY),'zero-size geometry cannot create infinite scaling');
      near(studio.selected.width,500,'Position width reports the same visible size');near(studio.selected.height,300,'Position height reports the same visible size');
      await studio.undo();const restored=studio.canvas.getObjects().find(object=>object.id===id);
      // Fabric rounds serialized scales to four decimals; restored paint may
      // differ by a few thousandths of a pixel while the requested edit is exact.
      const result=geometry(restored);for(const key of Object.keys(before))near(result[key],before[key],`one Undo restores ${key}`,.01);
      await studio.redo();const redone=studio.canvas.getObjects().find(object=>object.id===id);near(redone.getScaledWidth(),500,'Redo width',.01);near(redone.getScaledHeight(),300,'Redo height',.01);
    }finally{studio.destroy();}
  });
}

test('proportional Position dimensions preserve painted ratio and subsequent arrow nudges preserve size',async()=>{
  const {studio,object,id}=setup('rect',true);
  try{
    const before=geometry(object),factor=1.375;
    studio.updateSelected({width:before.width*factor,height:before.height*factor});
    const resized=geometry(object);near(resized.width/resized.height,before.width/before.height,'aspect ratio');near(resized.width,before.width*factor,'proportional width');near(resized.height,before.height*factor,'proportional height');
    studio.nudge(7,-4);studio.flushPendingChanges();
    const moved=geometry(object);near(moved.left,resized.left+7,'nudge X');near(moved.top,resized.top-4,'nudge Y');near(moved.width,resized.width,'nudge width');near(moved.height,resized.height,'nudge height');
    await studio.undo();const restored=geometry(studio.canvas.getObjects().find(object=>object.id===id));for(const key of Object.keys(resized))near(restored[key],resized[key],`nudge Undo preserves resized ${key}`,.01);
  }finally{studio.destroy();}
});

test('outlined text width includes its stroke while preserving text and font size',async()=>{
  const studio=new StudioEditor(environment.document.createElement('canvas'),{width:800,height:600});
  try{
    studio.addText('heading');studio.updateSelected({text:'A useful sentence that wraps onto several lines.',stroke:'#123456',strokeWidth:4});
    const object=studio.canvas.getActiveObject(),id=object.id,before=geometry(object),text=object.text,fontSize=object.fontSize;
    studio.updateSelected({width:500});near(object.getScaledWidth(),500,'outlined text painted width');assert.equal(object.text,text);assert.equal(object.fontSize,fontSize);
    await studio.undo();const restored=studio.canvas.getObjects().find(object=>object.id===id);near(restored.getScaledWidth(),before.width,'one Undo restores text width');assert.equal(restored.text,text);assert.equal(restored.fontSize,fontSize);
  }finally{studio.destroy();}
});
