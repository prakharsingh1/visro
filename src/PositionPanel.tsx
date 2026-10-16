import {useEffect,useRef,useState} from "react";
import {X,ArrowUp,ArrowDown,Layers,Eye,EyeOff,Lock,Unlock,Type,Image as ImageIcon,Square} from "lucide-react";
import type {StudioEditor} from "./editor";
import type {EditorState,SelectionState,SelectionUpdate} from "./editor-types";

const formatPositionNumber=(value:number)=>String(Math.round(value*10000)/10000);
function PositionNumberField({label,value,min,max,disabled,onCommit}:{label:string;value:number;min:number;max:number;disabled:boolean;onCommit:(value:number)=>number|null}){
  const [draft,setDraft]=useState(()=>formatPositionNumber(value));
  const focused=useRef(false),dirty=useRef(false),latest=useRef(value),committer=useRef(onCommit);latest.current=value;
  useEffect(()=>{if(!focused.current)setDraft(formatPositionNumber(value));},[value]);
  const restore=()=>{dirty.current=false;setDraft(formatPositionNumber(latest.current));};
  const commit=()=>{
    focused.current=false;
    if(!dirty.current){restore();return;}
    dirty.current=false;
    const number=Number(draft.trim());
    if(!draft.trim()||!Number.isFinite(number)){restore();return;}
    const bounded=Math.max(min,Math.min(max,number));
    const applied=bounded===latest.current?latest.current:committer.current(bounded);
    setDraft(formatPositionNumber(applied??latest.current));
  };
  return <label className="field-label">{label}<input aria-label={`Position ${label}`} type="text" inputMode="decimal" role="spinbutton" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} disabled={disabled} value={draft}
    onFocus={()=>{focused.current=true;dirty.current=false;committer.current=onCommit;}}
    onChange={event=>{dirty.current=true;setDraft(event.target.value);}}
    onBlur={commit}
    onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();restore();event.currentTarget.blur();}
      else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();event.currentTarget.blur();}
      else if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){
        event.preventDefault();event.stopPropagation();const number=draft.trim()?Number(draft):latest.current;
        const step=(event.shiftKey?1:.1)*(event.key==='ArrowUp'?1:-1);dirty.current=true;setDraft(formatPositionNumber(Math.max(min,Math.min(max,(Number.isFinite(number)?number:latest.current)+step))));
      }
    }}/></label>;
}
export function PositionPanel({getEditor,state,selected,onClose,initialTab="arrange"}:{getEditor:()=>StudioEditor|null;state:EditorState;selected:SelectionState|null;onClose:()=>void;initialTab?:"arrange"|"layers"}) {
  const [tab,setTab]=useState<"arrange"|"layers">(initialTab),[ratio,setRatio]=useState(true);
  useEffect(()=>setTab(initialTab),[initialTab]);
  const object=getEditor()?.canvas.getActiveObject();
  const field=(label:string,value:number,property:'width'|'height'|'left'|'top'|'angle')=><PositionNumberField key={`${state.activePageId}:${selected?.id}:${property}`} label={label} value={value} min={property==='width'||property==='height'?1:property==='angle'?-36000:-1000000} max={property==='width'||property==='height'?100000:property==='angle'?36000:1000000} disabled={Boolean(selected?.locked)} onCommit={number=>{
    const studio=getEditor(),current=studio?.getSelected();
    if(!studio||!current||current.id!==selected?.id||studio.canvas.getActiveObject()!==object||current.locked)return null;
    const changes:SelectionUpdate={[property]:number};
    if(ratio&&(property==='width'||property==='height')&&current.width>0&&current.height>0){
      const lower=Math.max(1/current.width,1/current.height),upper=Math.min(100000/current.width,100000/current.height);
      if(lower>upper)return null;
      const scale=Math.max(lower,Math.min(number/current[property],upper));
      changes.width=current.width*scale;changes.height=current.height*scale;
    }
    studio.updateSelected(changes);return changes[property] as number;
  }}/>;
  return <aside className="inspector"><div className="inspector-heading"><h3>Position</h3><button className="icon-button" aria-label="Close position panel" onClick={onClose}><X size={20}/></button></div><div className="position-tabs"><button className={tab==="arrange"?"active":""} onClick={()=>setTab("arrange")}>Arrange</button><button className={tab==="layers"?"active":""} onClick={()=>setTab("layers")}>Layers</button></div><div className="inspector-scroll">
  {tab==="arrange"?<><div className="position-actions">{([['up','Forward'],['down','Backward'],['front','To front'],['back','To back']] as const).map(([action,label])=><button disabled={!selected} key={action} onClick={()=>getEditor()?.arrange(action)}>{action==="up"||action==="front"?<ArrowUp size={20}/>:<ArrowDown size={20}/>} {label}</button>)}</div><h4>Align to page</h4><div className="position-actions">{(['top','left','middle','center','bottom','right'] as const).map(a=><button key={a} disabled={!selected} onClick={()=>getEditor()?.align(a)}><span className={`alignment-symbol alignment-${a}`}>{a==='top'?'↥':a==='bottom'?'↧':a==='left'?'⇤':a==='right'?'⇥':a==='middle'?'↕':'↔'}</span>{a==='center'?'Center':a[0].toUpperCase()+a.slice(1)}</button>)}</div>{selected&&selected.count>=3&&<><h4>Space evenly</h4><div className="position-actions"><button onClick={()=>getEditor()?.distribute('horizontal')}>Horizontally</button><button onClick={()=>getEditor()?.distribute('vertical')}>Vertically</button></div></>}
  <h4>Advanced</h4>{selected?<div className="position-fields">{field('Width',selected.width,'width')}{field('Height',selected.height,'height')}<label className="field-label">Ratio<button className="ratio-button" aria-label="Lock aspect ratio" aria-pressed={ratio} onClick={()=>setRatio(!ratio)}>{ratio?<Lock size={22}/>:<Unlock size={22}/>}</button></label>{field('X',selected.left,'left')}{field('Y',selected.top,'top')}{field('Rotate',selected.angle,'angle')}</div>:<p className="small-hint">Select an element to arrange or change its position.</p>}</>:
  <div className="layer-list">{state.layers.map(layer=><div key={layer.id} className={`layer-row ${layer.selected?'active':''}`} draggable onDragStart={e=>e.dataTransfer.setData('text/visro-layer',layer.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData('text/visro-layer');if(source&&source!==layer.id)getEditor()?.reorderLayer(source,layer.id);}}><button className="layer-select" onClick={()=>getEditor()?.selectLayer(layer.id)}><span className="layer-icon">{layer.type==='text'?<Type size={18}/>:layer.type==='image'?<ImageIcon size={18}/>:layer.type==='group'?<Layers size={18}/>:<Square size={18}/>}</span><span>{layer.name}</span></button><button aria-label={layer.visible?'Hide layer':'Show layer'} onClick={()=>getEditor()?.setLayerVisibility(layer.id,!layer.visible)}>{layer.visible?<Eye size={16}/>:<EyeOff size={16}/>}</button><button aria-label={layer.locked?'Unlock layer':'Lock layer'} onClick={()=>getEditor()?.setLayerLocked(layer.id,!layer.locked)}>{layer.locked?<Lock size={16}/>:<Unlock size={16}/>}</button></div>)}</div>}
  </div></aside>;
}
