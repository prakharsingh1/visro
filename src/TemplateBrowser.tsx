import {useDeferredValue,useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Search,Star,X} from 'lucide-react';
import {TEMPLATES} from './templates';
import {TemplatePreview} from './TemplatePreview';
import type {DesignTemplate} from './editor-types';

const CATALOG=[...TEMPLATES].sort((a,b)=>Number(b.id.startsWith('photo-original-'))-Number(a.id.startsWith('photo-original-')));
const CATEGORIES=[...new Set(TEMPLATES.map(t=>t.category))];
const COLORS=['#ffffff','#171717','#ef4444','#f59e0b','#22c55e','#06b6d4','#3b82f6','#a855f7','#ec4899'];
const rgb=(hex:string)=>{const clean=hex.replace('#','');return [0,2,4].map(i=>parseInt(clean.slice(i,i+2),16));};
const similar=(a:string,b:string)=>{if(!/^#[a-f0-9]{6}$/i.test(a))return false;const c=rgb(a),d=rgb(b);return Math.hypot(...c.map((v,i)=>v-d[i]))<115;};
function readStars():string[]{try{const value=JSON.parse(localStorage.getItem('visro-template-stars')||'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string').slice(0,1000):[];}catch{return [];}}

export function TemplateBrowser({query='',compact=false,onUse}:{query?:string;compact?:boolean;onUse:(id:string,name:string)=>void}){
  const [category,setCategory]=useState('All'),[color,setColor]=useState(''),[starredOnly,setStarredOnly]=useState(false),[stars,setStars]=useState(readStars),[page,setPage]=useState(0),[preview,setPreview]=useState<DesignTemplate|null>(null);
  const search=useDeferredValue(query.trim().toLocaleLowerCase());
  const results=useMemo(()=>CATALOG.filter(t=>(category==='All'||t.category===category)&&(!starredOnly||stars.includes(t.id))&&(!color||t.palette.some(c=>similar(c,color)))&&(!search||`${t.name} ${t.category} ${t.description}`.toLocaleLowerCase().includes(search))),[search,category,color,starredOnly,stars]);
  const pageSize=compact?18:24,total=Math.max(1,Math.ceil(results.length/pageSize)),current=Math.min(page,total-1);
  useEffect(()=>setPage(0),[search,category,color,starredOnly]);
  useEffect(()=>{if(!preview)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setPreview(null);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[preview]);
  const toggleStar=(id:string)=>setStars(previous=>{const next=previous.includes(id)?previous.filter(s=>s!==id):[...previous,id];localStorage.setItem('visro-template-stars',JSON.stringify(next));return next;});
  return <section className={`template-browser ${compact?'compact':''}`} aria-label="Template library">
    <div className="template-filters"><label>Category<select aria-label="Template category" value={category} onChange={e=>setCategory(e.target.value)}><option>All</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><button className={`quiet-button ${starredOnly?'active':''}`} aria-pressed={starredOnly} onClick={()=>setStarredOnly(!starredOnly)}><Star size={15} fill={starredOnly?'currentColor':'none'}/>Starred</button></div>
    <div className="template-color-filters" aria-label="Template colours"><button aria-label="All template colours" aria-pressed={!color} className={!color?'active':''} onClick={()=>setColor('')}>All colours</button>{COLORS.map(c=><button key={c} aria-label={`Filter templates by ${c}`} aria-pressed={color===c} className={`template-color-filter ${color===c?'active':''}`} style={{background:c}} onClick={()=>setColor(color===c?'':c)}/>)}</div>
    <div className="section-label"><span>{starredOnly?'Starred templates':'Templates'}</span><span role="status">{results.length} results</span></div>
    <div className={compact?'template-grid':'recent-grid template-catalog-grid'}>
      {results.slice(current*pageSize,(current+1)*pageSize).map((template,index)=><article key={template.id} className="template-library-card">
        <button className={compact?'template-card':'recent-card'} aria-label={`Preview ${template.name}`} onClick={()=>setPreview(template)}><TemplatePreview template={template} index={current*pageSize+index}/><strong>{template.name}</strong><small>{template.category} · {template.width} × {template.height}</small></button>
        <button className={`template-star ${stars.includes(template.id)?'active':''}`} aria-label={`${stars.includes(template.id)?'Unstar':'Star'} template ${template.name}`} onClick={()=>toggleStar(template.id)}><Star size={16} fill={stars.includes(template.id)?'currentColor':'none'}/></button>
      </article>)}
    </div>
    {!results.length&&<div className="empty-library"><Search size={26}/><h3>No matching templates</h3><p>Try another keyword or clear the filters.</p><button className="quiet-button" onClick={()=>{setCategory('All');setColor('');setStarredOnly(false);}}>Clear filters</button></div>}
    <nav className="template-pagination" aria-label="Template pages"><button className="quiet-button" aria-label="Previous template page" disabled={!current} onClick={()=>setPage(current-1)}><ChevronLeft size={17}/>Previous</button><span>Page {current+1} of {total}</span><button className="quiet-button" aria-label="Next template page" disabled={current>=total-1} onClick={()=>setPage(current+1)}>Next<ChevronRight size={17}/></button></nav>
    {preview&&<div className="modal-backdrop template-preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPreview(null);}}><section className="template-detail" role="dialog" aria-modal="true" aria-label={`${preview.name} template`}><button autoFocus className="icon-button template-detail-close" aria-label="Close template preview" onClick={()=>setPreview(null)}><X size={21}/></button><div className="template-detail-art"><TemplatePreview template={preview} index={0}/></div><div className="template-detail-info"><span className="eyebrow">{preview.category}</span><h2>{preview.name}</h2><p>{preview.description}</p><p>{preview.width} × {preview.height} px · Editable layout</p><button className="full-button coral" onClick={()=>{setPreview(null);onUse(preview.id,preview.name);}}>Use this template</button><button className="full-button" onClick={()=>toggleStar(preview.id)}><Star size={17} fill={stars.includes(preview.id)?'currentColor':'none'}/>{stars.includes(preview.id)?'Starred':'Star template'}</button></div></section></div>}
  </section>;
}
