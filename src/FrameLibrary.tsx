import {memo,useDeferredValue,useEffect,useId,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Search,Star} from 'lucide-react';
import {FRAME_ITEMS,getFrameLibraryItem,resolveGridSlots,searchFrames,type FrameLibraryItem} from './frames';
import './frame-library.css';

const PAGE_SIZE=24,RECENT_KEY='visro-recent-frames',STAR_KEY='visro-starred-frames';
const CATEGORIES=[...new Set(FRAME_ITEMS.map(item=>item.category))];
const FEATURED=['circle','rounded','arch','heart','hexagon','organic-blob','grid-two-columns','grid-four-square','diamond','flower','landscape','grid-three-feature-left'];
const featuredOrder=new Map(FEATURED.map((id,index)=>[id,index]));
function readIds(key:string,limit:number):string[]{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string'&&!!getFrameLibraryItem(id)))].slice(0,limit):[];}catch{return[];}}
function Landscape(){return <><rect width="100" height="100" fill="#bed9ec"/><circle cx="74" cy="25" r="10" fill="#fff7d6"/><path d="M0 68 Q17 40 40 67 Q60 88 100 49 V100 H0 Z" fill="#8fb899"/><path d="M0 83 Q27 62 52 81 Q77 101 100 74 V100 H0 Z" fill="#567d65"/></>;}
export const FramePreview=memo(function FramePreview({item}:{item:FrameLibraryItem}){
  const clipId=`frame-${useId().replace(/[^a-z0-9_-]/gi,'')}`,height=100/item.aspectRatio;
  if(item.kind==='grid')return <svg className="frame-library-preview" viewBox={`0 0 100 ${height}`} role="img" aria-label={`${item.name} preview`}>{resolveGridSlots(item,100,height,3).map((slot,index)=><svg key={index} x={slot.x} y={slot.y} width={slot.width} height={slot.height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><Landscape/></svg>)}</svg>;
  return <svg className="frame-library-preview" viewBox={`0 0 100 ${height}`} role="img" aria-label={`${item.name} preview`}><defs><clipPath id={clipId}><path d={item.path} fillRule={item.fillRule} clipRule={item.fillRule} transform={`scale(1 ${1/item.aspectRatio})`}/></clipPath></defs><g clipPath={`url(#${clipId})`}><svg width="100" height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><Landscape/></svg></g></svg>;
});
export interface FrameLibraryProps {
  kind?:FrameLibraryItem['kind'];query?:string;onQueryChange?:(query:string)=>void;onInsert:(item:FrameLibraryItem)=>void|Promise<void>;
  onNotify?:(message:string)=>void;compact?:boolean;onBrowse?:()=>void;
}
export function FrameLibrary({kind,query,onQueryChange,onInsert,onNotify,compact=false,onBrowse}:FrameLibraryProps){
  const [ownQuery,setOwnQuery]=useState(''),[category,setCategory]=useState('All'),[page,setPage]=useState(0),[stars,setStars]=useState(()=>readIds(STAR_KEY,200)),[starredOnly,setStarredOnly]=useState(false),[recent,setRecent]=useState(()=>readIds(RECENT_KEY,8)),[adding,setAdding]=useState<string|null>(null);
  const search=useDeferredValue(query??ownQuery);
  const matches=useMemo(()=>{const results=searchFrames(search,category).filter(item=>(!kind||item.kind===kind)&&(!starredOnly||stars.includes(item.id)));return category==='All'&&!search.trim()?[...results].sort((a,b)=>(featuredOrder.get(a.id)??999)-(featuredOrder.get(b.id)??999)):results;},[search,category,stars,starredOnly,kind]);
  const pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE)),current=Math.min(page,pages-1),visible=compact?matches.slice(0,6):matches.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
  useEffect(()=>setPage(0),[search,category,starredOnly,kind]);
  useEffect(()=>setCategory('All'),[kind]);
  const categories=CATEGORIES.filter(value=>!kind||(kind==='grid'?value==='Photo grids':value!=='Photo grids')),recentItems=recent.map(id=>getFrameLibraryItem(id)).filter((item):item is FrameLibraryItem=>!!item&&(!kind||item.kind===kind)).slice(0,5),label=kind==='grid'?'Photo grids':kind==='frame'?'Frames':'Frames and grids';
  const remember=(id:string)=>setRecent(previous=>{const next=[id,...previous.filter(value=>value!==id)].slice(0,8);try{localStorage.setItem(RECENT_KEY,JSON.stringify(next));}catch{/* Insertion remains available when storage is unavailable. */}return next;});
  const insert=async(item:FrameLibraryItem)=>{if(adding)return;setAdding(item.id);try{await onInsert(item);remember(item.id);}catch(error){onNotify?.(error instanceof Error?error.message:'This frame could not be added.');}finally{setAdding(null);}};
  const star=(id:string)=>setStars(previous=>{const next=previous.includes(id)?previous.filter(value=>value!==id):[...previous,id];try{localStorage.setItem(STAR_KEY,JSON.stringify(next));}catch{/* Current favorites remain usable. */}return next;});
  const card=(item:FrameLibraryItem,small=false)=><article key={item.id} className={`frame-library-card ${small?'small':''}`}><button className="frame-library-add" aria-label={`Add ${item.name} ${item.kind==='grid'?'photo grid':'frame'}`} title={item.name} draggable disabled={adding===item.id} onClick={()=>void insert(item)} onDragStart={event=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/visro-frame',JSON.stringify({id:item.id}));}} onDragEnd={event=>{if(event.dataTransfer.dropEffect!=='none')remember(item.id);}}><span className="frame-library-art"><FramePreview item={item}/></span><span className="frame-library-name">{item.name}</span>{!small&&item.kind==='grid'&&<span className="frame-library-slots">{item.slots.length} {item.slots.length===1?'photo':'photos'}</span>}</button>{!small&&<button className={`frame-library-star ${stars.includes(item.id)?'active':''}`} aria-label={`${stars.includes(item.id)?'Unstar':'Star'} ${item.name} ${item.kind==='grid'?'photo grid':'frame'}`} aria-pressed={stars.includes(item.id)} onClick={()=>star(item.id)}><Star size={13} fill={stars.includes(item.id)?'currentColor':'none'}/></button>}</article>;
  return <section className={`frame-library ${compact?'compact':''}`} aria-label={label}>
    {compact?<div className="section-label"><span>{kind==='grid'?'Grids':'Frames'}</span>{onBrowse&&<button className="frame-library-see-all" onClick={onBrowse}>See all</button>}</div>:<>
      {query===undefined&&<label className="frame-library-search"><Search size={17}/><input aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}`} value={ownQuery} onChange={event=>setOwnQuery(event.target.value)}/></label>}
      <div className="frame-library-filters"><label>Category<select aria-label="Frame category" value={category} onChange={event=>setCategory(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{categories.map(value=><option key={value} value={value}>{value}</option>)}</select></label><button className={`quiet-button ${starredOnly?'active':''}`} aria-pressed={starredOnly} onClick={()=>setStarredOnly(value=>!value)}><Star size={14} fill={starredOnly?'currentColor':'none'}/>Starred</button></div>
    </>}
    {!compact&&!search.trim()&&category==='All'&&!starredOnly&&recentItems.length>0&&<div className="frame-library-recent"><div className="section-label"><span>Recently used</span></div><div className="frame-library-recent-row">{recentItems.map(item=>card(item,true))}</div></div>}
    {!compact&&<div className="section-label"><span>{starredOnly?'Starred frames':category==='All'?label:category}</span><span role="status">{matches.length} results</span></div>}
    <div className="frame-library-grid">{visible.map(item=>card(item))}</div>
    {!visible.length&&<div className="frame-library-empty"><Search size={26}/><strong>No matching frames</strong><p>Try another word or category.</p><button className="quiet-button" onClick={()=>{setCategory('All');setStarredOnly(false);setOwnQuery('');onQueryChange?.('');}}>Clear filters</button></div>}
    {!compact&&pages>1&&<nav className="frame-library-pagination" aria-label="Frame pages"><button className="quiet-button" aria-label="Previous frames page" disabled={!current} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></button><span>{current+1} of {pages}</span><button className="quiet-button" aria-label="Next frames page" disabled={current>=pages-1} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></button></nav>}
  </section>;
}
