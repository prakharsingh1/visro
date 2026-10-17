const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {build}=require('esbuild');
const {IDBFactory,IDBObjectStore}=require('fake-indexeddb');
let storage,db;
const image='data:image/png;base64,aGVsbG8=';
const project=()=>({version:1,name:'Original artwork',width:400,height:200,pages:[{id:'cover',name:'Cover',background:'#ffcc33',canvas:{objects:[{type:'Rect',left:30,top:40,width:150,height:50,fill:'#ff0033'}]}},{id:'later',name:'Later',background:'#2244ff',canvas:{objects:[]}}],activePageId:'later',brand:{colors:[],fonts:[]}});
before(async()=>{
 global.indexedDB=new IDBFactory();
 const result=await build({entryPoints:[path.join(__dirname,'../src/storage.ts')],bundle:true,platform:'node',format:'esm',write:false});
 const file=path.join(__dirname,`thumbnail-storage-build-${process.pid}.mjs`);await fs.writeFile(file,result.outputFiles[0].text);
 try{storage=await import(pathToFileURL(file).href);}finally{await fs.unlink(file);}
 await storage.listDesignSummaries();
 db=await new Promise((resolve,reject)=>{const request=indexedDB.open('visro-studio',3);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
});
const row=(store,id)=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const write=(store,value)=>new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});

test('backfill preserves exact artwork, edited date, latest folder and star metadata in both stores',async()=>{
 const original=project(),id='thumbnail-metadata';await storage.storeDesign({id,name:'A real saved project',updated:123,project:original});
 const [summary]=await storage.listDesignSummaries();assert.equal(storage.needsDesignThumbnail(summary),true);
 const source=await storage.getDesignThumbnailSource(id,storage.designPreviewRevision(summary));
 assert.equal(source.project.pages.length,1);assert.equal(source.project.pages[0].id,'cover');assert.equal(source.project.activePageId,'cover');
 await storage.updateDesign(id,{folder:'folder-latest',starred:true});
 assert.equal(await storage.storeDesignThumbnail(source,image),true);
 for(const store of ['projects','summaries']){const r=await row(store,id);assert.equal(r.updated,123);assert.equal(r.folder,'folder-latest');assert.equal(r.starred,true);assert.equal(r.thumbnail,image);assert.equal(r.thumbnailRevision,source.revision);assert.equal(storage.needsDesignThumbnail(r),false);}
 assert.deepEqual((await row('projects',id)).project,original);
});

test('new autosave invalidates the old cover and defeats a late backfill even with an identical timestamp',async()=>{
 const id='thumbnail-new-autosave';await storage.storeDesign({id,name:id,updated:777,project:project(),thumbnail:image});
 const first=await row('projects',id);assert.equal(storage.needsDesignThumbnail(first),false);
 const source=await storage.getDesignThumbnailSource(id,storage.designPreviewRevision(first));
 const latest=project();latest.pages[0].canvas.objects[0].left=149;
 await storage.storeDesign({id,name:id,updated:777,project:latest});
 assert.equal(await storage.storeDesignThumbnail(source,'data:image/png;base64,bGF0ZQ=='),false);
 const current=await row('projects',id);assert.deepEqual(current.project,latest);assert.equal(current.thumbnail,image);assert.notEqual(current.previewRevision,first.previewRevision);assert.equal(storage.needsDesignThumbnail(current),true);
 assert.equal(await storage.getDesignThumbnailSource(id,source.revision),undefined);
});

test('trash and hard deletion cannot be undone or resurrected by an in-flight preview',async()=>{
 const id='thumbnail-deleted';await storage.storeDesign({id,name:id,updated:31,project:project()});const record=await row('projects',id),source=await storage.getDesignThumbnailSource(id,storage.designPreviewRevision(record));
 await storage.deleteDesign(id);const trashed=await row('projects',id);
 assert.equal(await storage.storeDesignThumbnail(source,image),false);assert.deepEqual(await row('projects',id),trashed);
 await new Promise((resolve,reject)=>{const t=db.transaction(['projects','summaries'],'readwrite');t.objectStore('projects').delete(id);t.objectStore('summaries').delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
 assert.equal(await storage.storeDesignThumbnail(source,image),false);assert.equal(await row('projects',id),undefined);assert.equal(await row('summaries',id),undefined);
});

test('legacy cover recovery hydrates only first-page media and does not migrate or mutate the original',async()=>{
 const id='thumbnail-legacy',p=project();
 p.pages[0].canvas.objects=[{type:'Image',src:{__visroMedia:'visro-media-v1',id:'only-cover-photo'}}];
 p.pages[1].canvas.objects=[{type:'Image',src:{__visroMedia:'visro-media-v1',id:'never-read-later-photo'}}];
 const original={id,name:id,updated:42,project:p,thumbnail:image,starred:true,folder:'folder-legacy'};
 await write('media',{id:'only-cover-photo',data:'data:image/png;base64,Y292ZXI='});await write('media',{id:'never-read-later-photo',data:'data:image/png;base64,bGF0ZXI='});await write('projects',original);
 const reads=[],get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){if(this.name==='media')reads.push(key);return get.call(this,key);};
 let source;try{source=await storage.getDesignThumbnailSource(id,'legacy:42');}finally{IDBObjectStore.prototype.get=get;}
 assert.deepEqual(reads,['only-cover-photo']);assert.equal(source.project.pages[0].canvas.objects[0].src,'data:image/png;base64,Y292ZXI=');assert.equal(source.project.pages.length,1);assert.deepEqual(await row('projects',id),original);
 assert.equal(storage.needsDesignThumbnail(original),true);assert.equal(await storage.storeDesignThumbnail(source,image),true);
 const recovered=await row('projects',id);assert.equal(recovered.thumbnailRevision,'legacy:42');assert.equal(recovered.previewRevision,undefined);assert.equal(recovered.updated,42);assert.deepEqual(recovered.project,p);assert.equal(storage.needsDesignThumbnail(recovered),false);
});

test('metadata updates leave a current cover current, while artwork replacement invalidates it',async()=>{
 const id='thumbnail-update-design';await storage.storeDesign({id,name:id,updated:91,project:project(),thumbnail:image});const first=await row('projects',id);
 await storage.updateDesign(id,{folder:'folder-after',starred:true});const metadata=await row('projects',id);assert.equal(metadata.previewRevision,first.previewRevision);assert.equal(storage.needsDesignThumbnail(metadata),false);
 const replacement=project();replacement.pages[0].background='#00ff77';await storage.updateDesign(id,{project:replacement});const changed=await row('projects',id);assert.notEqual(changed.previewRevision,first.previewRevision);assert.equal(storage.needsDesignThumbnail(changed),true);
 await assert.rejects(storage.storeDesignThumbnail({id,revision:changed.previewRevision},'https://foreign.example/image.png'),/preview/);assert.deepEqual(await row('projects',id),changed);
});

test('cancelled preview persistence leaves project and summary untouched',async()=>{
 const id='thumbnail-cancelled';await storage.storeDesign({id,name:id,updated:81,project:project()});const original=await row('projects',id),summary=await row('summaries',id),controller=new AbortController();controller.abort();
 await assert.rejects(storage.storeDesignThumbnail({id,revision:storage.designPreviewRevision(original)},image,controller.signal),error=>error.name==='AbortError');
 assert.deepEqual(await row('projects',id),original);assert.deepEqual(await row('summaries',id),summary);
});
