import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {ArrowDown,ArrowUp,Copy,Plus,Trash2} from 'lucide-react';
import type {StudioEditor} from './editor';
import type {EditorState} from './editor-types';
import {pageStackLayout,pageStackPosition,stackScrollForPage,stackZoomScroll,visibleStackPage,visibleStackRange,type PageStackLayout} from './page-layout';
import './continuous-pages.css';

/** One live Fabric viewport, with independent offscreen previews for adjacent pages.
 * The native scroll container moves view state; it never activates a page or edits history. */
export function ContinuousPages({getEditor,viewportRef,state,enabled,projectKey,interacting,thumbnails,onVisiblePage,onNotify,readOnly=false,navigateRef,onPreview}:{getEditor:()=>StudioEditor|null;viewportRef:RefObject<HTMLDivElement|null>;state:EditorState;enabled:boolean;projectKey:string;interacting:RefObject<boolean>;thumbnails:Record<string,string>;onVisiblePage:(index:number)=>void;onNotify:(message:string)=>void;readOnly?:boolean;navigateRef?:RefObject<((id:string)=>Promise<void>)|null>;onPreview?:(id:string,data:string,projectKey:string)=>void}){
  const [layout,setLayout]=useState<PageStackLayout|null>(null),[range,setRange]=useState({start:0,end:0}),[images,setImages]=useState<Record<string,string>>({}),[footerIds,setFooterIds]=useState<string[]>([]);
  const spacer=useRef<HTMLDivElement>(null),geometry=useRef<PageStackLayout|null>(null),active=useRef(''),preservingScroll=useRef(false),programmaticScroll=useRef<{left:number;top:number}|null>(null),generation=useRef(0),navigation=useRef(0),lastVisible=useRef(-1),gestureCleanup=useRef<(()=>void)|null>(null),cache=useRef(new Map<string,{revision:number;data:string;scale:number}>());
  const renderedRange=useRef({start:-1,end:-1}),publishedPreviews=useRef(new WeakMap<HTMLImageElement,string>()),publishedFooter=useRef(new Map<string,number>());
  const current=useRef({state,onVisiblePage,onNotify,enabled,readOnly,onPreview});current.current={state,onVisiblePage,onNotify,enabled,readOnly,onPreview};
  const updateVisible=(shape:PageStackLayout,scroll:number)=>{const next=visibleStackRange(shape,scroll);if(next.start!==renderedRange.current.start||next.end!==renderedRange.current.end){renderedRange.current=next;setRange(next);}const index=visibleStackPage(shape,scroll);if(lastVisible.current===index)return;lastVisible.current=index;current.current.onVisiblePage(index);};
  // Reset before the layout synchronizer below. A passive reset runs after its
  // first synchronization and mistakes a replacement project for page navigation,
  // preserving the old horizontal scroll and moving the freshly fitted canvas.
  useLayoutEffect(()=>{generation.current++;navigation.current++;preservingScroll.current=false;programmaticScroll.current=null;cache.current.clear();publishedPreviews.current=new WeakMap();publishedFooter.current.clear();setImages({});setFooterIds([]);active.current='';lastVisible.current=-1;return()=>{generation.current++;navigation.current++;gestureCleanup.current?.();};},[projectKey]);
  const pageIdsKey=state.pages.map(page=>page.id).join('\0');
  useEffect(()=>{
    const strip=viewportRef.current?.closest('main')?.querySelector<HTMLElement>('.page-strip');if(!enabled||!strip)return;
    const visible=new Set<string>(),order=current.current.state.pages.map(page=>page.id);
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=(entry.target as HTMLElement).dataset.previewPageId;if(!id)continue;if(entry.isIntersecting&&entry.intersectionRect.width>1&&entry.intersectionRect.height>1)visible.add(id);else visible.delete(id);}const next=order.filter(id=>visible.has(id));setFooterIds(previous=>previous.length===next.length&&previous.every((id,index)=>id===next[index])?previous:next);},{root:strip});
    for(const button of strip.querySelectorAll<HTMLElement>('[data-preview-page-id]'))observer.observe(button);
    return()=>observer.disconnect();
  },[enabled,projectKey,pageIdsKey,viewportRef]);
  useLayoutEffect(()=>{
    const studio=getEditor(),node=viewportRef.current;if(!enabled||!studio||!node)return;
    node.classList.add('continuous-document');
    const synchronize=()=>{
      if(!current.current.enabled)return;
      const pages=current.current.state.pages,pageId=studio.activePageId,index=pages.findIndex(page=>page.id===pageId),v=studio.canvas.viewportTransform;if(index<0)return;
      const next=pageStackLayout(studio.width,studio.height,v[0],node.clientWidth,node.clientHeight,pages.length);
      const changedPage=active.current!==pageId;
      if(spacer.current){spacer.current.style.height=`${Math.max(0,next.contentHeight-node.clientHeight)}px`;spacer.current.style.width=`${next.contentWidth}px`;}
      const left=next.paddingX-v[4],top=next.paddingY+index*next.pitch-v[5];
      geometry.current=next;
      // Explicit navigation reveals the chosen page. Clicking an already visible
      // neighbour keeps the exact scroll offset under the pointer.
      const oldLeft=node.scrollLeft,oldTop=node.scrollTop;
      if(changedPage&&active.current&&!preservingScroll.current)node.scrollTop=stackScrollForPage(next,index);
      else if(!changedPage||!active.current){node.scrollLeft=left;node.scrollTop=top;}
      if(oldLeft!==node.scrollLeft||oldTop!==node.scrollTop)programmaticScroll.current={left:node.scrollLeft,top:node.scrollTop};
      active.current=pageId;
      const position=pageStackPosition(next,index,node.scrollLeft,node.scrollTop);
      if(Math.abs(position.left-v[4])>.1||Math.abs(position.top-v[5])>.1)studio.pan(position.left-v[4],position.top-v[5]);
      setLayout(previous=>previous&&Object.keys(next).every(key=>next[key as keyof PageStackLayout]===previous[key as keyof PageStackLayout])?previous:next);
      updateVisible(next,node.scrollTop);
    };
    const scroll=()=>{const shape=geometry.current;if(!shape)return;const written=programmaticScroll.current;programmaticScroll.current=null;
      // Native scroll events arrive after a pan has written scrollTop. A newer
      // pointer move may already have advanced the canvas; do not rewind it to
      // that older write when the matching programmatic scroll event arrives.
      if(written&&written.left===node.scrollLeft&&written.top===node.scrollTop){updateVisible(shape,node.scrollTop);return;}
      const index=current.current.state.pages.findIndex(page=>page.id===studio.activePageId);if(index<0)return;const position=pageStackPosition(shape,index,node.scrollLeft,node.scrollTop),v=studio.canvas.viewportTransform;if(Math.abs(position.left-v[4])>.1||Math.abs(position.top-v[5])>.1)studio.pan(position.left-v[4],position.top-v[5]);updateVisible(shape,node.scrollTop);};
    const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();event.stopPropagation();const previous=geometry.current;if(!previous)return;const box=node.getBoundingClientRect(),point={x:event.clientX-box.left,y:event.clientY-box.top},zoom=Math.max(.02,Math.min(8,studio.canvas.getZoom()*Math.exp(-event.deltaY*.003))),pages=current.current.state.pages,index=pages.findIndex(page=>page.id===studio.activePageId);if(index<0)return;
      const next=pageStackLayout(studio.width,studio.height,zoom,node.clientWidth,node.clientHeight,pages.length),scroll=stackZoomScroll(previous,next,node.scrollLeft,node.scrollTop,point);
      // Grow scroll extent before writing its new offsets, so native clamping
      // cannot discard a pointer anchor while zooming into a later page.
      if(spacer.current){spacer.current.style.height=`${Math.max(0,next.contentHeight-node.clientHeight)}px`;spacer.current.style.width=`${next.contentWidth}px`;}
      studio.zoomAt(zoom,point);geometry.current=next;node.scrollLeft=scroll.left;node.scrollTop=scroll.top;programmaticScroll.current={left:node.scrollLeft,top:node.scrollTop};
      const position=pageStackPosition(next,index,node.scrollLeft,node.scrollTop),v=studio.canvas.viewportTransform;studio.pan(position.left-v[4],position.top-v[5]);setLayout(next);updateVisible(next,node.scrollTop);
    };
    const off=studio.canvas.on('after:render',event=>{if(event.ctx.canvas===studio.canvas.lowerCanvasEl)synchronize();});
    node.addEventListener('scroll',scroll,{passive:true});node.addEventListener('wheel',wheel,{passive:false,capture:true});
    synchronize();
    return()=>{off();node.removeEventListener('scroll',scroll);node.removeEventListener('wheel',wheel,true);node.classList.remove('continuous-document');};
  },[enabled,getEditor,viewportRef,projectKey]);
  // Structural page changes also need layout before the next user gesture.
  useEffect(()=>{if(enabled)getEditor()?.canvas.requestRenderAll();},[state.pages.length,state.activePageId,state.width,state.height,enabled,getEditor]);
  useEffect(()=>{
    if(!enabled||!layout)return;let cancelled=false,idle:number|undefined,timer:ReturnType<typeof setTimeout>|undefined,needsResume=false;const epoch=generation.current,abort=new AbortController();
    const run=async()=>{
      const studio=getEditor();if(!studio||cancelled)return;if(interacting.current){needsResume=true;return;}needsResume=false;
      const fullIds=new Set([...state.pages.slice(range.start,range.end+1).map(page=>page.id),state.activePageId]),footer=new Set(footerIds),ids=[...new Set([...fullIds,...footer])];
      const maximum=Math.max(state.width,state.height),smallFactor=Math.min(.5,128/maximum),factor=Math.max(smallFactor,Math.min(.5,1.5*layout.pageWidth/state.width,600/maximum));
      const valid=()=>!cancelled&&epoch===generation.current&&getEditor()===studio&&current.current.state.revision===state.revision;
      const publishSmall=async(id:string,entry:{revision:number;data:string;scale:number})=>{
        if(!footer.has(id)||publishedFooter.current.get(id)===entry.revision||!current.current.onPreview||!valid())return;
        let data=entry.data;
        // Small footer-only previews can be published without another decode.
        // Reuse larger cached previews rather than rendering their page again.
        if(entry.scale*maximum>128.01){const image=new Image();image.src=data;await image.decode();if(!valid()||cache.current.get(id)!==entry)return;const output=document.createElement('canvas'),scale=128/Math.max(image.naturalWidth,image.naturalHeight);output.width=Math.max(1,Math.round(image.naturalWidth*scale));output.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=output.getContext('2d');if(!context)return;context.fillStyle='#fff';context.fillRect(0,0,output.width,output.height);context.drawImage(image,0,0,output.width,output.height);data=output.toDataURL('image/jpeg',.7);}
        if(!valid()||cache.current.get(id)!==entry)return;current.current.onPreview?.(id,data,projectKey);publishedFooter.current.set(id,entry.revision);
      };
      for(const id of ids){if(!valid())return;if(interacting.current){needsResume=true;return;}const targetFactor=fullIds.has(id)?factor:smallFactor,known=cache.current.get(id);if(known?.revision===state.revision&&known.scale>=targetFactor-.00001){try{await publishSmall(id,known);}catch{}continue;}
        try{const data=await studio.previewPage(id,targetFactor,abort.signal);if(!valid())return;const entry={revision:state.revision,data,scale:targetFactor};cache.current.delete(id);cache.current.set(id,entry);let bytes=[...cache.current.values()].reduce((sum,item)=>sum+item.data.length*2,0);while(cache.current.size>Math.max(16,ids.length)||bytes>12*1024*1024){const oldest=cache.current.keys().next().value!;bytes-=cache.current.get(oldest)!.data.length*2;cache.current.delete(oldest);}setImages(Object.fromEntries([...cache.current].map(([key,item])=>[key,item.data])));await publishSmall(id,entry);}catch{/* The live page remains editable when a preview is unavailable. */}
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      }
    };
    const schedule=(delay:number)=>{if(cancelled||timer!==undefined||idle!==undefined)return;timer=setTimeout(()=>{timer=undefined;if('requestIdleCallback'in window)idle=window.requestIdleCallback(()=>{idle=undefined;void run();},{timeout:1000});else void run();},delay);};
    // A stationary Space-pan can span the warm-up deadline without changing a
    // revision or layout. Resume its paused batch from the release event, after
    // the parent pointer handler has cleared the shared interaction ref. Keep
    // one pending task rather than polling for the entire held gesture.
    const resume=()=>{if(needsResume)schedule(80);};
    for(const event of ['pointerup','pointercancel','mouseup','blur'])window.addEventListener(event,resume);
    schedule(600);
    return()=>{cancelled=true;abort.abort();if(timer!==undefined)clearTimeout(timer);if(idle!==undefined&&'cancelIdleCallback'in window)window.cancelIdleCallback(idle);for(const event of ['pointerup','pointercancel','mouseup','blur'])window.removeEventListener(event,resume);};
  },[enabled,layout?.pageWidth,layout?.pageHeight,range.start,range.end,footerIds,state.revision,state.activePageId,state.width,state.height,state.pages,getEditor,interacting,projectKey]);
  const activate=async(id:string,event?:React.PointerEvent)=>{
    if(event&&event.button!==0)return;
    event?.preventDefault();event?.stopPropagation();const studio=getEditor(),node=viewportRef.current;if(!studio||!node||id===studio.getState().activePageId)return;
    const epoch=generation.current,token=++navigation.current,start=event?{x:event.clientX,y:event.clientY}:null,modifiers={metaKey:event?.metaKey,ctrlKey:event?.ctrlKey,altKey:event?.altKey,shiftKey:event?.shiftKey};let held=Boolean(event),latest=start,resumed=false;
    preservingScroll.current=true;gestureCleanup.current?.();
    const move=(next:PointerEvent)=>{if(next.pointerId===event?.pointerId){latest={x:next.clientX,y:next.clientY};if(resumed)document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,cancelable:true,button:0,buttons:1,clientX:next.clientX,clientY:next.clientY,...modifiers}));}};
    const release=(next:PointerEvent)=>{if(next.pointerId===event?.pointerId){latest={x:next.clientX,y:next.clientY};cleanup();}};
    const cleanup=()=>{held=false;if(resumed){resumed=false;document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,buttons:0,clientX:latest?.x??0,clientY:latest?.y??0,...modifiers}));}document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',release,true);document.removeEventListener('pointercancel',release,true);window.removeEventListener('blur',cleanup);interacting.current=false;node.classList.remove('interacting');if(gestureCleanup.current===cleanup)gestureCleanup.current=null;};
    if(event){gestureCleanup.current=cleanup;interacting.current=true;node.classList.add('interacting');document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',release,true);document.addEventListener('pointercancel',release,true);window.addEventListener('blur',cleanup);}
    try{await studio.setPage(id);if(epoch!==generation.current||token!==navigation.current||getEditor()!==studio||studio.getState().activePageId!==id)return;const shape=geometry.current,index=studio.getState().pages.findIndex(page=>page.id===id);if(shape){const position=pageStackPosition(shape,index,node.scrollLeft,node.scrollTop),v=studio.canvas.viewportTransform;studio.pan(position.left-v[4],position.top-v[5]);}active.current=id;studio.canvas.calcOffset();
      if(start&&!current.current.readOnly){if(held){const options={bubbles:true,cancelable:true,button:0,buttons:1,...modifiers};resumed=true;studio.canvas.upperCanvasEl.dispatchEvent(new MouseEvent('mousedown',{...options,clientX:start.x,clientY:start.y}));if(latest&&(latest.x!==start.x||latest.y!==start.y))document.dispatchEvent(new MouseEvent('mousemove',{...options,clientX:latest.x,clientY:latest.y}));}else{const box=node.getBoundingClientRect();studio.selectAt({x:start.x-box.left,y:start.y-box.top});}}
      studio.canvas.upperCanvasEl.tabIndex=0;studio.canvas.upperCanvasEl.focus({preventScroll:true});
    }catch(error){if(epoch===generation.current&&token===navigation.current)current.current.onNotify(error instanceof Error?error.message:'This page could not be opened.');}
    finally{if(token===navigation.current)preservingScroll.current=false;}
  };
  useLayoutEffect(()=>{if(!navigateRef||!enabled)return;const navigate=(id:string)=>activate(id);navigateRef.current=navigate;return()=>{if(navigateRef.current===navigate)navigateRef.current=null;};},[navigateRef,enabled,getEditor,projectKey]);
  const pageAction=(job:(studio:StudioEditor)=>void|Promise<void>)=>{const studio=getEditor();if(!studio||current.current.readOnly)return;const epoch=generation.current;Promise.resolve().then(()=>job(studio)).catch(error=>{if(epoch===generation.current)current.current.onNotify(error instanceof Error?error.message:'This page could not be changed.');});};
  const publishPreview=(id:string,image:HTMLImageElement)=>{const source=images[id],known=cache.current.get(id);if(!source||!current.current.onPreview||known?.data!==source||known.revision!==current.current.state.revision||image.src!==source||!image.naturalWidth||publishedPreviews.current.get(image)===source)return;try{const canvas=document.createElement('canvas'),scale=128/Math.max(image.naturalWidth,image.naturalHeight);canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');if(!context)return;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);current.current.onPreview(id,canvas.toDataURL('image/jpeg',.7),projectKey);publishedPreviews.current.set(image,source);}catch{/* A missing small thumbnail cannot interrupt page rendering. */}};
  // A refreshed revision can have identical pixels/src, so its img may already
  // be decoded and not fire another load event. Publish that ready cache too.
  useEffect(()=>{for(const image of viewportRef.current?.querySelectorAll<HTMLImageElement>('.continuous-page-preview img')??[]){const id=image.closest<HTMLElement>('[data-page-id]')?.dataset.pageId;if(id&&image.complete)publishPreview(id,image);}},[images,state.revision,projectKey,onPreview,viewportRef]);
  const shown=layout?state.pages.map((page,index)=>({page,index})).filter(({index,page})=>index>=range.start&&index<=range.end||page.id===state.activePageId):[];
  return <><div ref={spacer} className="continuous-page-spacer" aria-hidden="true"/>{enabled&&layout&&<div className="continuous-page-stack" style={{width:layout.contentWidth,height:layout.contentHeight}}>{shown.map(({page,index})=><section key={page.id} data-page-id={page.id} data-page-width={state.width} data-page-height={state.height} className={`continuous-page ${page.id===state.activePageId?'active':''}`} style={{left:layout.paddingX,top:layout.paddingY+index*layout.pitch,width:layout.pageWidth,height:layout.pageHeight}} aria-label={`Page ${index+1}: ${page.name}`}>
    <div className="continuous-page-heading"><span>Page {index+1}{page.name&&page.name!==`Page ${index+1}`?` — ${page.name}`:''}</span><div>
      <button aria-label={`Move page ${index+1} up`} disabled={readOnly||!index} onClick={()=>pageAction(studio=>studio.movePage(page.id,-1))}><ArrowUp size={16}/></button>
      <button aria-label={`Move page ${index+1} down`} disabled={readOnly||index===state.pages.length-1} onClick={()=>pageAction(studio=>studio.movePage(page.id,1))}><ArrowDown size={16}/></button>
      <button aria-label={`Duplicate page ${index+1}`} disabled={readOnly} onClick={()=>pageAction(studio=>studio.duplicatePage(page.id))}><Copy size={16}/></button>
      <button aria-label={`Delete page ${index+1}`} disabled={readOnly||state.pages.length<2} onClick={()=>pageAction(studio=>studio.deletePage(page.id))}><Trash2 size={16}/></button>
      <button aria-label={`Add page after page ${index+1}`} disabled={readOnly} onClick={()=>pageAction(studio=>studio.addPageAfter(page.id))}><Plus size={17}/></button>
    </div></div>
    {page.id!==state.activePageId&&<button className="continuous-page-preview" aria-label={`Edit page ${index+1}`} onPointerDown={event=>void activate(page.id,event)} onClick={event=>{if(event.detail===0){event.preventDefault();void activate(page.id);}}}>{(images[page.id]||thumbnails[page.id])?<img src={images[page.id]||thumbnails[page.id]} alt="" draggable={false} onLoad={event=>publishPreview(page.id,event.currentTarget)}/>:<span>Page {index+1}</span>}</button>}
  </section>)}</div>}</>;
}
