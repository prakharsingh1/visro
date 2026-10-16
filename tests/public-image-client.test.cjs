const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const {transformSync}=require('esbuild');

const source=transformSync(readFileSync(join(__dirname,'../src/public-images.ts'),'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
const image=id=>({id,data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+X9YQAAAAASUVORK5CYII=',mime:'image/png',bytes:68,imageWidth:1,imageHeight:1});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function client(desktop,fetch){
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,require:name=>{assert.equal(name,'./bridge');return{desktop};},DOMException,AbortController,fetch});
  return module.exports;
}
function controlled(){
  const calls=[];let running=0,max=0;
  const api=client({getPublicImage(input){const task=deferred();calls.push({input,...task});max=Math.max(max,++running);return task.promise.finally(()=>running--);}});
  return{api,calls,get max(){return max;}};
}

test('thumbnail loading caps actual concurrent transfers and reuses completed photos',async()=>{
  const fixture=controlled();
  const requests=Array.from({length:8},(_,n)=>fixture.api.getPublicImage({id:`commons:${n+1}`}));
  assert.equal(fixture.calls.length,3);
  for(let i=0;i<8;i++){fixture.calls[i].resolve(image(fixture.calls[i].input.id));await settle();}
  await Promise.all(requests);assert.equal(fixture.max,3);
  await fixture.api.getPublicImage({id:'commons:1'});assert.equal(fixture.calls.length,8);
});

test('cancelling one thumbnail consumer preserves another consumer of the same transfer',async()=>{
  const fixture=controlled(),abort=new AbortController();
  const canceled=fixture.api.getPublicImage({id:'commons:99'},abort.signal).catch(error=>error);
  const remaining=fixture.api.getPublicImage({id:'commons:99'});
  abort.abort();assert.equal((await canceled).name,'AbortError');assert.equal(fixture.calls.length,1);
  fixture.calls[0].resolve(image('commons:99'));assert.equal((await remaining).id,'commons:99');
});

test('cancel then immediate retry does not join the abandoned transfer or lose its new subscribers',async()=>{
  const fixture=controlled(),abort=new AbortController();
  const canceled=fixture.api.getPublicImage({id:'commons:100'},abort.signal).catch(error=>error);
  abort.abort();assert.equal((await canceled).name,'AbortError');
  const retry=fixture.api.getPublicImage({id:'commons:100'});assert.equal(fixture.calls.length,2);
  fixture.calls[0].resolve(image('commons:100'));await settle();
  const joined=fixture.api.getPublicImage({id:'commons:100'});assert.equal(fixture.calls.length,2,'old completion must not remove the newer pending transfer');
  fixture.calls[1].resolve(image('commons:100'));await Promise.all([retry,joined]);
});

test('cancelled native transfers retain their slots until IPC actually finishes',async()=>{
  const fixture=controlled(),controllers=Array.from({length:3},()=>new AbortController());
  const requests=controllers.map((abort,n)=>fixture.api.getPublicImage({id:`commons:${n+1}`},abort.signal).catch(error=>error));
  controllers.forEach(abort=>abort.abort());assert.ok((await Promise.all(requests)).every(error=>error.name==='AbortError'));
  const retry=fixture.api.getPublicImage({id:'commons:4'});assert.equal(fixture.calls.length,3,'cancellation must not free an IPC slot prematurely');
  fixture.calls[0].resolve(image('commons:1'));await settle();assert.equal(fixture.calls.length,4);
  fixture.calls.slice(1).forEach(call=>call.resolve(image(call.input.id)));await retry;await settle();assert.equal(fixture.max,3);
});

test('a requested full image gets the next slot before queued offscreen thumbnails',async()=>{
  const fixture=controlled();
  const thumbnails=Array.from({length:5},(_,n)=>fixture.api.getPublicImage({id:`commons:${n+1}`}));
  const full=fixture.api.getPublicImage({id:'commons:200',size:'image'});
  fixture.calls[0].resolve(image('commons:1'));await settle();assert.equal(fixture.calls[3].input.id,'commons:200');
  for(let i=1;i<6;i++){fixture.calls[i].resolve(image(fixture.calls[i].input.id));await settle();}
  await Promise.all([...thumbnails,full]);
});

test('cancelled browser consumers keep transfer slots while the service is still working',async()=>{
  const calls=[];
  const api=client(undefined,async(path,options)=>{assert.equal(options.signal,undefined,'consumer cancellation must not pretend to cancel the service download');const task=deferred();calls.push({input:JSON.parse(options.body),...task});return task.promise;});
  const controllers=Array.from({length:3},()=>new AbortController());
  const canceled=controllers.map((abort,n)=>api.getPublicImage({id:`commons:${n+1}`},abort.signal).catch(error=>error));
  controllers.forEach(abort=>abort.abort());assert.ok((await Promise.all(canceled)).every(error=>error.name==='AbortError'));
  const next=api.getPublicImage({id:'commons:4'});assert.equal(calls.length,3);
  const complete=call=>call.resolve({ok:true,json:async()=>image(call.input.id)});
  complete(calls[0]);await settle();assert.equal(calls.length,4);
  calls.slice(1).forEach(complete);await next;await settle();
});

test('browser search forwards the license, offset and abort signal while bounding page size',async()=>{
  let endpoint,body,signal;
  const api=client(undefined,async(path,options)=>{endpoint=path;body=JSON.parse(options.body);signal=options.signal;return{ok:true,json:async()=>({provider:'wikimedia-commons',query:body.query,items:[],nextOffset:null})};});
  const abort=new AbortController();await api.searchPublicImages({query:' mountain ',limit:100,license:'cc0',offset:24},abort.signal);
  assert.equal(endpoint,'/api/public-images/search');assert.equal(body.query,'mountain');assert.equal(body.limit,30);assert.equal(body.license,'cc0');assert.equal(body.offset,24);assert.equal(signal,abort.signal);
  await api.searchPublicImages({query:'a'.repeat(150)});assert.equal(body.query.length,120,'client searches must respect the service limit');
});
