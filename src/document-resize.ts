import {FabricObject,Group,util,type TMat2D} from 'fabric';
import {sanitizeLineGeometry,syncLineSubtree} from './line-editing';

type SerializedObject=Record<string,unknown>;
const GEOMETRY=['left','top','width','height','originX','originY','angle','scaleX','scaleY','skewX','skewY','flipX','flipY','strokeWidth','strokeUniform'] as const;
const geometry=(object:SerializedObject)=>Object.fromEntries(GEOMETRY.filter(key=>object[key]!==undefined).map(key=>[key,object[key]]));
const isConnector=(object:SerializedObject)=>String(object.type).toLowerCase()==='group'&&Boolean(sanitizeLineGeometry(object.visroLine));
function containsConnector(object:SerializedObject):boolean{return isConnector(object)||Array.isArray(object.objects)&&object.objects.some(child=>containsConnector(child as SerializedObject));}

/** Only connector branches need native relayout. Other leaves are geometry-only
 * shells, so even an image sibling never decodes its original raster asset. */
function shell(object:SerializedObject):SerializedObject {
  if(isConnector(object))return object;
  return Array.isArray(object.objects)?{...geometry(object),type:'Group',layoutManager:object.layoutManager,objects:object.objects.map(child=>shell(child as SerializedObject))}:{...geometry(object),type:'FabricObject'};
}
function mergeGeometry(original:SerializedObject,object:FabricObject):SerializedObject {
  const result={...original,...geometry(object as unknown as SerializedObject)};
  if(isConnector(original))return{...original,...object.toObject(FabricObject.customProperties)};
  if(object instanceof Group&&Array.isArray(original.objects))result.objects=original.objects.map((child,index)=>mergeGeometry(child as SerializedObject,object.getObjects()[index]));
  return result;
}

/** Apply a document-plane affine to saved objects without loading entire pages.
 * Connector markers are rebuilt under their complete new parent transform. */
export async function resizeSerializedObjects(objects:SerializedObject[],matrix:TMat2D,options:{signal?:AbortSignal}={}):Promise<SerializedObject[]> {
  const result:SerializedObject[]=[];
  for(const original of objects){
    options.signal?.throwIfAborted();
    if(containsConnector(original)){
      const [object]=await util.enlivenObjects<FabricObject>([shell(original)],options);
      try{util.applyTransformToObject(object,util.multiplyTransformMatrices(matrix,object.calcOwnMatrix()));syncLineSubtree(object);result.push(mergeGeometry(original,object));}
      finally{object.dispose();}
    }else{
      const object=new FabricObject(geometry(original));
      try{util.applyTransformToObject(object,util.multiplyTransformMatrices(matrix,object.calcOwnMatrix()));result.push({...original,...geometry(object as unknown as SerializedObject)});}
      finally{object.dispose();}
    }
  }
  return result;
}
