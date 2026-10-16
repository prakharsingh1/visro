import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {StudioIcon,type StudioIconName} from './icons';

export type ElementAction='copy'|'copy-style'|'paste-style'|'paste'|'duplicate'|'delete'|'front'|'back'|'up'|'down'|'top'|'left'|'middle'|'center'|'bottom'|'right'|'component'|'comment'|'lock'|'unlock'|'link'|'timing'|'alt'|'write'|'translate'|'group'|'ungroup'|'background'|'crop'|'show-layers'|'frame';
type SubmenuName='layer'|'align'|'lock';
type MenuItem=[ElementAction,string,StudioIconName,string?];
interface MenuPoint {left:number;top:number}

/** Clamp the measured menu rather than estimating height from element type. */
export function elementMenuPosition(x:number,y:number,width:number,height:number,viewportWidth:number,viewportHeight:number):MenuPoint {
 const bound=(value:number,size:number,viewport:number)=>Math.max(8,Math.min(Number.isFinite(value)?value:8,Math.max(8,viewport-size-8)));
 return {left:bound(x,width,viewportWidth),top:bound(y,height,viewportHeight)};
}
function levelButtons(menu:HTMLElement|null){return Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')||[]).filter(button=>button.closest('[role="menu"]')===menu);}

export function ElementMenu({x,y,type,count,locked,onAction,onClose,canFrame=false}:{x:number;y:number;type?:string;count:number;locked:boolean;canFrame?:boolean;onAction:(action:ElementAction)=>void;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null),popup=useRef<HTMLDivElement>(null),triggers=useRef<Partial<Record<SubmenuName,HTMLButtonElement>>>({});
 const [submenu,setSubmenu]=useState<SubmenuName|null>(null),[position,setPosition]=useState<MenuPoint>(()=>elementMenuPosition(x,y,272,0,window.innerWidth,window.innerHeight)),[subPosition,setSubPosition]=useState<MenuPoint>({left:8,top:8});
 const submenuState=useRef(submenu),focusSubmenu=useRef(false),leaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null),callbacks=useRef({onClose,onAction}),id=useId();
 submenuState.current=submenu;callbacks.current={onClose,onAction};
 const cancelLeave=()=>{if(leaveTimer.current!==null){clearTimeout(leaveTimer.current);leaveTimer.current=null;}};
 const openSubmenu=(name:SubmenuName,focus=false)=>{cancelLeave();focusSubmenu.current=focus;setSubmenu(name);};
 useLayoutEffect(()=>{
  const menu=ref.current;if(!menu)return;
  const bounds=menu.getBoundingClientRect(),next=elementMenuPosition(x,y,bounds.width,bounds.height,window.innerWidth,window.innerHeight);
  if(next.left!==position.left||next.top!==position.top)setPosition(next);
  if(submenu&&popup.current){
   const anchor=triggers.current[submenu]?.getBoundingClientRect(),size=popup.current.getBoundingClientRect();
   if(anchor){const right=anchor.right+4;const left=right+size.width<=window.innerWidth-8?right:anchor.left-size.width-4;const point=elementMenuPosition(left,anchor.top-5,size.width,size.height,window.innerWidth,window.innerHeight);if(point.left!==subPosition.left||point.top!==subPosition.top)setSubPosition(point);}
   if(focusSubmenu.current){levelButtons(popup.current)[0]?.focus();focusSubmenu.current=false;}
  }
 });
 useEffect(()=>{
  const root=ref.current,previous=document.activeElement as HTMLElement|null;levelButtons(root)[0]?.focus();
  let search='',lastTyped=0;
  const close=(event:PointerEvent)=>{if(!root?.contains(event.target as Node))callbacks.current.onClose();};
  const dismiss=()=>{callbacks.current.onClose();if(previous?.isConnected)previous.focus();};
  const key=(event:KeyboardEvent)=>{
   if(event.metaKey||event.ctrlKey||event.altKey)return;
   const active=document.activeElement as HTMLButtonElement|null,current=active?.closest<HTMLElement>('[role="menu"]'),menu=current&&root?.contains(current)?current:root;
   const buttons=levelButtons(menu),index=buttons.indexOf(active as HTMLButtonElement);
   const consume=()=>{event.preventDefault();event.stopImmediatePropagation();};
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){consume();const direction=event.key==='ArrowDown'?1:-1;buttons[index<0?(direction>0?0:buttons.length-1):(index+direction+buttons.length)%buttons.length]?.focus();}
   else if(event.key==='Home'||event.key==='End'){consume();buttons[event.key==='Home'?0:buttons.length-1]?.focus();}
   else if(event.key==='ArrowRight'){consume();const name=active?.dataset.submenu as SubmenuName|undefined;if(name)openSubmenu(name,true);}
   else if(event.key==='ArrowLeft'){consume();const name=submenuState.current;if(name){setSubmenu(null);triggers.current[name]?.focus();}}
   else if(event.key==='Escape'){consume();const name=submenuState.current;if(name){setSubmenu(null);triggers.current[name]?.focus();}else dismiss();}
   else if(event.key==='Enter'||event.key===' '){consume();if(active&&root?.contains(active))active.click();}
   else if(event.key==='Tab'){consume();dismiss();}
   else if(event.key.length===1&&!event.isComposing){consume();const now=Date.now();search=now-lastTyped<600?search+event.key.toLowerCase():event.key.toLowerCase();lastTyped=now;const candidates=[...buttons.slice(index+1),...buttons.slice(0,index+1)];candidates.find(button=>button.querySelector('.menu-label')?.textContent?.toLowerCase().startsWith(search))?.focus();}
  };
  // Capture before the editor's global shortcuts: arrows and typed letters in
  // the menu must never nudge an object or insert a new text/shape layer.
  window.addEventListener('pointerdown',close,true);window.addEventListener('keydown',key,true);
  const resized=()=>{callbacks.current.onClose();};window.addEventListener('resize',resized);
  return()=>{cancelLeave();window.removeEventListener('pointerdown',close,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',resized);if(previous?.isConnected&&root?.contains(document.activeElement))previous.focus();};
 },[]);
 const run=(action:ElementAction)=>{callbacks.current.onClose();callbacks.current.onAction(action);};
 const row=([action,label,icon,shortcut]:MenuItem)=><button role="menuitem" tabIndex={-1} key={action} onPointerEnter={event=>{cancelLeave();if(event.currentTarget.closest('[role="menu"]')===ref.current)setSubmenu(null);}} onClick={()=>run(action)}><StudioIcon name={icon} size={20}/><span className="menu-label">{label}</span>{shortcut&&<kbd>{shortcut}</kbd>}</button>;
 const sub=(name:SubmenuName,label:string,icon:StudioIconName,items:(MenuItem|null)[])=><div className="context-submenu" onPointerEnter={()=>openSubmenu(name)} onPointerLeave={()=>{cancelLeave();leaveTimer.current=setTimeout(()=>setSubmenu(null),140);}}>
  <button role="menuitem" tabIndex={-1} data-submenu={name} ref={button=>{if(button)triggers.current[name]=button;}} aria-haspopup="menu" aria-controls={`${id}-${name}`} aria-expanded={submenu===name} onClick={()=>openSubmenu(name,true)}><StudioIcon name={icon} size={20}/><span className="menu-label">{label}</span><StudioIcon className="menu-chevron" name="chevron" size={16}/></button>
  {submenu===name&&<div role="menu" aria-label={label} id={`${id}-${name}`} className="element-menu submenu" ref={popup} style={subPosition} onPointerEnter={cancelLeave}>{items.map((item,index)=>item?row(item):<hr key={`separator-${index}`} role="separator"/>)}</div>}
 </div>;
 return <div className="element-menu" role="menu" aria-label="Element options" ref={ref} style={position} onContextMenu={event=>event.preventDefault()} onScroll={event=>{if(event.target===event.currentTarget)setSubmenu(null);}}>
  {row(['copy','Copy','copy','⌘C'])}{row(['copy-style','Copy style','paint-roller','⌥⌘C'])}{row(['paste','Paste','clipboard','⌘V'])}{row(['duplicate','Duplicate','duplicate','⌘D'])}{row(['delete','Delete','trash','DELETE'])}<hr role="separator"/>
  {count>1&&row(['group','Group','components','⌘G'])}{type==='group'&&row(['ungroup','Ungroup','components','⇧⌘G'])}
  {sub('layer','Layer','layers',[[ 'front','Bring to front','bring-front','⌥⌘]'],['up','Bring forward','bring-forward','⌘]'],['down','Send backward','send-backward','⌘['],['back','Send to back','send-back','⌥⌘['],null,['show-layers','Show layers','layers','⌥1']])}
  {sub('align','Align to page','align-left',[['left','Left','align-left'],['center','Center','align-center'],['right','Right','align-right'],null,['top','Top','align-top'],['middle','Middle','align-middle'],['bottom','Bottom','align-bottom']])}<hr role="separator"/>
  {canFrame&&row(['frame','Change to frame','frames'])}
  {row(['component','Create component','components','⌥⌘K'])}{row(['comment','Comment','comments','⌥⌘N'])}
  {sub('lock',locked?'Unlock':'Lock',locked?'unlock':'lock',locked?[['unlock','Unlock','unlock']]:[['lock','Lock position and appearance','lock']])}
  {row(['link','Link','link','⌘K'])}{row(['timing','Show element timing','timing'])}{row(['alt','Alternative text','alternative-text'])}
  {type==='image'&&<><hr role="separator"/>{row(['background','Set image as background','background'])}</>}
  {type==='text'&&<><hr role="separator"/>{row(['write','Magic Write','ai'])}{row(['translate','Translate text','text'])}</>}
 </div>;
}
