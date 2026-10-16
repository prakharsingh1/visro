const pending=new Map<string,Promise<string>>();
/** Embed the bundled photo bytes so saved/exported designs work offline and on another Mac. */
export async function inlineBundledImage(source:string):Promise<string>{
  if(!/^\/template-photos\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(source))return source;
  let request=pending.get(source);
  if(!request){request=(async()=>{
    const url=new URL(source,document.baseURI);
    const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('This bundled template photo could not be loaded.');
    const type=response.headers.get('content-type')?.split(';')[0]||'';
    if(!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('This template photo has an unsupported format.');
    if(Number(response.headers.get('content-length'))>10*1024*1024)throw new Error('This template photo is too large.');
    const data=new Uint8Array(await response.arrayBuffer());
    if(data.length>10*1024*1024)throw new Error('This template photo is too large.');
    const chunks:string[]=[];for(let offset=0;offset<data.length;offset+=32768)chunks.push(String.fromCharCode(...data.subarray(offset,offset+32768)));
    return `data:${type};base64,${btoa(chunks.join(''))}`;
  })();pending.set(source,request);void request.catch(()=>pending.delete(source));}
  return request;
}
