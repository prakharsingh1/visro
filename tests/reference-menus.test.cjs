const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {build}=require('esbuild');
let React,createRoot,window,document,ElementMenu,EditingModeMenu,elementMenuPosition,StrokeStyle,CornerRounding;
const mounted=new Set();
before(async()=>{
 const fabric=await import('fabric/node');({window,document}=fabric.getEnv());
 global.window=window;global.document=document;global.HTMLElement=window.HTMLElement;global.Node=window.Node;global.IS_REACT_ACT_ENVIRONMENT=true;
 React=require('react');({createRoot}=require('react-dom/client'));
 const result=await build({stdin:{contents:"export {ElementMenu,elementMenuPosition} from './ElementMenu';export {EditingModeMenu} from './EditingModeMenu';export {StrokeStyle,CornerRounding} from './StrokeStyle';",resolveDir:path.join(__dirname,'../src'),loader:'tsx'},bundle:true,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.css':'empty'},write:false});
 const filename=path.join(__dirname,'reference-menus-build.cjs'),module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(__dirname);module._compile(result.outputFiles[0].text,filename);
 ({ElementMenu,EditingModeMenu,elementMenuPosition,StrokeStyle,CornerRounding}=module.exports);
});
after(()=>{for(const item of mounted)React.act(()=>item.root.unmount());});
function mount(Component,props){const container=document.createElement('div');container.className='studio-app';document.body.append(container);const root=createRoot(container),item={root,container};mounted.add(item);React.act(()=>root.render(React.createElement(Component,props)));return{container,render:next=>React.act(()=>root.render(React.createElement(Component,next))),close:()=>{React.act(()=>root.unmount());container.remove();mounted.delete(item);}};}
function key(value,options={}){const event=new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...options});React.act(()=>document.activeElement.dispatchEvent(event));return event;}
function click(element){React.act(()=>element.click());}
function label(button){return button.querySelector('.menu-label')?.textContent||button.textContent;}
function buttons(menu){return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(button=>button.closest('[role="menu"]')===menu);}
const props=()=>({x:100,y:100,type:'shape',count:1,locked:false,onClose:()=>{},onAction:()=>{}});

test('element menus keep arrows and letter shortcuts away from the document and navigate each submenu independently',()=>{
 let leaked=0,closed=0,actions=[];const editor=()=>leaked++;window.addEventListener('keydown',editor);
 const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();const view=mount(ElementMenu,{...props(),onClose:()=>closed++,onAction:action=>actions.push(action)});
 try{
  const root=view.container.querySelector('[aria-label="Element options"]');assert.equal(label(document.activeElement),'Copy');
  assert.equal(key('ArrowDown').defaultPrevented,true);assert.equal(label(document.activeElement),'Copy style');
  key('l');assert.equal(label(document.activeElement),'Layer');key('ArrowRight');
  const layer=view.container.querySelector('[role="menu"][aria-label="Layer"]');assert.ok(layer);assert.equal(label(document.activeElement),'Bring to front');
  assert.deepEqual(buttons(layer).map(label),['Bring to front','Bring forward','Send backward','Send to back','Show layers']);
  key('End');assert.equal(label(document.activeElement),'Show layers');key('ArrowDown');assert.equal(label(document.activeElement),'Bring to front');
  key('ArrowLeft');assert.equal(layer.isConnected,false);assert.equal(label(document.activeElement),'Layer');
  key('ArrowDown');assert.equal(label(document.activeElement),'Align to page');key('ArrowRight');
  const align=view.container.querySelector('[role="menu"][aria-label="Align to page"]');assert.deepEqual(buttons(align).map(label),['Left','Center','Right','Top','Middle','Bottom']);assert.equal(label(document.activeElement),'Left');
  key('ArrowDown');key('Enter');assert.deepEqual(actions,['center']);assert.equal(closed,1);assert.equal(leaked,0);
  assert.equal(buttons(root).length,13,'No unsupported actions are inserted.');
 }finally{view.close();trigger.remove();window.removeEventListener('keydown',editor);}
});

test('Escape closes one menu level and restores the originating control without moving the selected object',()=>{
 const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();let closed=0,leaked=0;const listener=()=>leaked++;window.addEventListener('keydown',listener);
 const view=mount(ElementMenu,{...props(),onClose:()=>closed++});
 try{key('l');key('ArrowRight');key('Escape');assert.equal(closed,0);assert.equal(label(document.activeElement),'Layer');key('Escape');assert.equal(closed,1);assert.equal(document.activeElement,trigger);assert.equal(leaked,0);}finally{view.close();trigger.remove();window.removeEventListener('keydown',listener);}
});

test('image actions preserve the observed utility order and menu coordinates clamp on all viewport edges',()=>{
 const view=mount(ElementMenu,{...props(),type:'image'});
 try{const root=view.container.querySelector('[aria-label="Element options"]'),labels=buttons(root).map(label);assert.equal(labels.at(-1),'Set image as background');assert.equal(labels.includes('Crop'),false);assert.ok(labels.indexOf('Alternative text')<labels.indexOf('Set image as background'));}finally{view.close();}
 assert.deepEqual(elementMenuPosition(1400,850,272,520,1440,903),{left:1160,top:375});
 assert.deepEqual(elementMenuPosition(-50,-10,272,520,1280,903),{left:8,top:8});
 assert.deepEqual(elementMenuPosition(500,400,272,520,320,360),{left:40,top:8});
});

test('mode selection traps menu focus, invokes only the chosen mode, and Escape restores its trigger',()=>{
 const changes=[],view=mount(EditingModeMenu,{mode:'editing',onChange:mode=>changes.push(mode)});
 try{
  const trigger=view.container.querySelector('.editing-mode-trigger');click(trigger);
  assert.equal(document.activeElement.dataset.mode,'editing');key('End');assert.equal(document.activeElement.dataset.mode,'viewing');key('Tab');assert.equal(document.activeElement.dataset.mode,'editing');key('Tab',{shiftKey:true});assert.equal(document.activeElement.dataset.mode,'viewing');key('Enter');
  assert.deepEqual(changes,['viewing']);assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,trigger);
  click(trigger);key('ArrowDown');assert.equal(document.activeElement.dataset.mode,'commenting');key('Escape');assert.deepEqual(changes,['viewing']);assert.equal(document.activeElement,trigger);
 }finally{view.close();}
});


test('stroke controls send one usable native patch per action and isolate range arrows from editor shortcuts',()=>{
 let leaked=0,selection={id:'line',type:'line',locked:false,strokeOnly:true,stroke:'#112233',strokeWidth:4,strokeDashArray:null,strokeLineCap:'butt'},view;
 const updates=[],onUpdate=patch=>{updates.push(patch);selection={...selection,...patch};view.render({selected:selection,onUpdate});},listener=()=>leaked++;
 window.addEventListener('keydown',listener);view=mount(StrokeStyle,{selected:selection,onUpdate});
 try{
  click(view.container.querySelector('[aria-label="Stroke style"]'));
  let dialog=view.container.querySelector('[role="dialog"]');assert.ok(dialog);
  click(dialog.querySelector('[role="radio"][aria-label="Long dashes"]'));assert.equal(updates.length,1);assert.ok(updates[0].strokeDashArray[0]>updates[0].strokeDashArray[1]);assert.equal(selection.strokeWidth,4);assert.equal(selection.stroke,'#112233');
  click(dialog.querySelector('[role="switch"]'));assert.equal(selection.strokeLineCap,'round');assert.equal(updates.length,2);
  dialog.querySelector('input[type="range"]').focus();key('ArrowRight');assert.equal(leaked,0,'Range arrows must remain native control input without nudging the design.');key('Escape');assert.equal(view.container.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement.getAttribute('aria-label'),'Stroke style');
  view.render({selected:{...selection,locked:true},onUpdate});click(view.container.querySelector('button'));assert.equal(view.container.querySelector('[role="dialog"]'),null);assert.equal(updates.length,2);
 }finally{view.close();window.removeEventListener('keydown',listener);}
});

test('corner rounding appears only for a real rectangle/image, is disabled on locked objects, and uses displayed bounds',()=>{
 const changes=[],base={id:'shape',type:'path',shapeType:'star',isImage:false,width:80,height:40,cornerRadius:0,locked:false},view=mount(CornerRounding,{selected:base,onChange:value=>changes.push(value)});
 try{
  assert.equal(view.container.querySelector('button'),null);
  view.render({selected:{...base,type:'image',isImage:true,cornerRadius:8},onChange:value=>changes.push(value)});click(view.container.querySelector('button'));
  const range=view.container.querySelector('input[type="range"]'),number=view.container.querySelector('input[type="number"]');assert.equal(range.max,'20');assert.equal(number.value,'8');assert.equal(number.max,'20');
  key('Escape');view.render({selected:{...base,type:'rect',locked:true},onChange:value=>changes.push(value)});assert.equal(view.container.querySelector('button').disabled,true);assert.deepEqual(changes,[]);
 }finally{view.close();}
});
