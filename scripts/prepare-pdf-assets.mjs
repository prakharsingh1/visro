import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['standard_fonts','cmaps','wasm','iccs']){
  const target=path.join(root,'public/pdf-assets',name);await mkdir(target,{recursive:true});
  await cp(path.join(root,'node_modules/pdfjs-dist',name),target,{recursive:true});
}
console.log('Local PDF fonts, character maps and decoders are ready.');
