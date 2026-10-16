import {useMemo,useState} from 'react';
import {ChevronLeft} from 'lucide-react';
import {SHAPE_LIBRARY,shapePreviewSVG,type ShapeId} from './shapes';
import './shape-library.css';

const RECENTS_KEY='visro-recent-shapes';
function readRecent():string[] {try {const value=JSON.parse(localStorage.getItem(RECENTS_KEY)||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string'&&SHAPE_LIBRARY.some(shape=>shape.id===id)).slice(0,16):[];}catch{return[];}}

export function ShapeLibrary({query='',onInsert,compact=false}:{query?:string;onInsert:(id:ShapeId)=>void;compact?:boolean}) {
  const [category,setCategory]=useState(''),[recent,setRecent]=useState(readRecent);
  const search=query.trim().toLowerCase();
  const results=useMemo(()=>SHAPE_LIBRARY.filter(shape=>`${shape.name} ${shape.category} ${shape.id}`.toLowerCase().includes(search)),[search]);
  const order=['Lines','Basic','Polygons','Stars & badges','Arrows','Callouts'];
  const categories=[...new Set(results.map(shape=>shape.category))].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  const remember=(id:ShapeId)=>{const next=[id,...recent.filter(item=>item!==id)].slice(0,16);setRecent(next);try{localStorage.setItem(RECENTS_KEY,JSON.stringify(next));}catch{/* Browsing still works when local preferences are full. */}};
  const tile=(shape:typeof SHAPE_LIBRARY[number])=><button type="button" className="element-shape-tile" key={shape.id} title={shape.name} aria-label={`Add ${shape.name}`} draggable onDragStart={event=>{remember(shape.id);event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/visro-asset',JSON.stringify({kind:'shape',type:shape.id}));}} onClick={()=>{remember(shape.id);onInsert(shape.id);}}><span aria-hidden="true" dangerouslySetInnerHTML={{__html:shapePreviewSVG(shape.id,'currentColor','currentColor')}}/></button>;
  const section=(name:string,items:readonly (typeof SHAPE_LIBRARY[number])[])=> <section className="shape-library-section" key={name}><div className="element-section-heading"><h3>{name==='Basic'?'Basic shapes':name}</h3>{!compact&&name!=='Recently used'&&<button type="button" onClick={()=>setCategory(name)}>See all</button>}</div><div className="shape-library-row">{items.slice(0,8).map(tile)}</div></section>;
  return <div className={`shape-library ${compact?'compact':''}`} role="region" aria-label="Shapes library">
    {category&&!compact?<><button type="button" className="element-library-back" onClick={()=>setCategory('')}><ChevronLeft size={18}/>All shapes</button><div className="element-section-heading"><h3>{category}</h3><span>{results.filter(shape=>shape.category===category).length} shapes</span></div><div className="shape-library-grid">{results.filter(shape=>shape.category===category).map(tile)}</div></>:<>
      {!search&&!compact&&recent.length>0&&section('Recently used',recent.map(id=>SHAPE_LIBRARY.find(shape=>shape.id===id)!).filter(Boolean))}
      {compact?<div className="shape-library-row">{results.slice(0,5).map(tile)}</div>:search?<><div className="element-section-heading"><h3>Shapes</h3><span role="status">{results.length} results</span></div><div className="shape-library-grid">{results.map(tile)}</div></>:categories.map(name=>section(name,results.filter(shape=>shape.category===name)))}
    </>}
    {!results.length&&<p className="small-hint">No matching shapes. Try another keyword.</p>}
    {!compact&&!category&&<p className="small-hint">Click or drag a shape onto your page.</p>}
  </div>;
}
