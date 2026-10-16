import {Control,FabricObject,FixedLayout,Group,LayoutManager,Line,Path,Point,util,type TMat2D,type TPointerEvent,type Transform} from 'fabric';
import {newId} from './project';

import {isLinePoint as finitePoint,LINE_MARKERS,LINE_ROUTES,sanitizeLineGeometry,type LineGeometry,type LineStyle,type LineMarker} from './line-geometry';
export {LINE_MARKERS,LINE_ROUTES,sanitizeLineGeometry} from './line-geometry';
export type {LineRoute,LineMarker,LineStyle,LineGeometry} from './line-geometry';
export type EditableLine=FabricObject&{visroLine?:LineGeometry;id?:string;visroName?:string;visroLocked?:boolean};
const defaults:LineStyle={route:'straight',startMarker:'none',endMarker:'none'};
export function isEditableLine(object:FabricObject):boolean{return object instanceof Line||object instanceof Group&&!!sanitizeLineGeometry((object as EditableLine).visroLine);}
export function getLineStyle(object:FabricObject):LineStyle|null{
  const data=object instanceof Group?sanitizeLineGeometry((object as EditableLine).visroLine):undefined;return data?{route:data.route,startMarker:data.startMarker,endMarker:data.endMarker}:object instanceof Line?{...defaults}:null;
}
function localGeometry(object:FabricObject):LineGeometry{
  const data=sanitizeLineGeometry((object as EditableLine).visroLine);if(object instanceof Group&&data)return data;
  if(object instanceof Line){const points=object.calcLinePoints();return{version:1,...defaults,start:{x:points.x1,y:points.y1},end:{x:points.x2,y:points.y2}};}
  throw new Error('Select a line or connector.');
}
/** Endpoints are always reported in the scene plane, including all containing groups. */
export function getLineEndpoints(object:FabricObject):{start:Point;end:Point}{const data=localGeometry(object),matrix=object.calcTransformMatrix();return{start:new Point(data.start).transform(matrix),end:new Point(data.end).transform(matrix)};}
const number=(value:number)=>Number(value.toFixed(8));
const p=(point:{x:number;y:number})=>`${number(point.x)} ${number(point.y)}`;
interface RouteGeometry {path:string;startDirection:Point;endDirection:Point}
function markerMetrics(direction:Point,weight:number,matrix:TMat2D,uniform:boolean){const vector=direction.transform(matrix,true),length=Math.max(1e-8,Math.hypot(vector.x,vector.y)),paintedWeight=uniform?weight:weight*Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])/length;return{direction:vector.scalarDivide(length),weight:paintedWeight,size:Math.max(8,paintedWeight*3),length};}
function markerInset(marker:LineMarker,direction:Point,weight:number,matrix:TMat2D,uniform:boolean):number{if(marker==='none'||marker==='arrow'||marker==='bar')return 0;const metrics=markerMetrics(direction,weight,matrix,uniform);return metrics.size/metrics.length;}
function interpolate(a:Point,b:Point,t:number):Point{return a.add(b.subtract(a).scalarMultiply(t));}
function trimmedPolyline(points:Point[],start:number,end:number):string{
  const distances=[0];for(let index=1;index<points.length;index++)distances.push(distances[index-1]+points[index].distanceFrom(points[index-1]));const total=distances.at(-1)!,from=Math.min(start,total/2),to=Math.max(from,total-Math.min(end,total/2));
  const at=(distance:number)=>{for(let index=1;index<points.length;index++)if(distances[index]>=distance){const span=distances[index]-distances[index-1];return interpolate(points[index-1],points[index],span?(distance-distances[index-1])/span:0);}return points.at(-1)!;};
  return `M ${p(at(from))} ${points.slice(1,-1).filter((_point,index)=>distances[index+1]>from&&distances[index+1]<to).map(point=>`L ${p(point)}`).join(' ')} L ${p(at(to))}`;
}
function splitCurve(points:Point[],t:number):[Point[],Point[]]{const[a,b,c,d]=points,ab=interpolate(a,b,t),bc=interpolate(b,c,t),cd=interpolate(c,d,t),abc=interpolate(ab,bc,t),bcd=interpolate(bc,cd,t),middle=interpolate(abc,bcd,t);return[[a,ab,abc,middle],[middle,bcd,cd,d]];}
function trimmedCurve(points:Point[],start:number,end:number):string{
  let curve=points;
  if(start||end){const samples=[0],positions=[points[0]];for(let index=1;index<=64;index++){const point=splitCurve(points,index/64)[0][3];samples.push(samples.at(-1)!+point.distanceFrom(positions.at(-1)!));positions.push(point);}const total=samples.at(-1)!,from=Math.min(start,total/2),to=Math.max(from,total-Math.min(end,total/2));
    const parameter=(distance:number)=>{for(let index=1;index<samples.length;index++)if(samples[index]>=distance){const span=samples[index]-samples[index-1];return(index-1+(span?(distance-samples[index-1])/span:0))/64;}return 1;},first=parameter(from),last=parameter(to);
    curve=splitCurve(splitCurve(points,first)[1],first<1?(last-first)/(1-first):0)[0];
  }
  return`M ${p(curve[0])} C ${p(curve[1])} ${p(curve[2])} ${p(curve[3])}`;
}
function routeGeometry(data:LineGeometry,weight:number,matrix:TMat2D,uniform:boolean):RouteGeometry{
  const a=new Point(data.start),b=new Point(data.end),delta=b.subtract(a),length=Math.hypot(delta.x,delta.y),normal=length>1e-8?delta.scalarDivide(length):new Point(1,0);
  const trim=(marker:LineMarker,direction:Point)=>markerInset(marker,direction,weight,matrix,uniform);
  if(data.route==='elbow'){
    const middle=(a.x+b.x)/2,first=new Point(middle,a.y),last=new Point(middle,b.y);
    const firstDelta=first.subtract(a),lastDelta=b.subtract(last);
    const startDirection=Math.abs(firstDelta.x)>1e-8?new Point(Math.sign(firstDelta.x),0):Math.abs(delta.y)>1e-8?new Point(0,Math.sign(delta.y)):normal;
    const endDirection=Math.abs(lastDelta.x)>1e-8?new Point(Math.sign(lastDelta.x),0):Math.abs(delta.y)>1e-8?new Point(0,Math.sign(delta.y)):normal;
    return{path:trimmedPolyline([a,first,last,b],trim(data.startMarker,startDirection),trim(data.endMarker,endDirection)),startDirection,endDirection};
  }
  if(data.route==='curved'){
    const bend=Math.max(Math.abs(delta.x)/2,Math.min(length*.4,80)),direction=delta.x<0?-1:1,c1=new Point(a.x+bend*direction,a.y),c2=new Point(b.x-bend*direction,b.y);
    const tangent=new Point(direction,0);return{path:trimmedCurve([a,c1,c2,b],trim(data.startMarker,tangent),trim(data.endMarker,tangent)),startDirection:tangent,endDirection:tangent};
  }
  return{path:trimmedPolyline([a,b],trim(data.startMarker,normal),trim(data.endMarker,normal)),startDirection:normal,endDirection:normal};
}
function markerPath(marker:LineMarker,tip:Point,direction:Point,weight:number):{path:string;filled:boolean}|null{
  if(marker==='none')return null;
  const size=Math.max(8,weight*3),half=size*.5,at=(x:number,y:number)=>new Point(tip.x+direction.x*x-direction.y*y,tip.y+direction.y*x+direction.x*y),closed=(points:Point[])=>`M ${points.map(p).join(' L ')} Z`;
  if(marker==='bar')return{path:`M ${p(at(0,-half))} L ${p(at(0,half))}`,filled:false};
  if(marker==='arrow')return{path:`M ${p(at(-size,-half))} L ${p(tip)} L ${p(at(-size,half))}`,filled:false};
  if(marker.startsWith('triangle'))return{path:closed([tip,at(-size,-half),at(-size,half)]),filled:marker==='triangle'};
  if(marker.startsWith('diamond'))return{path:closed([tip,at(-half,-half),at(-size,0),at(-half,half)]),filled:marker==='diamond'};
  if(marker.startsWith('square'))return{path:closed([at(0,-half),at(0,half),at(-size,half),at(-size,-half)]),filled:marker==='square'};
  const start=at(0,0),back=at(-size,0);
  return{path:`M ${p(start)} A ${half} ${half} 0 1 0 ${p(back)} A ${half} ${half} 0 1 0 ${p(start)} Z`,filled:marker==='circle'};
}
function copiedProperties(source:FabricObject):Record<string,unknown>{
  const props:Record<string,unknown>={};
  for(const key of ['id','visroName','visroLocked','visroMetadata','visroShapeType','opacity','visible','globalCompositeOperation','shadow','clipPath','selectable','evented','lockMovementX','lockMovementY','lockRotation','lockScalingX','lockScalingY','hasControls','hasBorders','cornerColor','cornerStrokeColor','cornerSize','transparentCorners','borderColor','borderScaleFactor','padding','perPixelTargetFind','excludeFromExport'])props[key]=(source as unknown as Record<string,unknown>)[key];
  return props;
}
function buildLine(source:FabricObject,data:LineGeometry):Group&EditableLine{
  const sceneMatrix=source.calcTransformMatrix(),matrix=source instanceof Group?source.calcOwnMatrix():sceneMatrix,color=source.stroke||'#292620',weight=Math.max(0,Number.isFinite(source.strokeWidth)?source.strokeWidth:2),route=routeGeometry(data,weight,sceneMatrix,source.strokeUniform),appearance={stroke:color,strokeWidth:weight,strokeUniform:source.strokeUniform,strokeLineCap:source.strokeLineCap,strokeLineJoin:source.strokeLineJoin,strokeMiterLimit:source.strokeMiterLimit,strokeDashOffset:source.strokeDashOffset,objectCaching:false,selectable:false,evented:false};
  const children:Path[]=[new Path(route.path,{...appearance,fill:null,strokeDashArray:source.strokeDashArray?[...source.strokeDashArray]:null})];
  const previous=source instanceof Group?source.getObjects() as EditableLine[]:[],previousData=source instanceof Group?sanitizeLineGeometry((source as EditableLine).visroLine):undefined;
  const namePart=(part:Path,name:string,previous?:EditableLine)=>{(part as EditableLine).id=previous?.id??newId();(part as EditableLine).visroName=name;};namePart(children[0],'Line segment',previous[0]);
  for(const [end,marker,tip,direction]of[['start',data.startMarker,new Point(data.start),route.startDirection.scalarMultiply(-1)],['end',data.endMarker,new Point(data.end),route.endDirection]] as const){const metrics=markerMetrics(direction,weight,sceneMatrix,source.strokeUniform),geometry=markerPath(marker,tip.transform(sceneMatrix),metrics.direction,metrics.weight);if(geometry){const part=new Path(geometry.path,{...appearance,strokeWidth:metrics.weight,strokeUniform:false,strokeDashArray:null,fill:geometry.filled?color:null}),previousPart=end==='start'?(previousData?.startMarker!=='none'?previous[1]:undefined):previousData?.endMarker!=='none'?previous.at(-1):undefined;util.removeTransformFromObject(part,sceneMatrix);namePart(part,end==='start'?'Line start':'Line end',previousPart);children.push(part);}}
  const group=new Group(children,{...copiedProperties(source),originX:'center',originY:'center',subTargetCheck:false,interactive:false,objectCaching:source.objectCaching,layoutManager:new LayoutManager(new FixedLayout()),strokeWidth:0}) as Group&EditableLine;
  const center=group.getRelativeCenterPoint();
  group.visroLine={...data,start:new Point(data.start).subtract(center),end:new Point(data.end).subtract(center)};
  // The group owns the toolbar's appearance fields, while native children paint
  // them. Remove that non-painted group stroke from its geometry's dimensions.
  group.set({width:Math.max(0,group.width-weight),height:Math.max(0,group.height-weight),stroke:color,strokeWidth:weight,strokeDashArray:source.strokeDashArray?[...source.strokeDashArray]:null,strokeDashOffset:source.strokeDashOffset,strokeUniform:source.strokeUniform,strokeLineCap:source.strokeLineCap,strokeLineJoin:source.strokeLineJoin,strokeMiterLimit:source.strokeMiterLimit,fill:null});
  util.applyTransformToObject(group,util.multiplyTransformMatrices(matrix,[1,0,0,1,center.x,center.y]));group.setCoords();return group;
}
/** Rebuild native children in place, retaining the target object used by Fabric's
 * current gesture and its parent slot. A plain native Line converts once. */
function replaceGeometry(source:FabricObject,data:LineGeometry,layoutParent=true):FabricObject{
  const replacement=buildLine(source,data);if(!(source instanceof Group))return replacement;
  if(!(source.layoutManager.strategy instanceof FixedLayout)){source.layoutManager.dispose();source.layoutManager=new LayoutManager(new FixedLayout());}
  const removed=source.remove(...source.getObjects());for(const object of removed)object.dispose();
  source.set({width:replacement.width,height:replacement.height,stroke:replacement.stroke,strokeWidth:replacement.strokeWidth,fill:null});
  util.applyTransformToObject(source,replacement.calcOwnMatrix());
  const children=replacement.remove(...replacement.getObjects());
  // Native Group.add accepts objects in the scene plane, even when the group
  // itself is nested. The temporary replacement uses the parent's plane.
  if(source.group){const parent=source.group.calcTransformMatrix();for(const child of children)util.applyTransformToObject(child,util.multiplyTransformMatrices(parent,child.calcOwnMatrix()));}
  source.add(...children);(source as EditableLine).visroLine=replacement.visroLine;replacement.dispose();source.set('dirty',true);source.setCoords();if(layoutParent)source.group?.triggerLayout();return source;
}
export function updateLineObject(object:FabricObject,patch:Partial<LineStyle>):FabricObject{
  const previous=localGeometry(object),next=sanitizeLineGeometry({...previous,...patch});if(!next)throw new Error('Choose a supported connector style.');
  if(object instanceof Group&&previous.route===next.route&&previous.startMarker===next.startMarker&&previous.endMarker===next.endMarker)return object;
  const result=replaceGeometry(object,next);installLineControls(result);return result;
}
export function swapLineObjectEnds(object:FabricObject):FabricObject{
  const previous=localGeometry(object),result=replaceGeometry(object,{...previous,startMarker:previous.endMarker,endMarker:previous.startMarker});installLineControls(result);return result;
}
/** Only known connector catalog entries are converted. Decorative/freehand
 * paths and imported vectors retain their original geometry and controls. */
export function convertCatalogLineObject(object:FabricObject,shapeId:string):FabricObject{
  if(object instanceof Line){installLineControls(object);return object;}
  if(!(object instanceof Path))return object;
  const definitions:Record<string,{start:Point;end:Point;style:LineStyle}>={
    'arrow-line':{start:new Point(0,50),end:new Point(98,50),style:{...defaults,endMarker:'arrow'}},
    'double-arrow-line':{start:new Point(2,50),end:new Point(98,50),style:{...defaults,startMarker:'arrow',endMarker:'arrow'}},
    'elbow-line':{start:new Point(0,0),end:new Point(100,100),style:{...defaults,route:'elbow'}},
    'curved-line':{start:new Point(0,100),end:new Point(100,0),style:{...defaults,route:'curved'}},
  },definition=definitions[shapeId];if(!definition)return object;
  const converted=buildLine(object,{version:1,...definition.style,start:definition.start.subtract(object.pathOffset),end:definition.end.subtract(object.pathOffset)});installLineControls(converted);return converted;
}
/** Reapply generic stroke/dash/cap changes to all native connector paths. */
export function syncLineAppearance(object:FabricObject):void{if(object instanceof Group&&sanitizeLineGeometry((object as EditableLine).visroLine))replaceGeometry(object,localGeometry(object));}
/** Refresh decorated descendants after their containing group was scaled.
 * Layout runs bottom-up once, preserving every leaf's scene transform. */
export function syncLineSubtree(object:FabricObject):boolean{
  const visit=(target:FabricObject):boolean=>{
    if(!(target instanceof Group))return false;
    if(sanitizeLineGeometry((target as EditableLine).visroLine)){replaceGeometry(target,localGeometry(target),false);return true;}
    // Connector child removal/addition normally bubbles native layout into its
    // ancestors. Defer that partial layout until its new geometry is complete;
    // otherwise a stale/imported parent box can rebase the connector mid-build.
    const manager=target.layoutManager,perform=manager.performLayout;
    let changed=false;manager.performLayout=()=>{};
    try{for(const child of target.getObjects())if(visit(child))changed=true;}
    finally{manager.performLayout=perform;}
    if(changed)target.triggerLayout({bubbles:false});return changed;
  };
  const changed=visit(object);if(changed)object.group?.triggerLayout();return changed;
}
/** Drag one endpoint in scene coordinates, preserving the opposite endpoint and
 * the complete parent transform. No history/event is emitted during the drag. */
export function moveLineEndpoint(object:FabricObject,end:'start'|'end',scenePoint:{x:number;y:number}):boolean{
  if(!finitePoint(scenePoint)||(object as EditableLine).visroLocked||!object.selectable)return false;
  for(let parent=object.group;parent;parent=parent.group)if((parent as EditableLine).visroLocked)return false;
  const previous=localGeometry(object),local=new Point(scenePoint).transform(util.invertTransform(object.calcTransformMatrix()));if(Math.hypot(local.x-previous[end].x,local.y-previous[end].y)<1e-7)return false;
  const next={...previous,[end]:local};
  if(object instanceof Line){const center=new Point((next.start.x+next.end.x)/2,(next.start.y+next.end.y)/2),matrix=object.calcOwnMatrix();object.set({x1:next.start.x,y1:next.start.y,x2:next.end.x,y2:next.end.y,originX:'center',originY:'center'});util.applyTransformToObject(object,util.multiplyTransformMatrices(matrix,[1,0,0,1,center.x,center.y]));object.setCoords();object.group?.triggerLayout();}
  else replaceGeometry(object,next);
  object.set('dirty',true);object.canvas?.requestRenderAll();return true;
}
/** Install only endpoint handles. Canvas finalizes one object:modified on mouse
 * up because actionPerformed is true; controls never commit on each move. */
export function installLineControls(object:FabricObject):void{
  if(!isEditableLine(object))return;
  if(object.controls.start?.actionName==='modifyLine'&&object.controls.end?.actionName==='modifyLine')return;
  const controls:Record<string,Control>={};
  for(const end of ['start','end'] as const)controls[end]=new Control({actionName:'modifyLine',cursorStyle:'crosshair',sizeX:12,sizeY:12,touchSizeX:28,touchSizeY:28,positionHandler:(_dimensions,_matrix,target)=>getLineEndpoints(target as FabricObject)[end].transform(target.getViewportTransform()),actionHandler:(_event:TPointerEvent,transform:Transform,x:number,y:number)=>{const target=transform.target,scene=target.group?new Point(x,y).transform(target.group.calcTransformMatrix()):new Point(x,y);return moveLineEndpoint(target,end,scene);},render:(context,left,top,_style,target)=>{context.save();context.beginPath();context.arc(left,top,5,0,Math.PI*2);context.fillStyle='#ffffff';context.fill();context.strokeStyle=target.borderColor||'#8b3dff';context.lineWidth=2;context.stroke();context.restore();}});
  object.controls=controls;object.setCoords();
}
