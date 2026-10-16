import {useDeferredValue,useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {SHAPE_CATEGORIES,SHAPE_LIBRARY,searchShapes,shapePreviewSVG,type ShapeId} from './shapes';
import './shape-library.css';

const RECENTS_KEY='visro-recent-shapes';
const PAGE_SIZE=40;
const PREVIEWS=new Map(SHAPE_LIBRARY.map(shape=>[shape.id,shapePreviewSVG(shape.id,'currentColor','currentColor')]));
function readRecent():string[] {try {const value=JSON.parse(localStorage.getItem(RECENTS_KEY)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string'&&SHAPE_LIBRARY.some(shape=>shape.id===id)).slice(0,16):[];}catch{return[];}}

export function ShapeLibrary({query='',onInsert,compact=false}:{query?:string;onInsert:(id:ShapeId)=>void;compact?:boolean}) {
  const [category,setCategory]=useState(''),[recent,setRecent]=useState(readRecent),[page,setPage]=useState(0);
  const search=useDeferredValue(query.trim().toLowerCase());
  const results=useMemo(()=>searchShapes(search),[search]);
  const order=['Lines',...SHAPE_CATEGORIES.filter(category=>category!=='Lines')];
  const categories=[...new Set(results.map(shape=>shape.category))].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  const matching=category==='Recently used'?recent.map(id=>results.find(shape=>shape.id===id)).filter((shape):shape is typeof SHAPE_LIBRARY[number]=>!!shape):category?results.filter(shape=>shape.category===category):results;
  const pages=Math.max(1,Math.ceil(matching.length/PAGE_SIZE)),current=Math.min(page,pages-1),visible=matching.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
  useEffect(()=>{setCategory('');setPage(0);},[search]);
  useEffect(()=>setPage(0),[category]);
  const remember=(id:ShapeId)=>{const next=[id,...recent.filter(item=>item!==id)].slice(0,16);setRecent(next);try{localStorage.setItem(RECENTS_KEY,JSON.stringify(next));}catch{/* Browsing still works when local preferences are full. */}};
  const tile=(shape:typeof SHAPE_LIBRARY[number])=><button type="button" className="element-shape-tile" key={shape.id} title={shape.name} aria-label={`Add ${shape.name}`} draggable onDragStart={event=>{remember(shape.id);event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/visro-asset',JSON.stringify({kind:'shape',type:shape.id}));}} onClick={()=>{remember(shape.id);onInsert(shape.id);}}><span aria-hidden="true" dangerouslySetInnerHTML={{__html:PREVIEWS.get(shape.id)!}}/></button>;
  const section=(name:string,items:readonly (typeof SHAPE_LIBRARY[number])[])=> <section className="shape-library-section" key={name}><div className="element-section-heading"><h3>{name==='Basic'?'Basic shapes':name}</h3>{!compact&&<button type="button" onClick={()=>setCategory(name)}>See all</button>}</div><div className="shape-library-row">{items.slice(0,8).map(tile)}</div></section>;
  const grid=<><div className="element-section-heading"><h3>{category||'Shapes'}</h3><span role="status">{matching.length} {search?'results':'shapes'}</span></div><div className="shape-library-grid">{visible.map(tile)}</div>{pages>1&&<nav className="shape-library-pagination" aria-label="Shapes pages"><button type="button" aria-label="Previous shapes page" disabled={!current} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></button><span>{current+1} of {pages}</span><button type="button" aria-label="Next shapes page" disabled={current>=pages-1} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></button></nav>}</>;
  return <div className={`shape-library ${compact?'compact':''}`} role="region" aria-label="Shapes library">
    {!compact&&<nav className="shape-library-categories" aria-label="Shape categories"><button type="button" aria-pressed={!category} onClick={()=>setCategory('')}>All</button>{order.map(name=><button type="button" key={name} aria-pressed={category===name} onClick={()=>setCategory(name)}>{name==='Basic'?'Basic shapes':name}</button>)}</nav>}
    {category&&!compact?<><button type="button" className="element-library-back" onClick={()=>setCategory('')}><ChevronLeft size={18}/>All shapes</button>{grid}</>:<>
      {!search&&!compact&&recent.length>0&&section('Recently used',recent.map(id=>SHAPE_LIBRARY.find(shape=>shape.id===id)!).filter(Boolean))}
      {compact?<div className="shape-library-row">{results.slice(0,5).map(tile)}</div>:search?grid:categories.map(name=>section(name,results.filter(shape=>shape.category===name)))}
    </>}
    {!results.length&&<p className="small-hint">No matching shapes. Try another keyword.</p>}
    {!compact&&!category&&<p className="small-hint">Click or drag a shape onto your page.</p>}
  </div>;
}
