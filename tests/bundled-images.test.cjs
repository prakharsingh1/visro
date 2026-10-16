const {test}=require('node:test');
const assert=require('node:assert/strict');
const helper=import('../src/bundled-images.ts');
test('bundled photos become portable bytes and share an in-flight local fetch',async(t)=>{
 const {inlineBundledImage}=await helper;const previousFetch=global.fetch,previousDocument=global.document;
 t.after(()=>{global.fetch=previousFetch;global.document=previousDocument;});
 global.document={baseURI:'https://example.org/visro/index.html'};let requests=0;
 global.fetch=async url=>{requests++;assert.equal(url.href,'https://example.org/template-photos/test-portable.jpg');return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});};
 const [first,second]=await Promise.all([inlineBundledImage('/template-photos/test-portable.jpg'),inlineBundledImage('/template-photos/test-portable.jpg')]);
 assert.equal(first,'data:image/jpeg;base64,AQID');assert.equal(second,first);assert.equal(requests,1);
 assert.equal(await inlineBundledImage('data:image/png;base64,AAAA'),'data:image/png;base64,AAAA');assert.equal(requests,1);
});
test('missing or invalid bundled photos fail before design replacement and can be retried',async(t)=>{
 const {inlineBundledImage}=await helper;const previousFetch=global.fetch,previousDocument=global.document;
 t.after(()=>{global.fetch=previousFetch;global.document=previousDocument;});
 global.document={baseURI:'https://example.org/visro/'};
 global.fetch=async()=>new Response('<html>missing</html>',{headers:{'content-type':'text/html'}});
 await assert.rejects(inlineBundledImage('/template-photos/test-retry.jpg'),/unsupported format/);
 global.fetch=async()=>new Response(new Uint8Array([4,5,6]),{headers:{'content-type':'image/jpeg'}});
 assert.equal(await inlineBundledImage('/template-photos/test-retry.jpg'),'data:image/jpeg;base64,BAUG');
});
