import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import type {CanvaImportReport} from './canva-import';

/** Export contents, including warnings, remain local to this import session. */
export function CanvaImportDialog({report,onClose,onChoose}:{report:CanvaImportReport|null;onClose:()=>void;onChoose:()=>void}){
 const ref=useRef<HTMLElement>(null),callbacks=useRef({onClose});callbacks.current={onClose};
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,dialog=ref.current;
  dialog?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();callbacks.current.onClose();return;}
   if(event.key==='Tab'){
    const buttons=Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]),first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
   // An editor shortcut must not insert or move art behind this dialog.
   event.stopImmediatePropagation();
  };
  const paste=(event:ClipboardEvent)=>{event.preventDefault();event.stopImmediatePropagation();};
  window.addEventListener('paste',paste,true);window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('paste',paste,true);window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus();};
 },[]);
 return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section ref={ref} className="modal canva-import-dialog" role="dialog" aria-modal="true" aria-labelledby="canva-import-title">
   <button className="modal-close icon-button" aria-label="Close Canva import" onClick={onClose}><X size={20}/></button>
   <h2 id="canva-import-title">{report?'Your design is ready to edit':'Import from Canva'}</h2>
   {report?<>
    <p>{report.pages} {report.pages===1?'page':'pages'} · {report.textLayers} text · {report.imageLayers} images · {report.vectorLayers} vectors · {report.groups} groups</p>
    <p className="small-hint">Layers included in the export are now local Visro objects. Review the design before making changes.</p>
    {report.issues.length>0&&<><h3>Import notes</h3><ul className="canva-import-notes">{report.issues.map((issue,index)=><li key={index}><strong>{issue.page>0?`Page ${issue.page}: `:''}</strong>{issue.detail}</li>)}</ul></>}
    <button className="full-button coral" onClick={onClose}>Start editing</button>
   </>:<>
    <p>Download your own design from Canva, then choose the exported file here.</p>
    <ol><li>For presentations, choose <strong>Share → Download → Microsoft PowerPoint (.pptx)</strong>.</li><li>For vector artwork, choose <strong>SVG</strong> when available.</li></ol>
    <p className="small-hint">Text, shapes, photos, groups and pages stay editable when the export includes them. Canva can flatten effects or outline fonts; Visro shows import notes for unsupported content. PNG, JPG and PDF do not recover the original layers. Canva links and private .canva files cannot be opened directly.</p>
    <button className="full-button coral" onClick={onChoose}>Choose PPTX or SVG</button>
   </>}
  </section>
 </div>;
}
