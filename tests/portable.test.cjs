const {test}=require('node:test');const assert=require('node:assert/strict');
test('portable image bundles preserve nested original photos and page edits without repeated image bytes',async()=>{
 const {packProject,unpackProject}=await import('../src/portable.ts');const {createProject}=await import('../src/project.ts');const project=createProject('Bulk campaign');const photo='data:image/png;base64,'+'A'.repeat(100000);
 project.pages[0].canvas.objects=[{type:'Group',objects:[{type:'Image',src:photo,visroOriginalSrc:photo,cropX:11,filters:[{type:'Contrast',contrast:.25}]}]}];
 for(let i=1;i<20;i++)project.pages.push({...project.pages[0],id:`page-${i}`,name:`Name ${i}`});
 const packed=packProject(project);assert.equal(Object.keys(packed.visroAssets).length,1);assert.ok(JSON.stringify(packed).length<140000);assert.deepEqual(unpackProject(JSON.parse(JSON.stringify(packed))),project);assert.equal(project.pages[0].canvas.objects[0].objects[0].src,photo);
});
test('portable import rejects missing images and executable/non-image bundled sources',async()=>{
 const {unpackProject}=await import('../src/portable.ts');assert.throws(()=>unpackProject({visroAssets:{'image-1':'javascript:alert(1)'}}),/invalid bundled/);assert.throws(()=>unpackProject({visroAssets:{},src:'visro-asset://image-2'}),/missing/);
 const old={version:1,pages:[]};assert.equal(unpackProject(old),old);
});
