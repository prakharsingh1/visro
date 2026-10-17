const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {build}=require('esbuild');
let React,createRoot,window,document,CanvaImportDialog;
const mounted=new Set();
before(async()=>{
 const fabric=await import('fabric/node');({window,document}=fabric.getEnv());
 global.window=window;global.document=document;global.HTMLElement=window.HTMLElement;global.Node=window.Node;global.IS_REACT_ACT_ENVIRONMENT=true;
 React=require('react');({createRoot}=require('react-dom/client'));
 const result=await build({stdin:{contents:"export {CanvaImportDialog} from './CanvaImportDialog';",resolveDir:path.join(__dirname,'../src'),loader:'tsx'},bundle:true,platform:'node',format:'cjs',external:['react','react-dom'],write:false});
 const filename=path.join(__dirname,'canva-import-dialog-build.cjs'),module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(__dirname);module._compile(result.outputFiles[0].text,filename);({CanvaImportDialog}=module.exports);
});
after(()=>{for(const item of mounted)React.act(()=>item.root.unmount());});
function mount(props){const container=document.createElement('div');document.body.append(container);const root=createRoot(container),item={root,container};mounted.add(item);React.act(()=>root.render(React.createElement(CanvaImportDialog,props)));return{container,render:next=>React.act(()=>root.render(React.createElement(CanvaImportDialog,next))),close:()=>{React.act(()=>root.unmount());container.remove();mounted.delete(item);}};}
function key(value,options={}){const event=new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...options});React.act(()=>document.activeElement.dispatchEvent(event));return event;}
function click(element){React.act(()=>element.click());}
function clipboardPaste(text,target=document.activeElement){
 // JSDOM has no OS clipboard. Dispatch a cancelable paste event carrying a
 // readable text/plain clipboard payload, as the real App listener consumes.
 const event=new window.Event('paste',{bubbles:true,cancelable:true});
 Object.defineProperty(event,'clipboardData',{value:{types:['text/plain'],items:[],files:[],getData:type=>type==='text/plain'?text:''}});
 React.act(()=>target.dispatchEvent(event));return event;
}
const emptyReport=()=>({format:'pptx',pages:2,layers:4,textLayers:2,imageLayers:1,vectorLayers:1,groups:1,fonts:['Arial'],issues:[{page:2,kind:'unsupported',detail:'Original chart layer was skipped.'}]});
function trigger(){const button=document.createElement('button');button.textContent='Import trigger';document.body.append(button);button.focus();return button;}

test('Canva import dialog isolates letter, arrow and command shortcuts from underlying document handlers',()=>{
 const origin=trigger(),events=[],listener=event=>events.push(event.key);document.addEventListener('keydown',listener);window.addEventListener('keydown',listener);
 const view=mount({report:null,onClose:()=>{},onChoose:()=>{}});
 try{assert.equal(document.activeElement.getAttribute('aria-label'),'Close Canva import');for(const letter of ['t','r','c','l'])key(letter);for(const arrow of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])key(arrow);key('a',{metaKey:true});key('d',{ctrlKey:true});assert.deepEqual(events,[]);view.close();key('t');assert.deepEqual(events,['t','t'],'Dialog cleanup must restore normal document keyboard handling.');}finally{if(view.container.isConnected)view.close();origin.remove();document.removeEventListener('keydown',listener);window.removeEventListener('keydown',listener);}
});

test('clipboard text cannot paste behind the import dialog and normal pasting resumes after unmount',()=>{
 const origin=trigger(),texts=[],listener=event=>texts.push(event.clipboardData.getData('text/plain'));document.addEventListener('paste',listener);window.addEventListener('paste',listener);
 const view=mount({report:null,onClose:()=>{},onChoose:()=>{}});
 try{const blocked=clipboardPaste('Do not add this as a text layer.');assert.equal(blocked.defaultPrevented,true);assert.deepEqual(texts,[]);view.close();const normal=clipboardPaste('Allowed after closing.',origin);assert.equal(normal.defaultPrevented,false);assert.deepEqual(texts,['Allowed after closing.','Allowed after closing.']);}finally{if(view.container.isConnected)view.close();origin.remove();document.removeEventListener('paste',listener);window.removeEventListener('paste',listener);}
});

test('Tab and Shift+Tab wrap within the import dialog without leaking focus or editor shortcuts',()=>{
 const origin=trigger(),leaked=[],listener=event=>leaked.push(event.key);window.addEventListener('keydown',listener);const view=mount({report:null,onClose:()=>{},onChoose:()=>{}});
 try{const buttons=Array.from(view.container.querySelectorAll('button'));assert.equal(buttons.length,2);assert.equal(document.activeElement,buttons[0]);const reverse=key('Tab',{shiftKey:true});assert.equal(reverse.defaultPrevented,true);assert.equal(document.activeElement,buttons[1]);const forward=key('Tab');assert.equal(forward.defaultPrevented,true);assert.equal(document.activeElement,buttons[0]);assert.deepEqual(leaked,[]);}finally{view.close();assert.equal(document.activeElement,origin);origin.remove();window.removeEventListener('keydown',listener);}
});

test('Escape calls the current close callback and removing the controlled dialog restores its originating focus',()=>{
 const origin=trigger();let oldClosed=0,currentClosed=0;const view=mount({report:null,onClose:()=>oldClosed++,onChoose:()=>{}});
 try{view.render({report:null,onClose:()=>currentClosed++,onChoose:()=>{}});const event=key('Escape');assert.equal(event.defaultPrevented,true);assert.equal(oldClosed,0);assert.equal(currentClosed,1);view.close();assert.equal(document.activeElement,origin);assert.equal(document.querySelector('[aria-labelledby="canva-import-title"]'),null);}finally{if(view.container.isConnected)view.close();origin.remove();}
});

test('Choose file and Start editing retain native button callbacks while import notes remain plain text',()=>{
 const origin=trigger();let chosen=0,closed=0;const view=mount({report:null,onClose:()=>closed++,onChoose:()=>chosen++});
 try{const dialog=view.container.querySelector('[role="dialog"]');assert.equal(dialog.getAttribute('aria-modal'),'true');assert.equal(dialog.getAttribute('aria-labelledby'),'canva-import-title');click(Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Choose PPTX or SVG'));assert.equal(chosen,1);assert.equal(closed,0);
  const report=emptyReport();report.issues.push({page:1,kind:'source',detail:'<img src=x onerror="run()"> is text, not markup.'});view.render({report,onClose:()=>closed++,onChoose:()=>chosen++});assert.equal(view.container.querySelector('h2').textContent,'Your design is ready to edit');assert.match(view.container.textContent,/2 pages · 2 text · 1 images · 1 vectors · 1 groups/);assert.match(view.container.textContent,/Page 2: Original chart layer was skipped/);assert.equal(view.container.querySelector('.canva-import-notes img'),null);const buttons=Array.from(view.container.querySelectorAll('button'));click(buttons.find(button=>button.textContent==='Start editing'));assert.equal(closed,1);assert.equal(chosen,1);click(buttons.find(button=>button.getAttribute('aria-label')==='Close Canva import'));assert.equal(closed,2);
 }finally{view.close();assert.equal(document.activeElement,origin);origin.remove();}
});

test('clicking inside the import dialog keeps it open while clicking the backdrop closes it',()=>{
 let closed=0;const view=mount({report:null,onClose:()=>closed++,onChoose:()=>{}});
 try{React.act(()=>view.container.querySelector('section').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true})));assert.equal(closed,0);React.act(()=>view.container.querySelector('.modal-backdrop').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true})));assert.equal(closed,1);}finally{view.close();}
});
