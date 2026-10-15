import {useEffect,useRef,useState} from 'react';
import {Search,X} from 'lucide-react';
export interface QuickAction {id:string;label:string;keywords?:string;shortcut?:string;disabled?:boolean;run:()=>void}
export function QuickActions({actions,onClose}:{actions:QuickAction[];onClose:()=>void}){
  const [query,setQuery]=useState(''),[active,setActive]=useState(0),root=useRef<HTMLElement>(null);
  const matches=actions.filter(a=>!query||`${a.label} ${a.keywords||''}`.toLowerCase().includes(query.toLowerCase()));
  const current=Math.min(active,Math.max(0,matches.length-1));
  useEffect(()=>setActive(0),[query]);
  useEffect(()=>{root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[current]);
  const execute=()=>{const action=matches[current];if(action&&!action.disabled){onClose();action.run();}};
  return <div className="modal-backdrop quick-actions-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={root} className="quick-actions" role="dialog" aria-modal="true" aria-label="Quick actions" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}else if(e.key==='ArrowDown'){e.preventDefault();setActive(v=>Math.min(matches.length-1,v+1));}else if(e.key==='ArrowUp'){e.preventDefault();setActive(v=>Math.max(0,v-1));}else if(e.key==='Enter'){e.preventDefault();execute();}}}><label className="quick-actions-search"><Search size={21}/><input autoFocus aria-label="Search quick actions" role="combobox" aria-expanded="true" aria-controls="quick-action-results" aria-activedescendant={matches[current]?`quick-action-${matches[current].id}`:undefined} placeholder="Search actions, tools, and shortcuts" value={query} onChange={e=>setQuery(e.target.value)}/><button className="icon-button" aria-label="Close quick actions" onClick={onClose}><X size={19}/></button></label><div id="quick-action-results" className="quick-actions-results" role="listbox">{matches.map((action,index)=><button id={`quick-action-${action.id}`} key={action.id} role="option" aria-selected={index===current} disabled={action.disabled} onMouseEnter={()=>setActive(index)} onClick={()=>{onClose();action.run();}}><span>{action.label}</span><kbd>{action.shortcut}</kbd></button>)}{!matches.length&&<p>No matching actions</p>}</div><footer>↑ ↓ to navigate · Enter to run · Esc to close</footer></section></div>;
}
