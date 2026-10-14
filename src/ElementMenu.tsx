import {useEffect,useRef,useState} from "react";
import {Copy,Clipboard,Trash2,Layers,AlignCenter,MessageCircle,Lock,Link,Clock,Type,Sparkles,Component,PaintRoller,Scissors} from "lucide-react";
export type ElementAction='copy'|'copy-style'|'paste-style'|'paste'|'duplicate'|'delete'|'front'|'back'|'up'|'down'|'top'|'left'|'middle'|'center'|'bottom'|'right'|'component'|'comment'|'lock'|'unlock'|'link'|'timing'|'alt'|'write'|'translate'|'group'|'ungroup'|'background'|'crop'|'show-layers';
export function ElementMenu({x,y,type,count,locked,onAction,onClose}:{x:number;y:number;type?:string;count:number;locked:boolean;onAction:(action:ElementAction)=>void;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null),[submenu,setSubmenu]=useState<string|null>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))onClose();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const buttons=Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button')||[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);ref.current?.querySelector('button')?.focus();return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};},[onClose]);
 const run=(a:ElementAction)=>{onClose();onAction(a);};
 const row=(a:ElementAction,label:string,Icon:typeof Copy,key?:string)=><button role="menuitem" key={a} onClick={()=>run(a)}><Icon size={19}/><span>{label}</span>{key&&<kbd>{key}</kbd>}</button>;
 const sub=(name:string,label:string,Icon:typeof Copy,items:[ElementAction,string,string?][])=> <div className="context-submenu" onMouseEnter={()=>setSubmenu(name)} onMouseLeave={()=>setSubmenu(null)}><button role="menuitem" aria-haspopup="menu" aria-expanded={submenu===name} onClick={()=>setSubmenu(submenu===name?null:name)}><Icon size={19}/><span>{label}</span><span>›</span></button>{submenu===name&&<div role="menu" className="element-menu submenu">{items.map(([a,label,key])=>row(a,label,Icon,key))}</div>}</div>;
 const height=type==='text'?620:500;
 return <div className={`element-menu ${Math.min(x,window.innerWidth-306)>window.innerWidth-565?"submenu-left":""}`} role="menu" aria-label="Element options" ref={ref} style={{left:Math.min(x,window.innerWidth-306),top:Math.max(8,Math.min(y,window.innerHeight-height-8))}}>
 {row('copy','Copy',Copy,'⌘C')}{row('copy-style','Copy style',PaintRoller,'⌥⌘C')}{row('paste','Paste',Clipboard,'⌘V')}{row('duplicate','Duplicate',Copy,'⌘D')}{row('delete','Delete',Trash2,'DELETE')}<hr/>
 {count>1&&row('group','Group',Component,'⌘G')}{type==='group'&&row('ungroup','Ungroup',Component,'⇧⌘G')}
 {sub('layer','Layer',Layers,[['up','Bring forward','⌘]'],['down','Send backward','⌘['],['front','Bring to front','⌥⌘]'],['back','Send to back','⌥⌘['],['show-layers','Show layers','⌥1']])}{sub('align','Align to page',AlignCenter,[['top','Top'],['left','Left'],['middle','Middle'],['center','Center'],['bottom','Bottom'],['right','Right']])}
 {type==='image'&&<>{row('background','Set image as background',Type)}{row('crop','Crop',Scissors)}</>}
 {row('component','Create component',Component,'⌥⌘K')}{row('comment','Comment',MessageCircle,'⌥⌘N')}{sub('lock','Lock',Lock,locked?[['unlock','Unlock']]:[['lock','Lock position and appearance']])}{row('link','Link',Link,'⌘K')}{row('timing','Show element timing',Clock)}{row('alt','Alternative text',Type)}
 {type==='text'&&<><hr/>{row('write','Magic Write',Sparkles)}{row('translate','Translate text',Type)}</>}
 </div>;
}
