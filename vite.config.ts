import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {extractFile} from "@electron/asar";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import type {Connect} from "vite";
function localTypeface() {
  let response:string|undefined;
  const middleware:Connect.NextHandleFunction=(req,res,next)=>{
    if(req.url?.split('?')[0]!=="/local-typeface")return next();
    if(req.method!=="GET"){res.statusCode=405;res.end();return;}
    if(response===undefined){try{
      const data=extractFile("/Applications/Canva.app/Contents/Resources/app.asar","dist/renderer/desktop_chrome_v2/images/cff149ee1e9d2be50ac77bcd86769d05.woff2");
      response=data.length<=1024*1024&&data.subarray(0,4).toString()==="wOF2"?JSON.stringify({name:"Canva Sans",data:`data:font/woff2;base64,${data.toString('base64')}`}):"null";
    }catch{response="null";}}
    res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");res.end(response);
  };
  return {name:"local-installed-typeface",configureServer(server:{middlewares:Connect.Server}){server.middlewares.use(middleware);},configurePreviewServer(server:{middlewares:Connect.Server}){server.middlewares.use(middleware);}};
}
function publicImageAPI(){
  let service:{search:(input:unknown)=>Promise<unknown>;get:(input:unknown)=>Promise<unknown>}|undefined;
  const middleware:Connect.NextHandleFunction=(req,res,next)=>{
    const path=req.url?.split('?')[0];if(path!=='/api/public-images/search'&&path!=='/api/public-images/get')return next();
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    if(req.method!=='POST'){res.statusCode=405;res.end(JSON.stringify({error:'Use POST for photo search.'}));return;}
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end(JSON.stringify({error:'Photo requests must come from this editor.'}));return;}
    void(async()=>{
      let body='';for await(const part of req){body+=part.toString();if(Buffer.byteLength(body)>4096){res.statusCode=413;res.end(JSON.stringify({error:'This photo request is too large.'}));return;}}
      const input=JSON.parse(body);
      service??=createRequire(import.meta.url)('./electron/public-images.cjs').createPublicImageService({root:join(homedir(),'Library','Caches','Visro-public-images-web')});
      const data=await service![path.endsWith('/search')?'search':'get'](input);res.end(JSON.stringify(data));
    })().catch(error=>{if(!res.writableEnded){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'Photo search is unavailable.'}));}});
  };
  return{name:'public-domain-photo-library',configureServer(server:{middlewares:Connect.Server}){server.middlewares.use(middleware);},configurePreviewServer(server:{middlewares:Connect.Server}){server.middlewares.use(middleware);}};
}
export default defineConfig({
  plugins: [react(),localTypeface(),publicImageAPI()],
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
  optimizeDeps: { include: ["jszip"], exclude: ["@imgly/background-removal"] },
  worker: { format: "es" },
});
