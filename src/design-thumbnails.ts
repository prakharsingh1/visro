import {StaticCanvas,Gradient,util} from 'fabric';
import {cloneProject,validateProject} from './project';
import {FONT_FAMILIES,loadDesignFonts} from './font-catalog';
import {designPreviewRevision,getDesignSummary,getDesignThumbnailSource,listAssets,needsDesignThumbnail,storeDesignThumbnail,type SavedDesign} from './storage';

const fontLoads=new Map<string,Promise<void>>();
async function previewFonts(project:unknown):Promise<void>{
 const families=new Set<string>();
 const visit=(value:unknown):void=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){const record=value as Record<string,unknown>;if(typeof record.fontFamily==='string')families.add(record.fontFamily);Object.values(record).forEach(visit);}};
 visit(project);
 await loadDesignFonts().catch(error=>{if([...families].some(family=>FONT_FAMILIES.includes(family)&&!Array.from(document.fonts).some(face=>face.family.replaceAll('"','')===family&&face.status==='loaded')))throw error;});
 const missing=[...families].filter(family=>!FONT_FAMILIES.includes(family)&&!Array.from(document.fonts).some(face=>face.family.replaceAll('"','')===family&&face.status==='loaded'));
 if(missing.length){
  const assets=await listAssets(['font']);
  for(const asset of assets.filter(asset=>missing.includes(asset.name))){
   const key=`${asset.id}:${asset.updated}`;
   let task=fontLoads.get(key);
   if(!task){task=(async()=>{const face=new FontFace(asset.name,`url(${asset.data})`);await face.load();document.fonts.add(face);})();fontLoads.set(key,task);void task.catch(()=>fontLoads.delete(key));}
   await task;
  }
 }
 await document.fonts.ready;
}

/** Detached StaticCanvas only: rendering a Home cover must never resize, export,
 * select or otherwise touch the interactive editor's canvas or document. */
export async function renderProjectThumbnail(value:unknown,signal?:AbortSignal):Promise<string>{
 signal?.throwIfAborted();
 const project=validateProject(value),page=project.pages[0],width=project.width,height=project.height;
 const scale=Math.min(1,480/Math.max(width,height));
 const thumbnailWidth=Math.max(1,Math.round(width*scale)),thumbnailHeight=Math.max(1,Math.round(height*scale));
 const canvas=util.createCanvasElement();
 const surface=new StaticCanvas(canvas,{width:thumbnailWidth,height:thumbnailHeight,enableRetinaScaling:false,renderOnAddRemove:false});
 try{
  const content=cloneProject(page.canvas);delete content.clipPath;
  await surface.loadFromJSON(content,undefined,{signal});signal?.throwIfAborted();
  const gradient=page.backgroundGradient;
  if(gradient&&gradient.colors.length>=2){
   const radians=gradient.angle*Math.PI/180,extent=Math.abs(width*Math.cos(radians))+Math.abs(height*Math.sin(radians));
   const dx=Math.cos(radians)*extent/2,dy=Math.sin(radians)*extent/2;
   surface.backgroundColor=new Gradient({type:'linear',gradientUnits:'pixels',coords:{x1:width/2-dx,y1:height/2-dy,x2:width/2+dx,y2:height/2+dy},colorStops:gradient.colors.map((color,index)=>({offset:index/(gradient.colors.length-1),color}))});
  }else surface.backgroundColor=page.background;
  surface.setViewportTransform([thumbnailWidth/width,0,0,thumbnailHeight/height,0,0]);surface.renderAll();
  signal?.throwIfAborted();return surface.toDataURL({format:'png',multiplier:1});
 }finally{await surface.dispose();}
}

export async function recoverDesignThumbnail(record:SavedDesign,signal:AbortSignal,force=false):Promise<string|undefined>{
 // Startup autosave can finish while a legacy cover is loading its fonts.
 // Retry a superseded source once, using the latest lightweight summary.
 for(let attempt=0;attempt<2;attempt++){
  signal.throwIfAborted();const latest=await getDesignSummary(record.id);if(!latest||latest.deleted)return;
  if(!force&&!needsDesignThumbnail(latest))return latest.thumbnail;
  const source=await getDesignThumbnailSource(record.id,designPreviewRevision(latest));if(!source)continue;
  await previewFonts(source.project);signal.throwIfAborted();
  const thumbnail=await renderProjectThumbnail(source.project,signal);signal.throwIfAborted();
  if(await storeDesignThumbnail(source,thumbnail,signal))return thumbnail;
 }
}

type Watch={element:HTMLElement;record:SavedDesign;ready:(thumbnail:string)=>void;visible:boolean;force:boolean};
/** One shared observer and at most one full-project read/render at a time. Jobs
 * disappear when cards scroll away, filters change, or Home unmounts. */
export class VisibleDesignThumbnails{
 private observer?:IntersectionObserver;
 private watches=new Map<HTMLElement,Watch>();
 private attempted=new Set<string>();
 private running?:{watch:Watch;controller:AbortController;key:string};
 private scheduled?:ReturnType<typeof setTimeout>;
 private key(watch:Watch){return`${watch.record.id}:${designPreviewRevision(watch.record)}:${watch.force?'repair':'missing'}`;}
 watch(element:HTMLElement,record:SavedDesign,ready:Watch['ready'],force=false):()=>void{
  const watch:Watch={element,record,ready,visible:false,force};this.watches.set(element,watch);
  if(!this.observer)this.observer=new IntersectionObserver(entries=>{for(const entry of entries){const value=this.watches.get(entry.target as HTMLElement);if(!value)continue;value.visible=entry.isIntersecting;if(!value.visible&&this.running?.watch===value)this.running.controller.abort();}this.schedule();},{root:element.closest('.home-content'),rootMargin:'80px 0px'});
  this.observer.observe(element);
  return()=>{this.observer?.unobserve(element);this.watches.delete(element);if(this.running?.watch===watch)this.running.controller.abort();};
 }
 private schedule(){if(this.running||this.scheduled!==undefined)return;this.scheduled=setTimeout(()=>{this.scheduled=undefined;void this.run();},0);}
 private async run(){
  if(this.running)return;
  const watch=[...this.watches.values()].find(watch=>watch.visible&&(watch.force||needsDesignThumbnail(watch.record))&&!this.attempted.has(this.key(watch)));
  if(!watch)return;
  const key=this.key(watch),controller=new AbortController();this.running={watch,controller,key};this.attempted.add(key);
  while(this.attempted.size>128)this.attempted.delete(this.attempted.values().next().value!);
  try{
   const thumbnail=await recoverDesignThumbnail(watch.record,AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),watch.force);
   if(thumbnail&&!controller.signal.aborted&&this.watches.get(watch.element)===watch)watch.ready(thumbnail);
  }catch{/* A broken individual design must not block the remaining visible cards. */}
  finally{if(controller.signal.aborted)this.attempted.delete(key);this.running=undefined;this.schedule();}
 }
 dispose(){this.observer?.disconnect();this.observer=undefined;this.watches.clear();this.running?.controller.abort();if(this.scheduled!==undefined)clearTimeout(this.scheduled);this.scheduled=undefined;this.attempted.clear();}
}
