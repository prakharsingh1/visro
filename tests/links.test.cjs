const {test}=require('node:test');
const assert=require('node:assert/strict');

test('exported hyperlink rectangles follow Fabric geometry for flipped and rotated objects',async()=>{
 const {Rect}=await import('fabric/node');
 const {pageLinks}=await import('../src/links.ts');
 for(const props of [
  {left:100,top:75,width:200,height:80,flipX:true},
  {left:320,top:190,width:130,height:90,originX:'center',originY:'center',angle:28,scaleX:1.4,scaleY:.8,flipY:true},
  {left:700,top:500,width:130,height:90,originX:'right',originY:'bottom',angle:-35,flipX:true,flipY:true},
 ]){
  const object=new Rect({...props,strokeWidth:0});
  const source=object.toObject();source.visroMetadata={link:'https://example.com/design',altText:'View design'};
  const [link]=pageLinks({width:1080,height:1080,pages:[{id:'page-1',canvas:{objects:[source]}}]},'page-1');
  const bounds=object.getBoundingRect();
  for(const key of ['left','top','width','height'])assert.ok(Math.abs(link[key]-bounds[key])<.001,`${key}: ${link[key]} != ${bounds[key]}`);
  assert.equal(link.label,'View design');
 }
});

test('nested group links preserve transforms and exclude hidden or unsafe links',async()=>{
 const {Rect,Group}=await import('fabric/node');
 const {pageLinks,escapeHTML}=await import('../src/links.ts');
 const child=new Rect({left:15,top:25,width:140,height:90,strokeWidth:0,flipX:true});
 const group=new Group([child],{left:200,top:250,angle:18,scaleX:1.5,scaleY:.75,strokeWidth:0});
 const source=group.toObject();source.objects[0].visroMetadata={link:'mailto:hello@example.com'};
 const project={width:1080,height:1080,pages:[{id:'page-1',canvas:{objects:[source,{type:'Rect',visible:false,visroMetadata:{link:'https://example.com'}},{type:'Rect',visroMetadata:{link:'javascript:alert(1)'}}]}}]};
 const links=pageLinks(project,'page-1');assert.equal(links.length,1);
 const bounds=child.getBoundingRect();for(const key of ['left','top','width','height'])assert.ok(Math.abs(links[0][key]-bounds[key])<.001,key);
 assert.equal(escapeHTML('<"&>'), '&lt;&quot;&amp;&gt;');
});
