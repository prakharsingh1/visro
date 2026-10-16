import {desktop, type PublicImageResult, type PublicImageSearchResult} from './bridge';

export type PublicImageLicense = 'all' | 'public-domain' | 'cc0';
export interface PublicImageSearchInput {query:string;offset?:number;limit?:number;license?:PublicImageLicense}
export interface PublicImageInput {id:string;size?:'thumbnail'|'image'}

const MAX_THUMBNAIL_CACHE = 20 * 1024 * 1024;
const thumbnails = new Map<string, PublicImageResult>();
let thumbnailBytes = 0, active = 0;
type Job = {run:()=>Promise<PublicImageResult>;resolve:(value:PublicImageResult)=>void;reject:(error:unknown)=>void;signal?:AbortSignal;cancel?:()=>void};
const queue:Job[] = [];
type Shared = {promise:Promise<PublicImageResult>;controller:AbortController;users:number;done:boolean};
const pending = new Map<string, Shared>();
const aborted = () => new DOMException('The image request was cancelled.', 'AbortError');
export const isPublicImageAbort = (error:unknown):boolean => Boolean(error&&typeof error==='object'&&'name'in error&&error.name==='AbortError');

function checkSignal(signal?:AbortSignal):void {if(signal?.aborted)throw aborted();}
function abortable<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T> {
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(aborted());
  return new Promise((resolve,reject)=>{
    const stop=()=>{signal.removeEventListener('abort',stop);reject(aborted());};
    signal.addEventListener('abort',stop,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',stop);resolve(value);},error=>{signal.removeEventListener('abort',stop);reject(error);});
  });
}
async function request<T>(path:string,input:unknown,signal?:AbortSignal):Promise<T> {
  const response=await fetch(`/api/public-images/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof result?.error==='string'?result.error.slice(0,400):'The photo library is unavailable. Please try again.');
  return result as T;
}
export async function searchPublicImages(input:PublicImageSearchInput,signal?:AbortSignal):Promise<PublicImageSearchResult> {
  checkSignal(signal);
  const query={...input,query:input.query.trim().slice(0,120),limit:Math.min(30,Math.max(1,input.limit||24))};
  const result=await abortable(desktop?desktop.searchPublicImages(query):request<PublicImageSearchResult>('search',query,signal),signal);
  checkSignal(signal);
  if(!result||result.provider!=='wikimedia-commons'||!Array.isArray(result.items))throw new Error('The photo library returned an invalid result.');
  return result;
}
function pump():void {
  while(active<3&&queue.length){
    const job=queue.shift()!;
    if(job.cancel)job.signal?.removeEventListener('abort',job.cancel);
    if(job.signal?.aborted){job.reject(aborted());continue;}
    active++;
    void job.run().then(job.resolve,job.reject).finally(()=>{active--;pump();});
  }
}
function schedule(run:Job['run'],signal?:AbortSignal,priority=false):Promise<PublicImageResult> {
  checkSignal(signal);
  return new Promise((resolve,reject)=>{
    const job:Job={run,resolve,reject,signal};
    job.cancel=()=>{const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);reject(aborted());}};
    signal?.addEventListener('abort',job.cancel,{once:true});
    if(priority)queue.unshift(job);else queue.push(job);
    pump();
  });
}
async function download(input:PublicImageInput,signal?:AbortSignal):Promise<PublicImageResult> {
  checkSignal(signal);
  // Keep a transfer in the budget until its native or HTTP response settles.
  // Aborting browser fetch alone does not cancel the service's download, so
  // releasing that slot immediately can overload it during a query change.
  const result=desktop?await desktop.getPublicImage(input):await request<PublicImageResult>('get',input);
  checkSignal(signal);
  if(!result||result.id!==input.id||typeof result.data!=='string'||!/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(result.data)||result.data.length>48*1024*1024)throw new Error('This photo could not be decoded. Try a different image.');
  return result;
}
function remember(id:string,result:PublicImageResult):void {
  const previous=thumbnails.get(id);
  if(previous){thumbnailBytes-=previous.data.length*2;thumbnails.delete(id);}
  const bytes=result.data.length*2;
  if(bytes>MAX_THUMBNAIL_CACHE)return;
  thumbnails.set(id,result);thumbnailBytes+=bytes;
  while((thumbnailBytes>MAX_THUMBNAIL_CACHE||thumbnails.size>48)&&thumbnails.size){
    const oldest=thumbnails.keys().next().value!;
    thumbnailBytes-=thumbnails.get(oldest)!.data.length*2;thumbnails.delete(oldest);
  }
}
export function getPublicImage(input:PublicImageInput,signal?:AbortSignal):Promise<PublicImageResult> {
  checkSignal(signal);
  if(input.size==='image')return abortable(schedule(()=>download(input,signal),signal,true),signal);
  const cached=thumbnails.get(input.id);
  if(cached){thumbnails.delete(input.id);thumbnails.set(input.id,cached);return Promise.resolve(cached);}
  let shared=pending.get(input.id);
  if(!shared){
    const controller=new AbortController();
    const entry:Shared={controller,users:0,done:false,promise:Promise.resolve(null as unknown as PublicImageResult)};
    entry.promise=schedule(()=>download({...input,size:'thumbnail'},controller.signal),controller.signal).then(result=>{remember(input.id,result);return result;}).finally(()=>{entry.done=true;if(pending.get(input.id)===entry)pending.delete(input.id);});
    pending.set(input.id,entry);shared=entry;
  }
  const entry=shared;entry.users++;
  return new Promise((resolve,reject)=>{
    let finished=false;
    const release=()=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);entry.users--;if(!entry.users&&!entry.done){if(pending.get(input.id)===entry)pending.delete(input.id);entry.controller.abort();}};
    const cancel=()=>{release();reject(aborted());};
    signal?.addEventListener('abort',cancel,{once:true});
    entry.promise.then(result=>{release();resolve(result);},error=>{release();reject(error);});
  });
}
