import {useState} from 'react';
import {searchMockups,mockupPreviewSVG} from './mockups';
import './elements-browser.css';
export function MockupLibrary({query='',onInsert,onNotify}:{query?:string;onInsert:(id:string)=>void|Promise<void>;onNotify:(text:string)=>void}){
 const [adding,setAdding]=useState<string|null>(null),matches=searchMockups(query);
 return <section className="mockup-library" aria-label="Mockups library"><div className="element-section-heading"><h3>Mockups</h3><span role="status">{matches.length} results</span></div><div className="mockup-library-grid">{matches.map(item=><button key={item.id} draggable disabled={adding===item.id} aria-label={`Add ${item.name} mockup`} onDragStart={event=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('text/visro-asset',JSON.stringify({kind:'mockup',id:item.id}));}} onClick={()=>{setAdding(item.id);void Promise.resolve().then(()=>onInsert(item.id)).catch(error=>onNotify(error instanceof Error?error.message:'The mockup could not be added.')).finally(()=>setAdding(null));}}><span dangerouslySetInnerHTML={{__html:mockupPreviewSVG(item)}}/><span>{item.name}</span></button>)}</div>{!matches.length&&<p className="small-hint">No matching mockups. Try a device, print or product.</p>}<p className="small-hint">Drag a photo onto the image area to replace it. Double-click the image to crop.</p></section>;
}
