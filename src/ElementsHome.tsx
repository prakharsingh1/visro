import {useRef,useState,type DragEvent} from 'react';
import {ChevronRight} from 'lucide-react';
import {ElementCategoryIcon,ELEMENT_CATEGORIES,type ElementCategory} from './ElementCategoryIcon';
import {readRecentElements,type RecentElement,type RecentElementKind} from './element-recents';
import {shapePreviewSVG,SHAPE_LIBRARY} from './shapes';
import {getGraphic} from './graphics-library';
import {GraphicPreview} from './GraphicsLibrary';
import {getFrameLibraryItem} from './frames';
import {FramePreview} from './FrameLibrary';
import {getTextCombination} from './text-combinations';
import {TextCombinationPreview} from './TextLibrary';
import {getMockup,mockupPreviewSVG} from './mockups';
import './elements-browser.css';

function details(item:RecentElement){
 if(item.kind==='shape'){const shape=SHAPE_LIBRARY.find(shape=>shape.id===item.id);return shape?{name:shape.name,art:<span dangerouslySetInnerHTML={{__html:shapePreviewSVG(shape.id,'currentColor','currentColor')}}/>}:null;}
 if(item.kind==='graphic'){const graphic=getGraphic(item.id);return graphic?{name:graphic.name,art:<GraphicPreview graphic={graphic}/>} :null;}
 if(item.kind==='frame'){const frame=getFrameLibraryItem(item.id);return frame?{name:frame.name,art:<FramePreview item={frame}/>} :null;}
 if(item.kind==='text-combination'){const combination=getTextCombination(item.id);return combination?{name:combination.name,art:<TextCombinationPreview combination={combination}/>} :null;}
 const mockup=getMockup(item.id);return mockup?{name:mockup.name,art:<span dangerouslySetInnerHTML={{__html:mockupPreviewSVG(mockup)}}/>}:null;
}
function fallback():RecentElement[]{
 const records:RecentElement[]=[];
 for(const[kind,key]of [['shape','visro-recent-shapes'],['graphic','visro-recent-graphics'],['frame','visro-recent-frames'],['text-combination','visro-recent-text-combinations']] as const){try{const ids=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(ids))for(const id of ids.slice(0,4))if(typeof id==='string')records.push({kind,id});}catch{/* Ignore unavailable preferences. */}}
 return records;
}
export function ElementsHome({onBrowse,onInsert,refreshKey=0}:{onBrowse:(kind:ElementCategory)=>void;onInsert:(kind:RecentElementKind,id:string)=>void;refreshKey?:number}){
 const row=useRef<HTMLDivElement>(null),[all,setAll]=useState(false);
 void refreshKey;
 const saved=readRecentElements(),items=(saved.length?saved:fallback()).map(item=>({...item,details:details(item)})).filter(item=>!!item.details);
 const drag=(event:DragEvent,item:RecentElement)=>{event.dataTransfer.effectAllowed='copy';if(item.kind==='graphic')event.dataTransfer.setData('text/visro-graphic',JSON.stringify({id:item.id}));else if(item.kind==='frame')event.dataTransfer.setData('text/visro-frame',JSON.stringify({id:item.id}));else event.dataTransfer.setData('text/visro-asset',JSON.stringify(item.kind==='shape'?{kind:'shape',type:item.id}:item));};
 return <section className="elements-home" aria-label="Browse elements">
  {items.length>0&&<section className="element-recent-section"><div className="element-section-heading"><h3>Recently used</h3><button onClick={()=>setAll(value=>!value)}>{all?'Show less':'See all'}</button></div><div className={`element-recent-wrap ${all?'expanded':''}`}><div ref={row} className="element-recent-row">{items.map(item=><button key={`${item.kind}:${item.id}`} draggable title={item.details!.name} aria-label={`Add ${item.details!.name} recent element`} onClick={()=>onInsert(item.kind,item.id)} onDragStart={event=>drag(event,item)}>{item.details!.art}</button>)}</div>{!all&&items.length>3&&<button className="element-recent-next" aria-label="Next recently used elements" onClick={()=>row.current?.scrollBy({left:240,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ChevronRight size={24}/></button>}</div></section>}
  <div className="element-section-heading"><h3>Browse categories</h3></div><div className="elements-browse-categories">{ELEMENT_CATEGORIES.map(([id,name])=><button key={id} aria-label={name} onClick={()=>onBrowse(id)}><ElementCategoryIcon kind={id}/><span>{name}</span></button>)}</div>
 </section>;
}
