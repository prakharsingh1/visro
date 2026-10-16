import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {SelectedObject,SelectionUpdate} from './editor-types';
import {StudioIcon} from './icons';
import './stroke-style.css';

export type StrokePattern='solid'|'long'|'short'|'dots';
type StrokeSelection=SelectedObject&{strokeDashArray?:number[]|null;strokeLineCap?:CanvasLineCap;cornerRadius?:number};
type StrokeUpdate=SelectionUpdate&{strokeDashArray?:number[]|null;strokeLineCap?:CanvasLineCap};
const PATTERNS:{id:StrokePattern;label:string}[]=[{id:'solid',label:'Solid'},{id:'long',label:'Long dashes'},{id:'short',label:'Short dashes'},{id:'dots',label:'Dots'}];

export function strokePatternFromDash(dash:readonly number[]|null|undefined):StrokePattern {
 if(!dash?.length)return'solid';
 const first=Number(dash[0]),gap=Number(dash[1]??dash[0]);
 if(first<=1.5||first<gap*.5)return'dots';
 return first>=gap*1.5?'long':'short';
}
export function dashForStroke(pattern:StrokePattern,width:number):number[]|null {
 const weight=Math.max(1,Math.min(100,Number.isFinite(width)?width:1));
 return pattern==='solid'?null:pattern==='long'?[weight*4,weight*2]:pattern==='short'?[weight*2,weight*2]:[1,Math.max(2,weight*2)];
}
function useStrokePopover(selectionId:string,disabled:boolean){
 const[open,setOpen]=useState(false),[position,setPosition]=useState({left:8,top:8}),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 useEffect(()=>{setOpen(false);},[selectionId,disabled]);
 useLayoutEffect(()=>{
  if(!open||!trigger.current||!popup.current)return;
  const anchor=trigger.current.getBoundingClientRect(),toolbar=trigger.current.closest('.context-toolbar')?.getBoundingClientRect(),bounds=popup.current.getBoundingClientRect();
  const next={left:Math.max(8,Math.min(anchor.left+anchor.width/2-bounds.width/2,window.innerWidth-bounds.width-8)),top:Math.max(8,Math.min((toolbar?.bottom??anchor.bottom)+4,window.innerHeight-bounds.height-8))};
  if(next.left!==position.left||next.top!==position.top)setPosition(next);
 });
 useEffect(()=>{
  if(!open)return;
  popup.current?.querySelector<HTMLElement>('button[aria-checked="true"],input,button')?.focus();
  const outside=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!popup.current?.contains(event.target as Node))setOpen(false);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setOpen(false);trigger.current?.focus();}};
  const reposition=()=>setOpen(false);
  window.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',key,true);window.addEventListener('resize',reposition);
  return()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',reposition);};
 },[open]);
 return{open,setOpen,position,trigger,popup,portal:trigger.current?.closest('.studio-app')??document.body};
}
function NumericRange({label,value,min=0,max=100,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(value:number)=>void}){
 const[draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
 const bounded=(number:number)=>Math.max(min,Math.min(max,number));
 return <label className="stroke-range"><span>{label}</span><div><input type="range" aria-label={label} min={min} max={max} step={1} value={value} onChange={event=>onChange(Number(event.target.value))}/><input type="number" aria-label={`${label} value`} min={min} max={max} step={1} value={draft} onChange={event=>{setDraft(event.target.value);const number=Number(event.target.value);if(event.target.value.trim()&&Number.isFinite(number))onChange(bounded(number));}} onBlur={()=>{const number=Number(draft),next=Number.isFinite(number)&&draft.trim()?bounded(number):value;setDraft(String(next));if(next!==value)onChange(next);}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/></div></label>;
}
function StrokePopup({children,popup,position,label}:{children:React.ReactNode;popup:RefObject<HTMLDivElement|null>;position:{left:number;top:number};label:string}){
 return <div ref={popup} role="dialog" aria-label={label} className="stroke-popover" style={position} onKeyDown={event=>event.stopPropagation()}>{children}</div>;
}

export function StrokeStyle({selected,onUpdate,disabled=false}:{selected:StrokeSelection;onUpdate:(update:StrokeUpdate)=>void;disabled?:boolean}){
 const unavailable=disabled||selected.locked,state=useStrokePopover(selected.id,unavailable),pattern=strokePatternFromDash(selected.strokeDashArray),weight=Math.max(0,Math.min(100,selected.strokeWidth||0));
 const choose=(next:StrokePattern)=>{const width=weight||2;onUpdate({strokeDashArray:dashForStroke(next,width),strokeWidth:width,stroke:!selected.stroke||selected.stroke==='transparent'?'#000000':selected.stroke});};
 const changeWeight=(value:number)=>onUpdate({strokeWidth:value,strokeDashArray:dashForStroke(pattern,value),stroke:!selected.stroke||selected.stroke==='transparent'?'#000000':selected.stroke});
 return <><button ref={state.trigger} className="icon-button stroke-style-trigger" title="Stroke style" aria-label="Stroke style" aria-haspopup="dialog" aria-expanded={state.open} disabled={unavailable} onClick={()=>state.setOpen(open=>!open)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();state.setOpen(true);}}}><StudioIcon name="stroke-style" size={24}/></button>
 {state.open&&createPortal(<StrokePopup popup={state.popup} position={state.position} label="Stroke style"><div className="stroke-patterns" role="radiogroup" aria-label="Stroke pattern">{PATTERNS.map(item=><button key={item.id} role="radio" aria-label={item.label} aria-checked={pattern===item.id} tabIndex={pattern===item.id?0:-1} onClick={()=>choose(item.id)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const index=PATTERNS.findIndex(entry=>entry.id===item.id),next=PATTERNS[(index+(['ArrowLeft','ArrowUp'].includes(event.key)?3:1))%4];choose(next.id);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[aria-label="${next.label}"]`)?.focus();}}><svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true"><path d="M4 10h24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={item.id==='solid'?undefined:item.id==='long'?'10 5':item.id==='short'?'5 4':'1 3'}/></svg></button>)}</div>
 {(selected.strokeOnly||selected.type==='line')&&<label className="stroke-rounded"><span>Rounded end points</span><input type="checkbox" role="switch" aria-label="Rounded end points" checked={selected.strokeLineCap==='round'} onChange={event=>onUpdate({strokeLineCap:event.target.checked?'round':'butt'})}/></label>}
 <NumericRange label="Stroke weight" value={weight} onChange={changeWeight}/></StrokePopup>,state.portal)}</>;
}

export function CornerRounding({selected,onChange,disabled=false}:{selected:StrokeSelection;onChange:(radius:number)=>void;disabled?:boolean}){
 const unavailable=disabled||selected.locked,supported=selected.isImage||selected.type==='rect',state=useStrokePopover(selected.id,unavailable||!supported);
 if(!supported)return null;
 const max=Math.max(0,Math.floor(Math.min(selected.width,selected.height)/2)),radius=Math.max(0,Math.min(max,selected.cornerRadius||0));
 return <><button ref={state.trigger} className="icon-button corner-rounding-trigger" aria-label="Corner rounding" title="Corner rounding" aria-haspopup="dialog" aria-expanded={state.open} disabled={unavailable} onClick={()=>state.setOpen(open=>!open)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();state.setOpen(true);}}}><StudioIcon name="corners" size={24}/></button>{state.open&&createPortal(<StrokePopup popup={state.popup} position={state.position} label="Corner rounding"><NumericRange label="Corner rounding" value={radius} max={max} onChange={onChange}/></StrokePopup>,state.portal)}</>;
}
