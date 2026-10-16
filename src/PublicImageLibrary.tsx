import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,ArrowRight,Check,Download,ExternalLink,Image as ImageIcon,LoaderCircle,MoreHorizontal,Plus,RefreshCw,Search,X} from 'lucide-react';
import {desktop,saveExport,type PublicImage,type PublicImageResult} from './bridge';
import {getPublicImage,isPublicImageAbort,searchPublicImages,type PublicImageLicense} from './public-images';
import './public-image-library.css';

export interface PublicImageInsertOptions {signal?:AbortSignal;prepared?:PublicImageResult}
export interface PublicImageLibraryProps {
  onInsert:(image:PublicImage,options?:PublicImageInsertOptions)=>void|Promise<void>;
  onNotify?:(message:string)=>void;
  query?:string;onQueryChange?:(query:string)=>void;showSearch?:boolean;
  onPreviewChange?:(open:boolean)=>void;
}
const SUGGESTIONS=['Nature','Architecture','Flowers','Space','Textures','Vintage'];
const LICENSES:[PublicImageLicense,string][]=[['all','All'],['public-domain','Public domain'],['cc0','CC0']];
const message=(error:unknown)=>error instanceof Error?error.message:'The photo library is unavailable.';

function PhotoCard({image,onPreview,onInsert}:{image:PublicImage;onPreview:(image:PublicImage,button:HTMLElement)=>void;onInsert:(image:PublicImage)=>void}){
  const root=useRef<HTMLElement>(null),[visible,setVisible]=useState(false),[data,setData]=useState(''),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!root.current)return;
    if(!('IntersectionObserver'in window)){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});
    observer.observe(root.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!visible)return;
    const controller=new AbortController();setError(false);
    void getPublicImage({id:image.id,size:'thumbnail'},controller.signal).then(result=>setData(result.data)).catch(reason=>{if(!isPublicImageAbort(reason))setError(true);});
    return()=>controller.abort();
  },[image.id,visible,retry]);
  const ratio=Math.max(.6,Math.min(1.65,(image.width||1)/(image.height||1)));
  return <article ref={root} className="public-photo-card" style={{aspectRatio:String(ratio)}}>
    <button className="public-photo-image" aria-label={`Add ${image.name} photo to canvas`} draggable={Boolean(data)} onClick={()=>onInsert(image)} onDragStart={event=>{
      if(!data){event.preventDefault();return;}
      event.dataTransfer.setData('text/visro-public-image',JSON.stringify({id:image.id}));event.dataTransfer.effectAllowed='copy';
    }}>{data?<img src={data} alt={image.name} draggable={false} decoding="async"/>:<span className={`public-photo-placeholder ${error?'failed':''}`}>{error?<ImageIcon size={24}/>:<LoaderCircle className="spin" size={20}/>}</span>}<span className="public-photo-caption">{image.name}</span></button>
    <button className="public-photo-add public-photo-details" title={`More information about ${image.name}`} aria-label={`More information about ${image.name}`} onClick={event=>onPreview(image,event.currentTarget)}><MoreHorizontal size={18}/></button>
    {error&&<button className="public-photo-add public-photo-retry" title={`Retry preview for ${image.name}`} aria-label={`Retry ${image.name}`} onClick={()=>setRetry(value=>value+1)}><RefreshCw size={15}/></button>}
    <span className="public-photo-license">{image.license}</span>
  </article>;
}

function PhotoPreview({image,onClose,onInsert,onNotify}:{image:PublicImage;onClose:()=>void;onInsert:PublicImageLibraryProps['onInsert'];onNotify:PublicImageLibraryProps['onNotify']}){
  const [photo,setPhoto]=useState<PublicImageResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState<'image'|'insert'|'download'|''>('image');
  const dialog=useRef<HTMLElement>(null),operation=useRef<AbortController|null>(null),fullPhoto=useRef<PublicImageResult|null>(null);
  useEffect(()=>{
    const controller=new AbortController();operation.current=controller;fullPhoto.current=null;
    void getPublicImage({id:image.id,size:'thumbnail'},controller.signal).then(result=>setPhoto(previous=>previous??result)).catch(()=>undefined);
    void getPublicImage({id:image.id,size:'image'},controller.signal).then(result=>{fullPhoto.current=result;setPhoto(result);setBusy('');}).catch(reason=>{if(!isPublicImageAbort(reason)){setError(message(reason));setBusy('');}});
    return()=>controller.abort();
  },[image.id]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();return;}
      if(event.key==='Tab'){
        const buttons=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')||[]),first=buttons[0],last=buttons.at(-1);
        if(first&&event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
      event.stopPropagation();
    };
    window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('keydown',key,true);operation.current?.abort();if(previous?.isConnected)previous.focus();};
  },[onClose]);
  const run=async(kind:'insert'|'download')=>{
    operation.current?.abort();const controller=new AbortController();operation.current=controller;setBusy(kind);setError('');
    try{
      const ready=fullPhoto.current??await getPublicImage({id:image.id,size:'image'},controller.signal);
      if(controller.signal.aborted)return;
      fullPhoto.current=ready;setPhoto(ready);
      if(kind==='insert'){await onInsert(image,{signal:controller.signal,prepared:ready});if(!controller.signal.aborted)onClose();}
      else{const format=ready.mime==='image/jpeg'?'jpg':ready.mime.split('/')[1]||'png';await saveExport(image.name.replace(/\.[a-z0-9]+$/i,''),format,ready.data);if(!controller.signal.aborted)onNotify?.('Photo downloaded.');}
    }catch(reason){if(!isPublicImageAbort(reason))setError(message(reason));}
    finally{if(!controller.signal.aborted)setBusy('');}
  };
  const open=(url:string)=>{if(!/^https:\/\//i.test(url))return;if(desktop)void desktop.openExternal(url).catch(reason=>setError(message(reason)));else window.open(url,'_blank','noopener,noreferrer');};
  return createPortal(<div className="public-photo-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={dialog} className="public-photo-detail" role="dialog" aria-modal="true" aria-label={`${image.name} photo preview`}>
    <button className="icon-button public-photo-close" aria-label="Close photo preview" onClick={onClose}><X size={21}/></button>
    <div className="public-photo-detail-art">{photo?<img src={photo.data} alt={image.name}/>:<LoaderCircle className="spin" size={30}/>}<span className="public-photo-detail-license"><Check size={13}/>{image.license}</span></div>
    <div className="public-photo-detail-info"><span className="eyebrow">Wikimedia Commons</span><h2>{image.name}</h2>{image.artist&&<p className="public-photo-artist">{image.artist}</p>}<p className="public-photo-dimensions">{image.width.toLocaleString()} × {image.height.toLocaleString()} px original</p>{fullPhoto.current&&(fullPhoto.current.imageWidth!==image.width||fullPhoto.current.imageHeight!==image.height)&&<p className="public-photo-dimensions">{fullPhoto.current.imageWidth.toLocaleString()} × {fullPhoto.current.imageHeight.toLocaleString()} px download</p>}{image.description&&<p className="public-photo-description">{image.description}</p>}
      <div className="public-photo-source-links"><button onClick={()=>open(image.sourceUrl)}><ExternalLink size={14}/>View source</button><button onClick={()=>open(image.licenseUrl)}><Check size={14}/>{image.license}</button></div>
      {image.restrictions&&<p className="public-photo-restrictions">{Array.isArray(image.restrictions)?image.restrictions.join(' · '):image.restrictions}</p>}
      <div className="public-photo-detail-actions"><button className="full-button coral" disabled={Boolean(busy)} onClick={()=>void run('insert')}><Plus size={17}/>Add to design</button><button className="full-button" disabled={Boolean(busy)} onClick={()=>void run('download')}><Download size={17}/>Download photo</button></div>
      {busy&&<div className="public-photo-progress" role="status"><LoaderCircle className="spin" size={16}/><span>{busy==='image'?'Loading photo…':busy==='insert'?'Adding photo…':'Preparing download…'}</span><button onClick={()=>{operation.current?.abort();setBusy('');}}>Cancel</button></div>}
      {error&&<p className="public-photo-error" role="alert">{error}</p>}
    </div>
  </section></div>,document.body);
}

export function PublicImageLibrary({onInsert,onNotify,query,onQueryChange,showSearch=true,onPreviewChange}:PublicImageLibraryProps){
  const [draft,setDraft]=useState(''),[license,setLicense]=useState<PublicImageLicense>('all'),[offset,setOffset]=useState(0),[history,setHistory]=useState<number[]>([]),[nextOffset,setNextOffset]=useState<number|null>(null);
  const [items,setItems]=useState<PublicImage[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<PublicImage|null>(null),[retry,setRetry]=useState(0),[inserting,setInserting]=useState<string|null>(null);
  const controller=useRef<AbortController|null>(null),insertion=useRef<AbortController|null>(null),focusOrigin=useRef<HTMLElement|null>(null),previewCallback=useRef(onPreviewChange);
  previewCallback.current=onPreviewChange;
  const value=query??draft,effective=value.trim()||'nature';
  const setQuery=(text:string)=>{setDraft(text);onQueryChange?.(text);};
  useEffect(()=>{setOffset(0);setHistory([]);},[effective,license]);
  useEffect(()=>{
    const abort=new AbortController();controller.current=abort;setLoading(true);setError('');
    const timer=setTimeout(()=>{void searchPublicImages({query:effective,license,offset,limit:24},abort.signal).then(result=>{setItems(result.items);setNextOffset(result.nextOffset);setLoading(false);}).catch(reason=>{if(!isPublicImageAbort(reason)){setError(message(reason));setLoading(false);}});},350);
    return()=>{clearTimeout(timer);abort.abort();};
  },[effective,license,offset,retry]);
  useEffect(()=>()=>insertion.current?.abort(),[]);
  const hasPreview=Boolean(preview);
  useEffect(()=>{previewCallback.current?.(hasPreview);return()=>previewCallback.current?.(false);},[hasPreview]);
  const closePreview=useCallback(()=>{setPreview(null);if(focusOrigin.current?.isConnected)focusOrigin.current.focus();},[]);
  const add=async(image:PublicImage)=>{
    insertion.current?.abort();const abort=new AbortController();insertion.current=abort;setInserting(image.id);setError('');
    try{await onInsert(image,{signal:abort.signal});}catch(reason){if(!isPublicImageAbort(reason))setError(message(reason));}finally{if(insertion.current===abort)setInserting(null);}
  };
  return <section className="public-image-library" aria-label="Public-domain photo library" onKeyDown={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&(event.key==='Enter'||event.key===' ')&&(event.target as HTMLElement).closest('button,a,[role="button"]'))event.stopPropagation();}}>
    {showSearch&&<form className="public-photo-search" onSubmit={event=>{event.preventDefault();setRetry(number=>number+1);}}><Search size={18}/><input aria-label="Search public-domain photos" placeholder="Search public-domain photos" value={value} maxLength={120} onChange={event=>setQuery(event.target.value)}/>{value&&<button type="button" aria-label="Clear photo search" onClick={()=>setQuery('')}><X size={16}/></button>}</form>}
    <div className="public-photo-suggestions" aria-label="Photo search suggestions">{SUGGESTIONS.map(suggestion=><button key={suggestion} className={value.toLowerCase()===suggestion.toLowerCase()?'active':''} onClick={()=>setQuery(suggestion)}>{suggestion}</button>)}</div>
    <div className="public-photo-filters" aria-label="Photo licenses">{LICENSES.map(([id,label])=><button key={id} aria-pressed={license===id} onClick={()=>setLicense(id)}>{label}</button>)}</div>
    <div className="public-photo-heading"><h3>{value.trim()?`Photos for “${value.trim()}”`:'Explore photos'}</h3><span>Showing {items.length}</span></div>
    <p className="public-photo-help">Click or drag to add. Use … for details.</p>
    {loading&&<div className="public-photo-search-progress" role="status"><LoaderCircle className="spin" size={16}/><span>Searching Wikimedia Commons…</span><button onClick={()=>{controller.current?.abort();setLoading(false);}}>Cancel</button></div>}
    {error&&<div className="public-photo-error" role="alert"><p>{error}</p><button onClick={()=>setRetry(number=>number+1)}>Try again</button></div>}
    <div className={`public-photo-grid ${loading?'searching':''}`} aria-busy={loading}>{items.map(image=><PhotoCard key={image.id} image={image} onPreview={(photo,button)=>{focusOrigin.current=button;setPreview(photo);}} onInsert={image=>void add(image)}/>)}</div>
    {!loading&&!error&&!items.length&&<div className="public-photo-empty"><ImageIcon size={32}/><h3>No matching photos</h3><p>Try another keyword or a different license filter.</p></div>}
    {inserting&&<div className="public-photo-search-progress" role="status"><LoaderCircle className="spin" size={16}/><span>Adding photo…</span><button onClick={()=>{insertion.current?.abort();setInserting(null);}}>Cancel</button></div>}
    {(history.length>0||nextOffset!==null)&&<nav className="public-photo-pagination" aria-label="Photo results pages"><button disabled={loading||!history.length} onClick={()=>{setOffset(history.at(-1)||0);setHistory(previous=>previous.slice(0,-1));}}><ArrowLeft size={16}/>Previous</button><span>Page {history.length+1}</span><button disabled={loading||nextOffset===null} onClick={()=>{if(nextOffset!==null){setHistory(previous=>[...previous,offset]);setOffset(nextOffset);}}}>Next<ArrowRight size={16}/></button></nav>}
    <p className="public-photo-credit"><Check size={12}/>Public domain and CC0 · Wikimedia Commons</p>
    {preview&&<PhotoPreview image={preview} onClose={closePreview} onInsert={onInsert} onNotify={onNotify}/>}
  </section>;
}
