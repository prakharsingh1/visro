const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
let ShapeLibrary,GraphicsLibrary,React,renderToStaticMarkup;
const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
before(async()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
 React=await import('react');({renderToStaticMarkup}=await import('react-dom/server'));
 const output=await build({stdin:{contents:"export {ShapeLibrary} from './src/ShapeLibrary.tsx';export {GraphicsLibrary} from './src/GraphicsLibrary.tsx';",resolveDir:path.join(__dirname,'..')},bundle:true,platform:'node',format:'esm',external:['react','lucide-react'],loader:{'.css':'empty'},write:false});
 const temporary=path.join(__dirname,`element-browser-build-${process.pid}.mjs`);await fs.writeFile(temporary,output.outputFiles[0].text);
 try{({ShapeLibrary,GraphicsLibrary}=await import(pathToFileURL(temporary).href));}finally{await fs.unlink(temporary);}
});
after(()=>{if(storageDescriptor)Object.defineProperty(globalThis,'localStorage',storageDescriptor);else delete globalThis.localStorage;});
test('expanded libraries bound initial tile rendering and compact sections stay small',async()=>{
 const shapeCatalog=await import('../src/shapes.ts'),count=(html,label)=>(html.match(new RegExp(label,'g'))||[]).length;
 const many=shapeCatalog.searchShapes('a');assert.ok(many.length>40);
 const shapes=renderToStaticMarkup(React.createElement(ShapeLibrary,{query:'a',onInsert:()=>{}}));
 assert.equal(count(shapes,'aria-label="Add '),40,'a broad search mounts one40-tile page rather than the full catalog');
 assert.match(shapes,/aria-label="Next shapes page"/);assert.match(shapes,new RegExp(`${many.length} results`));
 const compactShapes=renderToStaticMarkup(React.createElement(ShapeLibrary,{compact:true,onInsert:()=>{}}));assert.equal(count(compactShapes,'aria-label="Add '),5);
 const graphics=renderToStaticMarkup(React.createElement(GraphicsLibrary,{onInsert:()=>{}}));
 assert.equal(count(graphics,'aria-label="Add '),24,'graphics mount one page while the full320 assets remain searchable');
 assert.match(graphics,/320 results/);assert.match(graphics,/3D illustrations/);assert.match(graphics,/aria-label="Next graphics page"/);
 const compactGraphics=renderToStaticMarkup(React.createElement(GraphicsLibrary,{compact:true,onInsert:()=>{}}));assert.equal(count(compactGraphics,'aria-label="Add '),6);
});
test('the Elements3D search produces editable artwork cards through the regular graphics path',()=>{
 const graphics=renderToStaticMarkup(React.createElement(GraphicsLibrary,{query:'3d',onInsert:()=>{}}));
 assert.match(graphics,/Three-face block/);assert.match(graphics,/Display podium/);
 assert.match(graphics,/aria-label="Add Floating phone graphic"/);assert.doesNotMatch(graphics,/<image|(?:href|src)="https?:\/\//);
});
