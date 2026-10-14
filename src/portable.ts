import type {VisroProject} from './editor-types';
const prefix='visro-asset://';
const threshold=32*1024;
export interface PortableProject extends VisroProject {visroAssets?:Record<string,string>}
/** Portable files embed each reused image once; local storage remains independent. */
export function packProject(project:VisroProject):PortableProject{
 const assets:Record<string,string>={},sources=new Map<string,string>();
 const walk=(value:unknown):unknown=>{
  if(typeof value==='string'&&/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)&&value.length>=threshold){let id=sources.get(value);if(!id){id=`image-${sources.size+1}`;sources.set(value,id);assets[id]=value;}return prefix+id;}
  if(Array.isArray(value))return value.map(walk);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));
  return value;
 };
 const packed=walk(project) as PortableProject;if(sources.size)packed.visroAssets=assets;return packed;
}
export function unpackProject(project:unknown):unknown{
 if(!project||typeof project!=='object'||Array.isArray(project)||!('visroAssets'in project))return project;
 const assets=(project as PortableProject).visroAssets;
 if(!assets||typeof assets!=='object'||Array.isArray(assets)||Object.keys(assets).length>1000)throw new Error('This project has an invalid image bundle.');
 let size=0;
 for(const [id,data]of Object.entries(assets)){if(!/^image-\d+$/.test(id)||typeof data!=='string'||!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(data))throw new Error('This project contains an invalid bundled photo.');size+=data.length;if(size>100*1024*1024)throw new Error('This project contains more than 100 MB of photos.');}
 let count=0;
 const walk=(value:unknown,depth=0):unknown=>{
  if(depth>80||++count>1000000)throw new Error('This project is too complex to open.');
  if(typeof value==='string'&&value.startsWith(prefix)){const id=value.slice(prefix.length);if(!Object.hasOwn(assets,id))throw new Error('A bundled project photo is missing.');return assets[id];}
  if(Array.isArray(value))return value.map(v=>walk(v,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='visroAssets').map(([k,v])=>[k,walk(v,depth+1)]));
  return value;
 };return walk(project);
}
