import {ActiveSelection,Circle,Ellipse,FabricImage,FabricObject,Group,Line,Path,Polygon,Rect,Shadow,StaticCanvas,Triangle,loadSVGFromString,util} from 'fabric';
import {FRAME_PLACEHOLDER_ART} from './frames';
import type {ElementMetadata} from './editor-types';

export interface ShapeFrameMetadata {
  id?:string;visroName?:string;visroFrame:'custom-shape';visroEmptyFrame:true;visroMetadata?:ElementMetadata;
}
export type ConvertedShapeFrame=FabricImage&ShapeFrameMetadata;
type NamedShape=FabricObject&{id?:string;visroName?:string;visroMetadata?:ElementMetadata};
let placeholder:Promise<string>|undefined;
/** One locally rasterized copy of the original frame-library artwork; no fonts or network resources. */
export function getShapeFramePlaceholder():Promise<string>{
  if(!placeholder)placeholder=(async()=>{
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 100 100">${FRAME_PLACEHOLDER_ART}</svg>`;
    const parsed=await loadSVGFromString(svg),surface=new StaticCanvas(util.createCanvasElement(),{width:1000,height:1000,enableRetinaScaling:false,renderOnAddRemove:false});
    try{surface.add(...parsed.objects.filter((object):object is FabricObject=>!!object));surface.renderAll();return surface.toDataURL({format:'png',multiplier:1});}
    finally{await surface.dispose();}
  })().catch(error=>{placeholder=undefined;throw error;});
  return placeholder;
}
function supported(object:FabricObject):boolean{
  return !(object instanceof Group||object instanceof ActiveSelection||object instanceof FabricImage||object instanceof Line)
    &&(object instanceof Circle||object instanceof Ellipse||object instanceof Rect||object instanceof Triangle||object instanceof Polygon||object instanceof Path)
    &&Number.isFinite(object.width)&&Number.isFinite(object.height)&&object.width>0&&object.height>0
    &&Boolean(object.fill&&object.fill!=='none'&&object.fill!=='transparent');
}
/** Convert the actual native filled silhouette, rather than approximating it with a catalog ID.
 * The returned image is detached and uses scene coordinates; the caller owns insertion/history.
 * Fill/stroke colors become photo content. Opacity, shadow, blend mode and metadata are retained. */
export async function convertShapeToFrameObject(previous:FabricObject,options?:{signal?:AbortSignal}):Promise<ConvertedShapeFrame>{
  if(!supported(previous))throw new Error('Choose a filled native shape. Text, groups, images and lines cannot become a frame.');
  options?.signal?.throwIfAborted();
  // Snapshot before any await: selection or unrelated edits cannot alter the requested conversion.
  const named=previous as NamedShape,sourceMatrix=[...previous.calcTransformMatrix()] as [number,number,number,number,number,number],width=previous.width,height=previous.height,originX=previous.originX,originY=previous.originY,flipX=previous.flipX;
  const metadata=named.visroMetadata?JSON.parse(JSON.stringify(named.visroMetadata)) as ElementMetadata:undefined;
  const identity={id:named.id,name:named.visroName??previous.type,opacity:previous.opacity,visible:previous.visible,blend:previous.globalCompositeOperation,shadow:previous.shadow?.toObject()};
  const absoluteClip=previous.clipPath?.absolutePositioned?util.multiplyTransformMatrices(util.invertTransform(sourceMatrix),previous.clipPath.calcTransformMatrix()):undefined;
  const [mask,data]=await Promise.all([previous.clone(),getShapeFramePlaceholder()]);
  options?.signal?.throwIfAborted();
  const image=await FabricImage.fromURL(data,{signal:options?.signal});
  options?.signal?.throwIfAborted();
  const cropWidth=Math.min(image.width,image.height*width/height),cropHeight=cropWidth*height/width,ratio=cropWidth/width;
  image.set({originX,originY,width:cropWidth,height:cropHeight,cropX:(1000-cropWidth)/2,cropY:(1000-cropHeight)/2,strokeWidth:0,opacity:identity.opacity,visible:identity.visible,globalCompositeOperation:identity.blend,shadow:identity.shadow?new Shadow(identity.shadow):null});
  // A clone of Circle/Rect/Path/Polygon retains its complete native geometry and fill rule.
  // Object transforms belong on the image; its clip is centered in the image's local plane.
  mask.set({originX:'center',originY:'center',left:0,top:0,scaleX:ratio,scaleY:ratio,angle:0,skewX:0,skewY:0,flipX:false,flipY:false,fill:'#000000',stroke:null,strokeWidth:0,shadow:null,opacity:1,visible:true,absolutePositioned:false,inverted:false});
  for(const key of ['id','visroName','visroLocked','visroMetadata','visroShapeType'])delete (mask as unknown as Record<string,unknown>)[key];
  if(absoluteClip&&mask.clipPath){mask.clipPath.set('absolutePositioned',false);util.applyTransformToObject(mask.clipPath,absoluteClip);}
  image.set('clipPath',mask);
  util.applyTransformToObject(image,util.multiplyTransformMatrices(sourceMatrix,[1/ratio,0,0,1/ratio,0,0]));
  // Keep an existing horizontal flip represented as such, while preserving the exact scene matrix.
  if(!previous.group&&image.flipX!==flipX){const center=image.getCenterPoint();image.set({flipX:!image.flipX,flipY:!image.flipY,angle:image.angle+180});image.setPositionByOrigin(center,'center','center');}
  image.setCoords();const result=image as ConvertedShapeFrame;
  result.id=identity.id;result.visroName=`${identity.name} frame`;result.visroFrame='custom-shape';result.visroEmptyFrame=true;if(metadata)result.visroMetadata=metadata;
  return result;
}
