import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react';
import type {StudioEditor} from './editor';
import type {PageMetadata} from './editor-types';

type Guides = NonNullable<PageMetadata['guides']>;
type Screen = {width:number;height:number;zoom:number;left:number;top:number};
const EMPTY:Guides={x:[],y:[]};

/** View furniture stays outside Fabric so it cannot enter an image or export. */
export function CanvasGuides({getEditor,ready,pageId,rulers,margins,locked,guides=EMPTY,onChange}:{
  getEditor:()=>StudioEditor|null;ready:boolean;rulers:boolean;margins:boolean;locked:boolean;
  pageId:string;guides?:Guides;onChange:(guides:Guides)=>void;
}) {
  const [screen,setScreen]=useState<Screen>({width:800,height:700,zoom:.5,left:0,top:0});
  const [drag,setDrag]=useState<{axis:'x'|'y';index:number;value:number}|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const cancelDrag=useRef<()=>void>(()=>{});
  const studio=getEditor();
  const width=studio?.width||1080,height=studio?.height||1080;
  useEffect(()=>{
    const editor=getEditor();if(!ready||!editor)return;
    const update=(event?:{ctx:CanvasRenderingContext2D})=>{
      if(event&&event.ctx.canvas!==editor.canvas.lowerCanvasEl)return;
      const [zoom,,, ,left,top]=editor.canvas.viewportTransform;
      const next={width:editor.canvas.width,height:editor.canvas.height,zoom,left,top};
      setScreen(previous=>Object.keys(next).every(key=>next[key as keyof Screen]===previous[key as keyof Screen])?previous:next);
    };
    update();const off=editor.canvas.on('after:render',update);return()=>{off();};
  },[getEditor,ready]);
  useEffect(()=>{getEditor()?.setAlignmentGuides(rulers?guides:EMPTY);},[getEditor,guides,rulers,ready]);
  useEffect(()=>()=>cancelDrag.current(),[ready,rulers,locked,pageId]);
  const begin=(e:ReactPointerEvent,axis:'x'|'y',index=-1)=>{
    if(locked||e.button!==0)return;e.preventDefault();e.stopPropagation();
    const box=root.current!.getBoundingClientRect();
    const position=(event:PointerEvent|ReactPointerEvent)=>Math.round(((axis==='x'?event.clientX-box.left:event.clientY-box.top)-(axis==='x'?screen.left:screen.top))/screen.zoom);
    setDrag({axis,index,value:position(e)});
    const move=(event:PointerEvent)=>setDrag({axis,index,value:position(event)});
    const stop=(event:PointerEvent)=>{
      cleanup();setDrag(null);
      if(getEditor()?.getState().activePageId!==pageId)return;
      const value=position(event),limit=axis==='x'?width:height;
      const inside=event.clientX>=box.left+20&&event.clientX<=box.right&&event.clientY>=box.top+20&&event.clientY<=box.bottom;
      const next={x:[...guides.x],y:[...guides.y]};
      if(index>=0)next[axis].splice(index,1);
      if(inside&&value>=0&&value<=limit&&next[axis].length<100)next[axis].push(value);
      onChange(next);
    };
    const cancel=()=>{cleanup();setDrag(null);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel();}};
    const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape);cancelDrag.current=()=>{};};
    cancelDrag.current=cancel;
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);
  };
  const step=10**Math.floor(Math.log10(70/screen.zoom));
  const interval=[1,2,5,10].map(n=>n*step).find(n=>n*screen.zoom>=55)||step*10;
  const ticks=(axis:'x'|'y')=>{
    const offset=axis==='x'?screen.left:screen.top,extent=axis==='x'?screen.width:screen.height;
    const first=Math.ceil((20-offset)/screen.zoom/interval)*interval;
    return Array.from({length:Math.max(0,Math.min(200,Math.ceil(extent/screen.zoom/interval)+1))},(_,i)=>first+i*interval).filter(value=>value*screen.zoom+offset<extent).map(value=><span key={value} style={axis==='x'?{left:value*screen.zoom+offset}:{top:value*screen.zoom+offset}}>{value}</span>);
  };
  const shown:Guides={x:[...guides.x],y:[...guides.y]};
  if(drag){if(drag.index>=0)shown[drag.axis][drag.index]=drag.value;else shown[drag.axis].push(drag.value);}
  return <div ref={root} className="canvas-guides" aria-label="Design guides">
    {margins&&<div className="canvas-margin" aria-label="Safe margin" style={{left:screen.left+width*.05*screen.zoom,top:screen.top+height*.05*screen.zoom,width:width*.9*screen.zoom,height:height*.9*screen.zoom}}/>}
    {rulers&&<>
      <div className="canvas-ruler ruler-horizontal" title="Drag down to add a horizontal guide" onPointerDown={e=>begin(e,'y')}>{ticks('x')}</div>
      <div className="canvas-ruler ruler-vertical" title="Drag right to add a vertical guide" onPointerDown={e=>begin(e,'x')}>{ticks('y')}</div>
      <span className="ruler-corner"/>
      {(['x','y'] as const).flatMap(axis=>shown[axis].map((value,index)=><button key={`${axis}-${index}`} className={`canvas-guide guide-${axis} ${locked?'locked':''}`} style={axis==='x'?{left:screen.left+value*screen.zoom}:{top:screen.top+value*screen.zoom}} aria-label={`${axis==='x'?'Vertical':'Horizontal'} guide ${value} px`} title={locked?'Guide locked':`${value} px · Drag outside to remove · Delete to remove`} tabIndex={locked?-1:0} onPointerDown={e=>begin(e,axis,index<guides[axis].length?index:-1)} onKeyDown={e=>{
        if(e.key.startsWith('Arrow'))e.stopPropagation();
        if(locked)return;
        if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();onChange({...guides,[axis]:guides[axis].filter((_,i)=>i!==index)});}
        else if((axis==='x'&&['ArrowLeft','ArrowRight'].includes(e.key))||(axis==='y'&&['ArrowUp','ArrowDown'].includes(e.key))){e.preventDefault();e.stopPropagation();const step=(e.shiftKey?10:1)*(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);onChange({...guides,[axis]:guides[axis].map((v,i)=>i===index?Math.max(0,Math.min(axis==='x'?width:height,v+step)):v)});}
      }}/>))}
    </>}
  </div>;
}
