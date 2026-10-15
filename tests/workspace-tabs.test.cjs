const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../src/workspace-tabs.ts');
test('workspace tabs bound persisted records and preserve unique ordered documents',async()=>{
  const {normalizeWorkspaceTabs}=await modulePromise;
  assert.deepEqual(normalizeWorkspaceTabs(null),[]);
  assert.deepEqual(normalizeWorkspaceTabs([null,{},true,{id:'a',name:'First'},{id:'a',name:'Duplicate'},{id:'',name:'Invalid'},{id:'b'}]),[{id:'a',name:'First'},{id:'b',name:'Untitled design'}]);
  const tabs=normalizeWorkspaceTabs(Array.from({length:25},(_,i)=>({id:String(i),name:'n'.repeat(300)})));
  assert.equal(tabs.length,20);assert.equal(tabs[0].id,'5');assert.equal(tabs[19].name.length,200);
});
test('opening or renaming a tab keeps its position and other documents',async()=>{
  const {upsertWorkspaceTab}=await modulePromise;
  const original=[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}];
  assert.deepEqual(upsertWorkspaceTab(original,{id:'a',name:'Renamed'}),[{id:'a',name:'Renamed'},original[1]]);
  assert.deepEqual(upsertWorkspaceTab(original,{id:'c',name:'Gamma'}),[...original,{id:'c',name:'Gamma'}]);
  assert.deepEqual(original,[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]);
});
