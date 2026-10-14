import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {extractFile} from "@electron/asar";
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
export default defineConfig({
  plugins: [react(),localTypeface()],
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
  optimizeDeps: { exclude: ["@imgly/background-removal"] },
  worker: { format: "es" },
});
