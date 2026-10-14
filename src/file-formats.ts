import type { StudioEditor } from "./editor";
import type { VisroProject } from "./editor-types";
import { createProject } from "./project";
import { saveExport } from "./bridge";
import { pageLinks } from "./links";
export async function importPDF(file:File,editor:StudioEditor,onProgress:(message:string)=>void) {
  if(file.size>40*1024*1024)throw new Error("Choose a PDF smaller than 40 MB.");
  const pdfjs=await import("pdfjs-dist");
  const worker=(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc=worker;
  const base=new URL("pdf-assets/",document.baseURI).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),enableXfa:false,useSystemFonts:true,standardFontDataUrl:base+"standard_fonts/",cMapUrl:base+"cmaps/",cMapPacked:true,wasmUrl:base+"wasm/",iccUrl:base+"iccs/"});
  const pdf=await task.promise;
  try {
    if(pdf.numPages>100)throw new Error("Import PDFs with at most 100 pages.");
    const first=await pdf.getPage(1),v=first.getViewport({scale:1.5});
    const w=Math.round(v.width),h=Math.round(v.height);
    await editor.loadProject(createProject(file.name.replace(/\.pdf$/i,""),w,h,"#ffffff"));
    for(let i=1;i<=pdf.numPages;i++){
      onProgress(`Importing PDF page ${i} of ${pdf.numPages}`);
      const page=await pdf.getPage(i),viewport=page.getViewport({scale:Math.min(1.5,4096/Math.max(page.getViewport({scale:1}).width,page.getViewport({scale:1}).height))});
      const canvas=document.createElement("canvas");canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
      await page.render({canvas,viewport}).promise;
      if(i>1)await editor.addPage();
      await editor.addImage(canvas.toDataURL("image/png"));
      const scale=Math.min(w/canvas.width,h/canvas.height);
      editor.updateSelected({left:(w-canvas.width*scale)/2,top:(h-canvas.height*scale)/2,width:canvas.width*scale,height:canvas.height*scale,name:`PDF page ${i}`});
      editor.renamePage(editor.getState().activePageId,`Page ${i}`);canvas.width=1;canvas.height=1;page.cleanup();
    }
    editor.fit();
  } finally { await task.destroy(); }
}
function hex(value:unknown,fallback="000000"):string {return typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)?value.slice(1):fallback;}
export async function exportPowerPoint(name:string,editor:StudioEditor) {
  const {default:PptxGenJS}=await import("pptxgenjs");
  const pptx=new PptxGenJS(),project=editor.serialize(name),pages=await editor.exportPages(1);
  pptx.defineLayout({name:"VISRO",width:project.width/96,height:project.height/96});pptx.layout="VISRO";pptx.author="Visro";pptx.subject="Created in Visro";pptx.title=name;pptx.company="Visro";
  for(let i=0;i<project.pages.length;i++){
    const page=project.pages[i],slide=pptx.addSlide();slide.background={color:hex(page.background,"FFFFFF")};
    if(page.metadata?.notes)slide.addNotes(page.metadata.notes);
    const objects=page.canvas.objects as Record<string,unknown>[];
    const complex=page.backgroundGradient||objects.some(o=>!['Textbox','IText','Text','Rect','Circle','Ellipse','Triangle','Line','Image'].includes(String(o.type))||typeof o.fill==='object'||o.clipPath||o.shadow||o.cropX||o.cropY||o.skewX||o.skewY||o.originX&&o.originX!=='left'||o.originY&&o.originY!=='top'||Array.isArray(o.filters)&&o.filters.length);
    if(complex){slide.addImage({data:pages[i].dataURL,x:0,y:0,w:project.width/96,h:project.height/96});for(const link of pageLinks(project,page.id)){if(/^(https?:\/\/|mailto:)/i.test(link.url))slide.addShape(pptx.ShapeType.rect,{x:link.left/96,y:link.top/96,w:link.width/96,h:link.height/96,fill:{color:'FFFFFF',transparency:100},line:{transparency:100},hyperlink:{url:link.url,tooltip:link.label}});}continue;}
    for(const o of objects){
      if(o.visible===false)continue;
      const sx=Number(o.scaleX)||1,sy=Number(o.scaleY)||1,opacity=Number(o.opacity??1);
      const x=(Number(o.left)||0)/96,y=(Number(o.top)||0)/96,w=(Number(o.width)||10)*sx/96,h=(Number(o.height)||10)*sy/96,rotate=Number(o.angle)||0;
      const metadata=o.visroMetadata as {link?:string}|undefined;
      const link=metadata?.link&&/^(https?:\/\/|mailto:)/i.test(metadata.link)?{hyperlink:{url:metadata.link}}:{};
      if(String(o.type).toLowerCase().includes("text"))slide.addText(String(o.text||""),{x,y,w,h,fontFace:String(o.fontFamily||"Arial"),fontSize:(Number(o.fontSize)||32)*sy*.75,color:hex(o.fill),bold:Number(o.fontWeight)>=600||o.fontWeight==="bold",italic:o.fontStyle==="italic",underline:o.underline?{style:"sng"}:undefined,strike:!!o.linethrough,align:(["left","center","right","justify"].includes(String(o.textAlign))?o.textAlign:"left") as "left",margin:0,breakLine:false,rotate,transparency:Math.round((1-opacity)*100),fit:"resize",valign:"top",...link});
      else if(o.type==="Image"&&typeof o.src==="string")slide.addImage({data:o.src,x,y,w,h,rotate,transparency:Math.round((1-opacity)*100),flipH:!!o.flipX,flipV:!!o.flipY,...link});
      else slide.addShape(o.type==="Circle"||o.type==="Ellipse"?pptx.ShapeType.ellipse:o.type==="Triangle"?pptx.ShapeType.triangle:o.type==="Line"?pptx.ShapeType.line:pptx.ShapeType.rect,{x,y,w,h,rotate,fill:{color:hex(o.fill,"FFFFFF"),transparency:Math.round((1-opacity)*100)},line:{color:hex(o.stroke,hex(o.fill,"FFFFFF")),width:(Number(o.strokeWidth)||0)*.75,transparency:o.stroke?0:100},...link});
    }
  }
  const base64=await pptx.write({outputType:"base64",compression:true});
  await saveExport(name,"pptx",`data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`);
}
