import {useEffect,useId,useRef,useState} from 'react';
import {StudioIcon,type StudioIconName} from './icons';

export type EditingMode='editing'|'commenting'|'viewing';
const MODES:{id:EditingMode;label:string;description:string;icon:StudioIconName}[]=[
 {id:'editing',label:'Editing',description:'Make changes',icon:'edit'},
 {id:'commenting',label:'Commenting',description:'Add feedback',icon:'comments'},
 {id:'viewing',label:'Viewing',description:'Read-only',icon:'eye'},
];

/** The host owns actual editing permissions; this component only selects mode. */
export function EditingModeMenu({mode,onChange,disabled=false}:{mode:EditingMode;onChange:(mode:EditingMode)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),id=useId();
 const current=MODES.find(item=>item.id===mode)??MODES[0],callbacks=useRef({onChange,mode});callbacks.current={onChange,mode};
 useEffect(()=>{
  if(!open)return;
  const buttons=()=>Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')||[]);
  buttons().find(button=>button.dataset.mode===callbacks.current.mode)?.focus();
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const pointer=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const key=(event:KeyboardEvent)=>{
   if(event.metaKey||event.ctrlKey||event.altKey)return;
   const items=buttons(),index=items.indexOf(document.activeElement as HTMLButtonElement);
   const consume=()=>{event.preventDefault();event.stopImmediatePropagation();};
   if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Tab'){consume();const direction=event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey?-1:1;items[(index+direction+items.length)%items.length]?.focus();}
   else if(event.key==='Home'||event.key==='End'){consume();items[event.key==='Home'?0:items.length-1]?.focus();}
   else if(event.key==='Escape'){consume();close();}
   else if(event.key==='Enter'||event.key===' '){consume();items[index]?.click();}
   else if(event.key.length===1){consume();items.find(button=>button.dataset.mode?.startsWith(event.key.toLowerCase()))?.focus();}
  };
  window.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',key,true);};
 },[open]);
 return <div className="editing-mode-control" ref={root}>
  <button ref={trigger} className="editing-mode-trigger" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();setOpen(true);}}}><StudioIcon name={current.icon} size={24}/><span>{current.label}</span><StudioIcon className="editing-mode-chevron" name="chevron" size={16}/></button>
  {open&&<div ref={menu} id={id} role="menu" aria-label="Editing mode" className="editing-mode-menu">{MODES.map(item=><button key={item.id} type="button" role="menuitemradio" aria-checked={mode===item.id} data-mode={item.id} tabIndex={-1} onClick={()=>{callbacks.current.onChange(item.id);setOpen(false);trigger.current?.focus();}}><StudioIcon name={item.icon} size={24}/><span><strong>{item.label}</strong><small>{item.description}</small></span>{mode===item.id&&<StudioIcon className="editing-mode-check" name="check" size={24}/>}</button>)}</div>}
 </div>;
}
