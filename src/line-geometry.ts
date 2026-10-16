export type LineRoute='straight'|'elbow'|'curved';
export type LineMarker='none'|'arrow'|'circle-outline'|'square-outline'|'diamond-outline'|'bar'|'triangle'|'circle'|'square'|'diamond';
export interface LineStyle {route:LineRoute;startMarker:LineMarker;endMarker:LineMarker}
export interface LineGeometry extends LineStyle {version:1;start:{x:number;y:number};end:{x:number;y:number}}
export const LINE_MARKERS:{id:LineMarker;label:string}[]=[{id:'none',label:'No Marker'},{id:'arrow',label:'Arrow'},{id:'circle-outline',label:'Outline Circle'},{id:'square-outline',label:'Outline Square'},{id:'diamond-outline',label:'Outline Diamond'},{id:'bar',label:'Bar'},{id:'triangle',label:'Triangle'},{id:'circle',label:'Circle'},{id:'square',label:'Square'},{id:'diamond',label:'Diamond'}];
export const LINE_ROUTES:{id:LineRoute;label:string}[]=[{id:'straight',label:'Straight'},{id:'elbow',label:'Elbowed'},{id:'curved',label:'Curved'}];
export const isLinePoint=(value:unknown):value is {x:number;y:number}=>!!value&&typeof value==='object'&&Number.isFinite((value as {x:number;y:number}).x)&&Number.isFinite((value as {x:number;y:number}).y)&&Math.abs((value as {x:number;y:number}).x)<=1e7&&Math.abs((value as {x:number;y:number}).y)<=1e7;
/** Validate persisted data before it can influence native paths or controls. */
export function sanitizeLineGeometry(value:unknown):LineGeometry|undefined{
  if(!value||typeof value!=='object')return;const data=value as LineGeometry;
  if(data.version!==1||!isLinePoint(data.start)||!isLinePoint(data.end)||!LINE_ROUTES.some(item=>item.id===data.route)||!LINE_MARKERS.some(item=>item.id===data.startMarker)||!LINE_MARKERS.some(item=>item.id===data.endMarker))return;
  return{version:1,start:{x:data.start.x,y:data.start.y},end:{x:data.end.x,y:data.end.y},route:data.route,startMarker:data.startMarker,endMarker:data.endMarker};
}
