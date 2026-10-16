import {useEffect,useId,useState} from 'react';
import {SHAPE_EFFECT_BASE_STYLES,SHAPE_EFFECT_PRESETS,normalizeShapeEffect,type ShapeEffect,type ShapeEffectPatch,type ShapeEffectPresetDefinition} from './shape-effects';
import './shape-effects.css';

function EffectRange({label,value,min=0,max=100,onChange}:{label:string;value:number;min?:number;max?:number;onChange:(value:number)=>void}){
  const[draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
  const bound=(next:number)=>Math.max(min,Math.min(max,next));
  return <div className="shape-effect-range"><span>{label}</span><div><input type="range" aria-label={`Effect ${label.toLowerCase()}`} min={min} max={max} step={1} value={value} onChange={event=>onChange(Number(event.target.value))}/><div className="shape-effect-stepper"><button type="button" aria-label={`Decrease effect ${label.toLowerCase()}`} disabled={value<=min} onClick={()=>onChange(bound(value-1))}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button><input type="number" aria-label={`Effect ${label.toLowerCase()} value`} min={min} max={max} step={1} value={draft} onChange={event=>{setDraft(event.target.value);const number=Number(event.target.value);if(event.target.value.trim()&&Number.isFinite(number))onChange(bound(number));}} onBlur={()=>{const number=Number(draft),next=Number.isFinite(number)&&draft.trim()?bound(number):value;setDraft(String(next));if(next!==value)onChange(next);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/><button type="button" aria-label={`Increase effect ${label.toLowerCase()}`} disabled={value>=max} onClick={()=>onChange(bound(value+1))}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M8 3v10"/></svg></button></div></div></div>;
}

function EffectPreview({preset}:{preset:ShapeEffectPresetDefinition}){
  const uid=useId().replace(/[^a-zA-Z0-9]/g,''),style=SHAPE_EFFECT_BASE_STYLES[preset.id],fill=style?.fill??'#8b3dff',stroke=style?.stroke??null,fx=preset.effect;
  const fillId=`shape-fill-${uid}`,strokeId=`shape-stroke-${uid}`,shadowId=`shape-shadow-${uid}`;
  const paint=(value:typeof fill,id:string)=>typeof value==='string'?value:`url(#${id})`;
  const gradient=(value:typeof fill,id:string)=>typeof value==='string'?null:value.type==='radial'?<radialGradient id={id}>{value.colors.map((color,index)=><stop key={index} offset={`${index/(value.colors.length-1)*100}%`} stopColor={color}/>)}</radialGradient>:<linearGradient id={id} x1="0" y1="0" x2="1" y2="0" gradientTransform={`rotate(${value.angle} .5 .5)`}>{value.colors.map((color,index)=><stop key={index} offset={`${index/(value.colors.length-1)*100}%`} stopColor={color}/>)}</linearGradient>;
  // Original demonstration artwork: a simple native vector lozenge. No source
  // graphic or thumbnail is taken from the reference application's assets.
  const shape='M31 28H65Q75 28 75 38V66Q75 76 65 76H31Q21 76 21 66V38Q21 28 31 28Z';
  return <svg viewBox="0 0 104 104" aria-hidden="true" focusable="false"><defs>{gradient(fill,fillId)}{stroke&&gradient(stroke,strokeId)}<filter id={shadowId} x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx={fx.type==='drop'?6:0} dy={fx.type==='drop'?6:0} stdDeviation={fx.type==='drop'?fx.blur/5:7} floodColor={fx.color} floodOpacity={fx.type==='drop'?fx.transparency/100:.75}/></filter></defs>
    {fx.type==='echo'&&<><path d={shape} transform="translate(12 12)" fill={fx.color} opacity=".25"/><path d={shape} transform="translate(6 6)" fill={fx.color} opacity=".5"/></>}
    {fx.type==='glitch'&&<><path d={shape} transform="translate(-5 -4)" fill={fx.color}/><path d={shape} transform="translate(5 4)" fill={fx.color2}/></>}
    <path d={shape} fill={paint(fill,fillId)} stroke={stroke?paint(stroke,strokeId):undefined} strokeWidth={stroke?3:0} filter={fx.type==='drop'||fx.type==='glow'?`url(#${shadowId})`:undefined}/>
  </svg>;
}

function EffectControls({effect,onChange}:{effect:ShapeEffect;onChange:(patch:ShapeEffectPatch)=>void}){
  return <div className="shape-effect-controls" aria-label={`${effect.type[0].toUpperCase()+effect.type.slice(1)} settings`}>
    {effect.type!=='glow'&&<><EffectRange label="Direction" value={effect.direction} min={-180} max={180} onChange={direction=>onChange({direction})}/><EffectRange label="Offset" value={effect.offset} onChange={offset=>onChange({offset})}/></>}
    {effect.type==='drop'&&<><EffectRange label="Blur" value={effect.blur} onChange={blur=>onChange({blur})}/><EffectRange label="Transparency" value={effect.transparency} onChange={transparency=>onChange({transparency})}/></>}
    {effect.type==='glow'&&<EffectRange label="Intensity" value={effect.intensity} onChange={intensity=>onChange({intensity})}/>}
    <div className="shape-effect-colors"><span>Color</span><div><label className="shape-effect-color" style={{background:effect.color}}><span className="sr-only">Effect color</span><input aria-label="Effect color" type="color" value={effect.color} onChange={event=>onChange({color:event.target.value})}/></label>{effect.type==='glitch'&&<label className="shape-effect-color" style={{background:effect.color2}}><span className="sr-only">Second effect color</span><input aria-label="Second effect color" type="color" value={effect.color2} onChange={event=>onChange({color2:event.target.value})}/></label>}</div></div>
  </div>;
}

export function ShapeEffects({effect:incoming,onChange,disabled=false}:{effect?:ShapeEffect|null;onChange:(patch:ShapeEffectPatch)=>void;disabled?:boolean}){
  const effect=normalizeShapeEffect(incoming??{}),basic=SHAPE_EFFECT_PRESETS.filter(preset=>preset.section==='basic'),advanced=SHAPE_EFFECT_PRESETS.filter(preset=>preset.section==='advanced');
  const controlsRow=effect.type==='none'?-1:Math.floor(basic.findIndex(preset=>preset.id===effect.type)/3);
  const tile=(preset:ShapeEffectPresetDefinition)=><button type="button" key={preset.id} className={`shape-effect-tile ${effect.type===preset.id?'active':''}`} aria-label={`Apply ${preset.name} effect`} aria-pressed={effect.type===preset.id} onClick={()=>onChange({preset:preset.id})}><span className="shape-effect-preview"><EffectPreview preset={preset}/></span><span>{preset.name}</span></button>;
  return <div className="shape-effects-panel"><fieldset disabled={disabled} className="shape-effects-body"><div className="shape-effect-basic" role="group" aria-label="Shape effect styles">{[basic.slice(0,3),basic.slice(3)].map((row,index)=><div className="shape-effect-row-group" key={index}><div className="shape-effect-grid">{row.map(tile)}</div>{controlsRow===index&&<EffectControls effect={effect} onChange={onChange}/>}</div>)}</div><h3>Advanced</h3><div className="shape-effect-grid" role="group" aria-label="Advanced shape effect styles">{advanced.map(tile)}</div></fieldset><div className="shape-effects-footer"><button className="shape-effect-remove" type="button" disabled={disabled||effect.type==='none'} onClick={()=>onChange({type:'none'})}>Remove effect</button></div></div>;
}
