import {ActiveSelection,Color,FabricImage,FabricObject,FabricText,FixedLayout,Gradient,Group,LayoutManager,Point,Shadow,util} from 'fabric';

export type ShapeEffectType='none'|'drop'|'glow'|'echo'|'glitch';
export type ShapeEffectPreset='none'|'drop'|'glow'|'echo'|'glitch'|'radioactive'|'retro'|'midnight'|'malibu'|'chroma'|'digital'|'aura'|'vhs'|'sunset'|'metallic'|'laser';
export interface ShapeEffect {
  type:ShapeEffectType;
  preset:ShapeEffectPreset;
  direction:number;
  offset:number;
  blur:number;
  transparency:number;
  intensity:number;
  color:string;
  color2:string;
}
export type ShapeEffectPatch=Partial<ShapeEffect>;
export interface ShapeEffectPresetDefinition {id:ShapeEffectPreset;name:string;section:'basic'|'advanced';effect:ShapeEffect}
export interface ShapeEffectGradient {type:'linear'|'radial';colors:string[];angle:number}
export interface ShapeEffectBaseStyle {fill:string|ShapeEffectGradient;stroke:string|ShapeEffectGradient|null;strokeWidth?:number}
interface EffectBase {shadow:ReturnType<Shadow['toObject']>|null;caching?:boolean[]}
export type ShapeEffectObject=FabricObject&{
  id?:string;visroName?:string;visroLocked?:boolean;visroShapeEffect?:ShapeEffect;
  visroShapeEffectBase?:EffectBase;visroShapeEffectRole?:'base'|'paint';
};
export const SHAPE_EFFECT_CUSTOM_PROPS=['visroShapeEffect','visroShapeEffectBase','visroShapeEffectRole','objectCaching'];
const DEFAULT:ShapeEffect={type:'none',preset:'none',direction:-45,offset:20,blur:10,transparency:30,intensity:40,color:'#000000',color2:'#00ffff'};
const effect=(type:ShapeEffectType,patch:ShapeEffectPatch={}):ShapeEffect=>({...DEFAULT,type,preset:type,...(type==='echo'?{direction:-52,offset:13}:type==='glitch'?{direction:-55,offset:9,color:'#ff00ff'}:{}),...patch});
export const SHAPE_EFFECT_PRESETS:readonly ShapeEffectPresetDefinition[]=[
  {id:'drop',name:'Drop',section:'basic',effect:effect('drop')},
  {id:'glow',name:'Glow',section:'basic',effect:effect('glow')},
  {id:'echo',name:'Echo',section:'basic',effect:effect('echo',{direction:-52,offset:13})},
  {id:'glitch',name:'Glitch',section:'basic',effect:effect('glitch',{direction:-55,offset:9,color:'#ff00ff',color2:'#00ffff'})},
  {id:'radioactive',name:'Radioactive',section:'advanced',effect:effect('glow',{preset:'radioactive',color:'#1d9c1d'})},
  {id:'retro',name:'Retro',section:'advanced',effect:effect('drop',{preset:'retro',blur:0,transparency:100,color:'#ad1b45'})},
  {id:'midnight',name:'Midnight',section:'advanced',effect:effect('glow',{preset:'midnight',color:'#0a1956'})},
  {id:'malibu',name:'Malibu',section:'advanced',effect:effect('glow',{preset:'malibu',color:'#d02392'})},
  {id:'chroma',name:'Chroma',section:'advanced',effect:effect('glitch',{preset:'chroma',color:'#d9efff',color2:'#9059ff'})},
  {id:'digital',name:'Digital',section:'advanced',effect:effect('echo',{preset:'digital',direction:-45,offset:13,color:'#0047ff'})},
  {id:'aura',name:'Aura',section:'advanced',effect:effect('glow',{preset:'aura',color:'#b0f0ff'})},
  {id:'vhs',name:'VHS',section:'advanced',effect:effect('glow',{preset:'vhs',color:'#601d9c'})},
  {id:'sunset',name:'Sunset',section:'advanced',effect:effect('glow',{preset:'sunset',color:'#e37200'})},
  {id:'metallic',name:'Metallic',section:'advanced',effect:effect('glow',{preset:'metallic',color:'#ab8115'})},
  {id:'laser',name:'Laser',section:'advanced',effect:effect('echo',{preset:'laser',direction:-52,offset:13,color:'#ff3d40'})},
];
const presetFor=(id:unknown)=>SHAPE_EFFECT_PRESETS.find(preset=>preset.id===id);
const linear=(angle:number,colors:string[]):ShapeEffectGradient=>({type:'linear',angle,colors});
export const SHAPE_EFFECT_BASE_STYLES:Partial<Record<ShapeEffectPreset,ShapeEffectBaseStyle>>={
  radioactive:{fill:'#d4ffd4',stroke:'#3cc027',strokeWidth:7},
  retro:{fill:'#ffca36',stroke:'#ad1b45',strokeWidth:7},
  midnight:{fill:linear(135,['#3a0443','#2f0087']),stroke:linear(135,['#1880bb','#e2e2e2']),strokeWidth:7},
  malibu:{fill:linear(135,['#b01979','#e9abd2','#f6dcec','#c9258e']),stroke:null},
  chroma:{fill:'#000000',stroke:linear(135,['#f7dfff','#ffffff','#87efff']),strokeWidth:7},
  digital:{fill:linear(-135,['#ff3def','#0047ff']),stroke:null},
  aura:{fill:{type:'radial',angle:0,colors:['#7051db','#7ffaff']},stroke:null},
  vhs:{fill:linear(180,['#a20cbc','#0e3ebb']),stroke:linear(180,['#7ffaff','#c22ffd']),strokeWidth:7},
  sunset:{fill:linear(135,['#f9c702','#e316a0']),stroke:null},
  metallic:{fill:linear(135,['#ba943e','#f3f4e3','#dbd299','#6f511a']),stroke:'#ab8115',strokeWidth:7},
  laser:{fill:linear(135,['#070000','#5a0303']),stroke:'#f50101',strokeWidth:7},
};
const TYPES=new Set(['none','drop','glow','echo','glitch']);
const bounded=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const solidColor=(value:unknown)=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value.toLowerCase():undefined;

/** Normalize the public controls without allowing nonfinite geometry or CSS injection. */
export function normalizeShapeEffect(patch:ShapeEffectPatch={},previous:ShapeEffect=DEFAULT):ShapeEffect {
  if(patch.preset==='none')return{...DEFAULT};
  const preset=presetFor(patch.preset);
  const base=preset?{...preset.effect}:patch.type&&TYPES.has(patch.type)&&patch.type!==previous.type?effect(patch.type):{...previous};
  if(patch.type&&TYPES.has(patch.type)&&!preset)base.type=patch.type;
  if(base.type==='none')return{...DEFAULT};
  for(const key of ['offset','blur','transparency','intensity'] as const)if(typeof patch[key]==='number'&&Number.isFinite(patch[key]))base[key]=bounded(patch[key]!,0,100);
  if(typeof patch.direction==='number'&&Number.isFinite(patch.direction))base.direction=bounded(patch.direction,-180,180);
  const color=solidColor(patch.color),color2=solidColor(patch.color2);if(color)base.color=color;if(color2)base.color2=color2;
  return base;
}

export function isShapeEffectObject(object:FabricObject):object is Group&ShapeEffectObject {
  return object instanceof Group&&Boolean((object as ShapeEffectObject).visroShapeEffect)&&object.getObjects().some(child=>(child as ShapeEffectObject).visroShapeEffectRole==='base');
}
export function getShapeEffectBase(object:FabricObject):FabricObject {
  return isShapeEffectObject(object)?object.getObjects().find(child=>(child as ShapeEffectObject).visroShapeEffectRole==='base')!:object;
}
export function getShapeEffect(object:FabricObject):ShapeEffect {return normalizeShapeEffect((object as ShapeEffectObject).visroShapeEffect??{});}
export function supportsShapeEffect(object:FabricObject):boolean {
  const base=getShapeEffectBase(object);if(base instanceof ActiveSelection||base instanceof FabricImage||base instanceof FabricText)return false;
  if(base instanceof Group)return base.getObjects().length>0&&base.getObjects().every(supportsShapeEffect);
  return ['rect','circle','ellipse','triangle','polygon','polyline','path','line'].includes(base.type.toLowerCase())&&(base.width>0||base.height>0);
}

function assertActive(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('Shape effect cancelled.','AbortError');}
function renewIds(object:FabricObject){const node=object as ShapeEffectObject;if(node.id)node.id=crypto.randomUUID();if(object instanceof Group)object.getObjects().forEach(renewIds);}
function vectorCaching(object:FabricObject):boolean[]{return[object.objectCaching,...(object instanceof Group?object.getObjects().flatMap(vectorCaching):[])];}
function restoreVectorCaching(object:FabricObject,values:boolean[]){let index=0;const visit=(node:FabricObject)=>{const value=values[index++];if(typeof value==='boolean')node.set('objectCaching',value);if(node instanceof Group)node.getObjects().forEach(visit);};visit(object);}
function directVectorPaint(object:FabricObject){object.set({objectCaching:false,dirty:true});if(object instanceof Group)object.getObjects().forEach(directVectorPaint);}
function nativeVectorPaint(source:FabricObject,target:FabricObject,color:string){
  const hasFill=Boolean(source.fill)&&!['none','transparent'].includes(String(source.fill));
  target.set({fill:hasFill?color:null,stroke:source.stroke?color:null,strokeWidth:source.strokeWidth,strokeDashArray:source.strokeDashArray?[...source.strokeDashArray]:null,strokeLineCap:source.strokeLineCap,strokeLineJoin:source.strokeLineJoin,strokeMiterLimit:source.strokeMiterLimit,fillRule:source.fillRule,opacity:source.opacity,paintFirst:source.paintFirst,shadow:null});
  if(source instanceof Group&&target instanceof Group)source.getObjects().forEach((child,index)=>{const copy=target.getObjects()[index];if(copy)nativeVectorPaint(child,copy,color);});
}
function shadowColor(color:string,opacity:number){return new Color(color).setAlpha(bounded(opacity,0,1)).toRgba();}
function nativeGradient(style:ShapeEffectGradient,width:number,height:number):Gradient<'linear'>|Gradient<'radial'> {
  const colorStops=style.colors.map((color,index)=>({offset:index/(style.colors.length-1),color}));
  if(style.type==='radial')return new Gradient({type:'radial',gradientUnits:'pixels',coords:{x1:width/2,y1:height/2,r1:0,x2:width/2,y2:height/2,r2:Math.max(width,height)/2},colorStops});
  const radians=style.angle*Math.PI/180,dx=Math.cos(radians)*width/2,dy=Math.sin(radians)*height/2;
  return new Gradient({type:'linear',gradientUnits:'pixels',coords:{x1:width/2-dx,y1:height/2-dy,x2:width/2+dx,y2:height/2+dy},colorStops});
}
function applyPresetBaseStyle(base:FabricObject,preset:ShapeEffectPreset){
  const style=SHAPE_EFFECT_BASE_STYLES[preset];if(!style)return;
  const visit=(node:FabricObject)=>{
    if(node instanceof Group){node.getObjects().forEach(visit);node.set('dirty',true);return;}
    const filled=Boolean(node.fill)&&!['none','transparent'].includes(String(node.fill));
    if(filled){node.set('fill',typeof style.fill==='string'?style.fill:nativeGradient(style.fill,node.width,node.height));const metadata=node as unknown as Record<string,unknown>;if(typeof style.fill==='string')delete metadata.visroGradient;else metadata.visroGradient={colors:[...style.fill.colors],angle:style.fill.angle};}
    node.set({stroke:typeof style.stroke==='string'||style.stroke===null?style.stroke:nativeGradient(style.stroke,node.width,node.height),strokeWidth:style.stroke?style.strokeWidth??node.strokeWidth:0});
  };visit(base);
}

/** Control-only changes reuse native paint objects, avoiding an async clone for
 * each slider event. A mechanism change is handled by the replacement factory. */
export function applyShapeEffectPatch(object:FabricObject,patch:ShapeEffectPatch):boolean {
  if(!isShapeEffectObject(object))return false;
  const next=normalizeShapeEffect(patch,getShapeEffect(object));if(next.type!==getShapeEffect(object).type||next.type==='none')return false;
  if(JSON.stringify(next)===JSON.stringify(getShapeEffect(object))&&!patch.preset)return false;
  if(patch.preset)applyPresetBaseStyle(getShapeEffectBase(object),next.preset);
  object.visroShapeEffect=next;refreshShapeEffect(object);return true;
}

/** Refresh the derived native paint after editing the base fill or stroke. The
 * root editor can keep normal style changes synchronous and commit just once. */
export function refreshShapeEffect(object:FabricObject):boolean {
  if(!isShapeEffectObject(object))return false;
  const state=getShapeEffect(object),base=getShapeEffectBase(object),paint=object.getObjects().filter(child=>(child as ShapeEffectObject).visroShapeEffectRole==='paint');
  // Fabric's minimum-size nested cache can keep an old pixel translation after
  // a stroke metric changes. Paint effect vectors directly, preserving native
  // geometry and stable exports without changing ordinary-object caching.
  object.getObjects().forEach(directVectorPaint);
  const radians=state.direction*Math.PI/180,dx=Math.cos(radians)*state.offset||0,dy=-Math.sin(radians)*state.offset||0;
  base.set('shadow',null);
  if(state.type==='drop')base.set('shadow',new Shadow({color:shadowColor(state.color,state.transparency/100),blur:state.blur,offsetX:dx,offsetY:dy,affectStroke:true}));
  else if(state.type==='glow'){
    base.set('shadow',new Shadow({color:shadowColor(state.color,state.intensity/100),blur:state.intensity,offsetX:0,offsetY:0,affectStroke:true}));
  }else if(state.type==='echo')paint.forEach((copy,index)=>{
    nativeVectorPaint(base,copy,state.color);copy.set({left:dx*(paint.length-index),top:dy*(paint.length-index),opacity:index===0?.25:.5});
  });
  else if(state.type==='glitch')paint.forEach((copy,index)=>{
    nativeVectorPaint(base,copy,index?state.color2:state.color);copy.set({left:dx*(index?1:-1),top:dy*(index?1:-1),opacity:1});
  });
  // Group paints no stroke of its own, but its native geometry must retain the
  // base stroke metrics. Fabric then computes uniform/nonuniform stroke bounds
  // correctly under rotation, skew, scaling and nested parent transforms.
  object.set({width:base.width,height:base.height,strokeWidth:base.strokeWidth,strokeUniform:base.strokeUniform,dirty:true});base.set('dirty',true);object.setCoords();return true;
}

export function updateShapeEffectBase(object:FabricObject,patch:Record<string,unknown>):boolean {
  if(!isShapeEffectObject(object))return false;
  const changed=updateVectorBasePaint(getShapeEffectBase(object),patch);if(changed)refreshShapeEffect(object);return changed;
}

/** A vector group's own fill is not painted by Fabric. Route its native paint
 * to genuine vector leaves while keeping open, stroke-only geometry open. */
export function updateVectorBasePaint(base:FabricObject,patch:Record<string,unknown>):boolean {
  if(!supportsShapeEffect(base))return false;
  const allowed=['fill','stroke','strokeWidth','strokeDashArray','strokeLineCap','strokeLineJoin','strokeMiterLimit','paintFirst','fillRule'];
  const update=Object.fromEntries(Object.entries(patch).filter(([key])=>allowed.includes(key)));if(!Object.keys(update).length)return false;
  const visit=(node:FabricObject)=>{
    if(node instanceof Group){node.set(update);node.getObjects().forEach(visit);node.set('dirty',true);return;}
    const values={...update};if(Object.hasOwn(values,'fill')&&(!node.fill||['none','transparent'].includes(String(node.fill)))&&node.stroke){if(!Object.hasOwn(values,'stroke'))values.stroke=values.fill;delete values.fill;}
    if(Object.hasOwn(values,'fill'))delete (node as unknown as Record<string,unknown>).visroGradient;
    node.set(values);node.set('dirty',true);
  };visit(base);return true;
}

/** Build real native vectors and shadows. The previous canvas object is never
 * mutated; the editor owns replacing it at the same parent/z-index and Undo. */
export async function createShapeEffectObject(previous:FabricObject,patch:ShapeEffectPatch,options:{signal?:AbortSignal}={}):Promise<FabricObject> {
  assertActive(options.signal);if(!supportsShapeEffect(previous))throw new Error('Select a native vector shape or graphic for effects.');
  const next=normalizeShapeEffect(patch,getShapeEffect(previous)),old=previous as ShapeEffectObject,source=getShapeEffectBase(previous),matrix=previous.calcTransformMatrix(),base=await source.clone([...FabricObject.customProperties,...SHAPE_EFFECT_CUSTOM_PROPS]) as ShapeEffectObject;
  try{assertActive(options.signal);}catch(error){base.dispose();throw error;}
  // Derivatives remain real editable paths, but carry fresh identities so a
  // saved project never contains multiple document layers with one ID.
  renewIds(base);delete base.visroShapeEffect;delete base.visroShapeEffectBase;delete base.visroShapeEffectRole;
  const originalShadow=isShapeEffectObject(previous)?old.visroShapeEffectBase?.shadow??null:source.shadow?.toObject()??null;
  const originalCaching=isShapeEffectObject(previous)?old.visroShapeEffectBase?.caching??vectorCaching(source):vectorCaching(source);
  base.set({originX:'center',originY:'center',left:0,top:0,angle:0,skewX:0,skewY:0,scaleX:1,scaleY:1,flipX:false,flipY:false,opacity:1,shadow:originalShadow?new Shadow(originalShadow):null});
  if(next.type==='none'){
    restoreVectorCaching(base,originalCaching);
    base.id=old.id;base.visroName=old.visroName;base.visroLocked=old.visroLocked;base.set({opacity:previous.opacity,visible:previous.visible});util.applyTransformToObject(base,matrix);base.setCoords();return base;
  }
  if(patch.preset)applyPresetBaseStyle(base,next.preset);
  const copies:FabricObject[]=[];
  if(next.type==='echo'||next.type==='glitch')for(let index=0;index<2;index++){
    const copy=await base.clone([...FabricObject.customProperties,...SHAPE_EFFECT_CUSTOM_PROPS]) as ShapeEffectObject;try{assertActive(options.signal);}catch(error){copy.dispose();copies.forEach(part=>part.dispose());base.dispose();throw error;}renewIds(copy);copy.visroShapeEffectRole='paint';copy.set({selectable:false,evented:false});copies.push(copy);
  }
  base.visroShapeEffectRole='base';
  const wrapper=new Group([...copies,base],{originX:'center',originY:'center',left:0,top:0,width:Math.max(.001,base.width),height:Math.max(.001,base.height),strokeWidth:base.strokeWidth,strokeUniform:base.strokeUniform,objectCaching:false,layoutManager:new LayoutManager(new FixedLayout()),opacity:previous.opacity,visible:previous.visible}) as Group&ShapeEffectObject;
  // FixedLayout preserves the base selection size. Group's initialization
  // centers child bounds, so explicitly restore the native base at its origin.
  base.setPositionByOrigin(new Point(0,0),'center','center');
  wrapper.id=old.id;wrapper.visroName=old.visroName;wrapper.visroLocked=old.visroLocked;
  for(const key of FabricObject.customProperties)if(!SHAPE_EFFECT_CUSTOM_PROPS.includes(key)&&key!=='id'&&key!=='visroName'&&key!=='visroLocked'){
    const value=(previous as unknown as Record<string,unknown>)[key];if(value!==undefined)(wrapper as unknown as Record<string,unknown>)[key]=structuredClone(value);
  }
  wrapper.visroShapeEffect=next;wrapper.visroShapeEffectBase={shadow:originalShadow,caching:originalCaching};
  util.applyTransformToObject(wrapper,matrix);refreshShapeEffect(wrapper);return wrapper;
}
