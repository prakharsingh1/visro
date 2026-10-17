/** Local, best-effort import of documented Canva export formats, never private Canva data. */
import JSZip from 'jszip';
import { Ellipse, FabricImage, FabricObject, Gradient, Group, Path, Polygon, Rect, Textbox, getEnv, loadSVGFromString, util, type TMat2D } from 'fabric';
import { createProject, newId, validateProject, MAX_DESIGN_SIZE } from './project';
import type { VisroProject } from './editor-types';
import { SHAPE_LIBRARY } from './shapes';
import { FONT_FAMILIES } from './font-catalog';

export interface CanvaImportIssue { page: number; kind: 'unsupported'|'appearance'|'font'|'source'; detail: string; }
export interface CanvaImportReport { format: 'pptx'|'svg'; pages: number; layers: number; textLayers: number; imageLayers: number; vectorLayers: number; groups: number; issues: CanvaImportIssue[]; fonts: string[]; }
export interface CanvaImportResult { project: VisroProject; report: CanvaImportReport; }
const MAX_INPUT=40*1024*1024, MAX_XML=6*1024*1024, MAX_EXPANDED=100*1024*1024, MAX_LAYERS=2000;
const IDENTITY:TMat2D=[1,0,0,1,0,0];
const emu=(value:unknown)=>finite(value)/9525;
function finite(value:unknown,fallback=0){const result=Number(value);return Number.isFinite(result)?result:fallback;}
function local(node:Element){return node.localName||node.tagName.split(':').at(-1)||'';}
function children(node:Element|Document,name?:string):Element[]{return Array.from(node.children).filter(child=>!name||local(child)===name);}
function child(node:Element|Document|undefined,name:string):Element|undefined{return node?children(node,name)[0]:undefined;}
function descendants(node:Element|Document,name:string):Element[]{return Array.from(node.getElementsByTagName('*')).filter(element=>local(element)===name);}
function attr(node:Element|undefined,name:string,fallback=''){return node?.getAttribute(name)??fallback;}
function xml(source:string):Document {
  if(source.length>MAX_XML||/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('This export contains oversized or unsafe XML.');
  const Parser=(getEnv().window as unknown as {DOMParser:typeof DOMParser}).DOMParser;
  const parsed=new Parser().parseFromString(source,'application/xml');
  if(parsed.getElementsByTagName('*').length>20000)throw new Error('This export contains too many XML elements.');
  if(descendants(parsed,'parsererror').length)throw new Error('This export contains invalid XML.');
  return parsed;
}
function label<T extends FabricObject>(object:T,name:string):T {Object.assign(object,{id:newId('import'),name:name.slice(0,180),visroName:name.slice(0,180)});object.set({stroke:object.stroke??null,strokeDashArray:object.strokeDashArray??null});return object;}
function serialize(object:FabricObject){return object.toObject(['id','name','visroName','visroMetadata']);}
function issue(report:CanvaImportReport,page:number,kind:CanvaImportIssue['kind'],detail:string){if(!report.issues.some(item=>item.page===page&&item.kind===kind&&item.detail===detail))report.issues.push({page,kind,detail});}
function reportFor(format:CanvaImportReport['format']):CanvaImportReport{return {format,pages:0,layers:0,textLayers:0,imageLayers:0,vectorLayers:0,groups:0,issues:[],fonts:[]};}
function tally(report:CanvaImportReport,objects:FabricObject[]){for(const object of objects){if(object instanceof Group){report.groups++;tally(report,object.getObjects());}else{report.layers++;if(object instanceof Textbox||/text/i.test(object.type))report.textLayers++;else if(object instanceof FabricImage)report.imageLayers++;else report.vectorLayers++;}}}
function checkLayers(objects:FabricObject[],page:number){let count=0;const visit=(items:FabricObject[])=>{for(const item of items){if(++count>MAX_LAYERS)throw new Error(`Page ${page} contains more than ${MAX_LAYERS} layers.`);if(item instanceof Group)visit(item.getObjects());}};visit(objects);}
function addFont(report:CanvaImportReport,page:number,font:string){if(!font)return;if(!report.fonts.includes(font))report.fonts.push(font);if(!FONT_FAMILIES.includes(font)&&!['Arial','Helvetica','Times New Roman','Georgia','Verdana','Courier New','Trebuchet MS'].includes(font))issue(report,page,'font',`${font} is not bundled. Install it locally or choose another font if the appearance differs.`);}
function matrix(x:number,y:number,w:number,h:number,angle=0,flipX=false,flipY=false):TMat2D {
  const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),sx=flipX?-1:1,sy=flipY?-1:1;
  return [c*sx,s*sx,-s*sy,c*sy,x+w/2,y+h/2];
}
function transformed<T extends FabricObject>(object:T,transform:TMat2D){util.applyTransformToObject(object,transform);object.setCoords();return object;}

/** SVG text outlined by the exporter remains editable paths, not recoverable text. */
export async function parseCanvaSVG(source:string,name='Imported Canva design'):Promise<CanvaImportResult> {
  const document=xml(source),root=document.documentElement,report=reportFor('svg');
  if(local(root)!=='svg')throw new Error('Choose an SVG design exported from Canva.');
  const all=[root,...Array.from(root.getElementsByTagName('*'))];
  if(all.length>12000)throw new Error('Choose an SVG with fewer than 12,000 XML elements.');
  for(const element of all){
    if(['script','foreignObject','iframe','audio','video','animate','animateTransform','set'].includes(local(element)))throw new Error('This SVG contains active or animated content. Export a static SVG from Canva.');
    for(const attribute of Array.from(element.attributes)){
      const value=attribute.value.trim();
      if(/^on/i.test(attribute.name)||/(?:javascript|file):/i.test(value))throw new Error('This SVG contains unsafe active content.');
      if(/(?:^|:)href$/i.test(attribute.name)&&value&&!value.startsWith('#')&&!/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value))throw new Error('This SVG links to external media. Export with embedded images so it can work offline.');
      for(const match of value.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi))if(!match[1].startsWith('#'))throw new Error('This SVG uses external resources. Export a self-contained SVG.');
      if(/@import|@font-face/i.test(value))throw new Error('This SVG contains external styling. Export a self-contained SVG.');
    }
    if(local(element)==='style'){const style=element.textContent||'';if(/@import|@font-face/i.test(style))throw new Error('This SVG contains external styles. Export a self-contained SVG.');for(const match of style.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi))if(!match[1].startsWith('#'))throw new Error('This SVG contains external styles. Export a self-contained SVG.');}
  }
  const viewBox=attr(root,'viewBox').trim().split(/[ ,]+/).map(Number),unit=(value:string)=>/^\d+(?:\.\d+)?(?:px)?$/.test(value)?parseFloat(value):NaN;
  const width=unit(attr(root,'width'))||viewBox[2],height=unit(attr(root,'height'))||viewBox[3];
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<16||height<16||width>MAX_DESIGN_SIZE||height>MAX_DESIGN_SIZE)throw new Error(`SVG dimensions must be between 16 and ${MAX_DESIGN_SIZE} pixels.`);
  if(all.some(element=>['filter','mask','pattern'].includes(local(element))))issue(report,1,'appearance','SVG filters, masks and patterns can differ in Visro. Check the imported artwork against your export.');
  const byElement=new Map<Element,FabricObject>();let parsedRoot:Element|undefined;
  const parsed=await loadSVGFromString(source,(element,object)=>{byElement.set(element,object);parsedRoot=element.ownerDocument.documentElement;},{crossOrigin:'anonymous'});
  const replacements=new Map<FabricObject,FabricObject>();
  for(const object of parsed.objects){if(!object||!/text/i.test(object.type)||object instanceof Textbox)continue;const raw=object as FabricObject&{text:string;styles:Textbox['styles']};const properties=object.toObject();delete properties.type;delete properties.version;const editable=new Textbox(raw.text,{...properties,width:Math.max(1,object.width),styles:raw.styles,clipPath:object.clipPath});transformed(editable,object.calcTransformMatrix());replacements.set(object,editable);}
  for(const [element,object] of byElement)if(replacements.has(object))byElement.set(element,replacements.get(object)!);
  const supported=parsed.objects.filter((object):object is FabricObject=>!!object).map(object=>replacements.get(object)||object),used=new Set<FabricObject>();
  const walk=(element:Element,depth=0):FabricObject[]=>{
    if(depth>32)throw new Error('This SVG contains groups nested too deeply.');
    const object=byElement.get(element);if(object&&supported.includes(object)){used.add(object);return [label(object,attr(element,'aria-label')||attr(element,'id')||`${local(element)} layer`)];}
    if(['defs','clipPath','mask','filter','symbol','style','metadata','title','desc'].includes(local(element)))return [];
    const nested=children(element).flatMap(item=>walk(item,depth+1));
    if(local(element)==='g'&&nested.length)return [label(new Group(nested),attr(element,'aria-label')||attr(element,'id')||'SVG group')];
    return nested;
  };
  const objects=walk(parsedRoot||root);for(const object of supported)if(!used.has(object))objects.push(label(object,'SVG layer'));
  if(!objects.length)throw new Error('This SVG contains no supported editable layers.');
  checkLayers(objects,1);tally(report,objects);report.pages=1;
  for(const element of all.filter(element=>local(element)==='text'))addFont(report,1,attr(element,'font-family')||'Times New Roman');
  if(!report.textLayers)issue(report,1,'source','This SVG has no live text. Letters exported as outlines remain editable vector paths; original text and Canva layer names cannot be recovered.');
  issue(report,1,'source','SVG preserves the vector/image structure in the export, which can differ from Canva’s original layer hierarchy.');
  const project=createProject(name,width,height,'#ffffff');project.pages[0].canvas={version:'7.4.0',objects:objects.map(serialize),background:'#ffffff'};project.brand.fonts=report.fonts.slice(0,32);
  return {project:validateProject(project),report};
}

interface ZipReader {text(path:string):Promise<string>;bytes(path:string):Promise<Uint8Array>;has(path:string):boolean;}
async function archive(data:ArrayBuffer):Promise<ZipReader>{
  if(data.byteLength>MAX_INPUT)throw new Error('Choose a PowerPoint smaller than 40 MB.');
  const zip=await JSZip.loadAsync(data,{checkCRC32:false,createFolders:false});let expanded=0;const cached=new Map<string,Uint8Array>();
  const files=Object.values(zip.files).filter(file=>!file.dir);
  if(files.length>5000)throw new Error('This PowerPoint contains too many archived files.');
  for(const file of files){
    if(file.unsafeOriginalName&&file.unsafeOriginalName!==file.name)throw new Error('This PowerPoint contains unsafe archive paths.');
    const size=finite((file as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize);
    expanded+=size;if(size>MAX_EXPANDED||expanded>MAX_EXPANDED)throw new Error('Choose a PowerPoint with less than 100 MB of expanded content.');
  }
  let extracted=0;
  const bytes=async(path:string)=>{if(cached.has(path))return cached.get(path)!;const file=zip.file(path);if(!file)throw new Error(`This PowerPoint is missing ${path}.`);const data=await file.async('uint8array');extracted+=data.byteLength;if(extracted>MAX_EXPANDED)throw new Error('This PowerPoint expands beyond the 100 MB import limit.');cached.set(path,data);return data;};
  return {has:path=>!!zip.file(path),bytes,text:async path=>{const data=await bytes(path);if(data.byteLength>MAX_XML)throw new Error('This PowerPoint contains oversized slide XML.');return new TextDecoder().decode(data);}};
}
function pathTo(base:string,target:string){if(/^[a-z]+:|^\/\/|\\/i.test(target))return null;const result=target.startsWith('/')?[]:base.split('/').slice(0,-1);for(const part of target.split('/')){if(part==='..'){if(!result.length)return null;result.pop();}else if(part&&part!=='.')result.push(part);}return result.join('/');}
function relPath(path:string){const pieces=path.split('/'),file=pieces.pop();return [...pieces,'_rels',`${file}.rels`].join('/');}
interface Relationship {path:string|null;type:string;external:boolean;target:string}
async function relationships(zip:ZipReader,path:string){const result=new Map<string,Relationship>(),rels=relPath(path);if(!zip.has(rels))return result;for(const relation of descendants(xml(await zip.text(rels)),'Relationship')){const target=attr(relation,'Target'),external=attr(relation,'TargetMode')==='External';result.set(attr(relation,'Id'),{path:external?null:pathTo(path,target),type:attr(relation,'Type').split('/').at(-1)||'',external,target});}return result;}
function base64(bytes:Uint8Array){let result='';for(let offset=0;offset<bytes.length;offset+=8192)result+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(result);}
function color(node:Element|undefined,theme:Map<string,string>,fallback='#000000'):string{
  if(!node)return fallback;const colorNode=children(node).find(item=>['srgbClr','schemeClr','sysClr','prstClr'].includes(local(item)))||node;
  let value=local(colorNode)==='schemeClr'?theme.get(attr(colorNode,'val')):local(colorNode)==='sysClr'?attr(colorNode,'lastClr'):attr(colorNode,'val');
  if(!value||!/^#?[a-f0-9]{6}$/i.test(value))return fallback;value=value.replace('#','');let channels=[0,2,4].map(offset=>parseInt(value!.slice(offset,offset+2),16));
  for(const operation of children(colorNode)){const factor=finite(attr(operation,'val'))/100000;if(local(operation)==='lumMod'||local(operation)==='shade')channels=channels.map(channel=>channel*factor);if(local(operation)==='lumOff')channels=channels.map(channel=>channel+255*factor);if(local(operation)==='tint')channels=channels.map(channel=>channel+(255-channel)*factor);}
  return '#'+channels.map(channel=>Math.max(0,Math.min(255,Math.round(channel))).toString(16).padStart(2,'0')).join('');
}
/** DrawingML alpha belongs to an individual paint, not the entire shape. */
function paintColor(node:Element|undefined,theme:Map<string,string>):string {
  const value=color(node,theme),colorNode=node?children(node).find(item=>['srgbClr','schemeClr','sysClr','prstClr'].includes(local(item)))||node:undefined;
  const alpha=child(colorNode,'alpha');if(!alpha)return value;
  const opacity=Math.max(0,Math.min(1,finite(attr(alpha,'val'),100000)/100000));
  return `rgba(${parseInt(value.slice(1,3),16)},${parseInt(value.slice(3,5),16)},${parseInt(value.slice(5,7),16)},${opacity})`;
}
function fill(node:Element|undefined,theme:Map<string,string>):string|Gradient<'linear'>|null{
  if(!node||child(node,'noFill'))return null;const solid=child(node,'solidFill');if(solid)return paintColor(solid,theme);
  const gradient=child(node,'gradFill');if(gradient){const stops=descendants(gradient,'gs').map(stop=>({offset:finite(attr(stop,'pos'))/100000,color:paintColor(stop,theme)}));if(stops.length){const angle=finite(attr(child(gradient,'lin'),'ang'))/60000*Math.PI/180;return new Gradient({type:'linear',gradientUnits:'percentage',coords:{x1:.5-Math.cos(angle)/2,y1:.5-Math.sin(angle)/2,x2:.5+Math.cos(angle)/2,y2:.5+Math.sin(angle)/2},colorStops:stops});}}
  return null;
}
interface Box {x:number;y:number;w:number;h:number;angle:number;flipX:boolean;flipY:boolean}
function box(node:Element|undefined):Box|null{if(!node)return null;const offset=child(node,'off'),extent=child(node,'ext');if(!offset||!extent)return null;return {x:emu(attr(offset,'x')),y:emu(attr(offset,'y')),w:emu(attr(extent,'cx')),h:emu(attr(extent,'cy')),angle:finite(attr(node,'rot'))/60000,flipX:attr(node,'flipH')==='1',flipY:attr(node,'flipV')==='1'};}
const presetMap:Record<string,string>={rect:'rect',roundRect:'rounded-rect',ellipse:'circle',triangle:'triangle',rtTriangle:'right-triangle',diamond:'diamond',parallelogram:'parallelogram',trapezoid:'trapezoid',pentagon:'pentagon',hexagon:'hexagon',heptagon:'heptagon',octagon:'octagon',decagon:'decagon',dodecagon:'dodecagon',star4:'star4',star5:'star',star6:'star6',star8:'star8',star12:'star12',star16:'star16',heart:'heart',moon:'moon',teardrop:'teardrop',cloud:'cloud',plus:'plus',chevron:'chevron',rightArrow:'arrow',leftArrow:'left-arrow',upArrow:'up-arrow',downArrow:'down-arrow',leftRightArrow:'double-arrow',lightningBolt:'lightning',donut:'donut',line:'line',straightConnector1:'line'};
function geometry(properties:Element,box:Box,report:CanvaImportReport,page:number):FabricObject|null {
  const preset=child(properties,'prstGeom'),type=attr(preset,'prst','rect');
  if(child(properties,'custGeom')){const paths=descendants(child(properties,'custGeom')!,'path');if(paths.length){const commands:string[]=[];for(const path of paths){const w=finite(attr(path,'w'),1),h=finite(attr(path,'h'),1);for(const command of children(path)){if(w<=0||h<=0||children(command,'pt').some(point=>!/^[-+]?\d+(?:\.\d+)?$/.test(attr(point,'x'))||!/^[-+]?\d+(?:\.\d+)?$/.test(attr(point,'y')))){issue(report,page,'unsupported','A custom path contains unsupported coordinate formulas and was skipped.');return null;}const points=children(command,'pt').map(point=>[finite(attr(point,'x'))/w*100,finite(attr(point,'y'))/h*100]);if(local(command)==='close')commands.push('Z');else if(['moveTo','lnTo','cubicBezTo','quadBezTo'].includes(local(command)))commands.push(`${{moveTo:'M',lnTo:'L',cubicBezTo:'C',quadBezTo:'Q'}[local(command)]} ${points.flat().join(' ')}`);else{issue(report,page,'unsupported','A custom path contains an unsupported arc or coordinate formula and was skipped.');return null;}}}if(commands.length)return new Path(commands.join(' '));}}
  if(child(preset,'avLst')?.children.length)issue(report,page,'appearance',`The “${type}” shape uses Visro’s default proportions; custom PowerPoint handle adjustments may differ.`);
  if(type==='rect')return new Rect({width:box.w,height:box.h});
  if(type==='roundRect')return new Rect({width:box.w,height:box.h,rx:Math.min(box.w,box.h)*.16,ry:Math.min(box.w,box.h)*.16});
  if(type==='ellipse')return new Ellipse({rx:box.w/2,ry:box.h/2});
  if(type==='line'||type==='straightConnector1')return new Path(`M0 0 L${box.w} ${box.h}`,{fill:null});
  const shape=SHAPE_LIBRARY.find(item=>item.id===presetMap[type]);if(!shape){issue(report,page,'unsupported',`Unsupported PowerPoint shape “${type}” was skipped.`);return null;}
  issue(report,page,'appearance',`The “${type}” shape uses Visro’s editable vector approximation. Compare its outline against the original export.`);
  return shape.kind==='polygon'?new Polygon(shape.points):new Path(shape.path);
}
function runStyle(properties:Element|undefined,theme:Map<string,string>,themeFonts:{major:string;minor:string},fallback:Record<string,unknown>={}):Record<string,unknown>{
  const latin=attr(child(properties,'latin'),'typeface'),font=latin==='+mj-lt'?themeFonts.major:latin==='+mn-lt'?themeFonts.minor:latin;
  const weight=attr(properties,'b'),italic=attr(properties,'i'),size=attr(properties,'sz');
  return {...fallback,...(font?{fontFamily:font}:{}),...(size?{fontSize:Math.max(1,Math.min(1000,finite(size)*96/7200))}:{}),...(weight?{fontWeight:weight==='1'?'bold':'normal'}:{}),...(italic?{fontStyle:italic==='1'?'italic':'normal'}:{}),...(child(properties,'solidFill')?{fill:paintColor(child(properties,'solidFill'),theme)}:{}),...(attr(properties,'u')?{underline:!['none','0'].includes(attr(properties,'u'))}:{}),...(attr(properties,'strike')?{linethrough:!['noStrike','0'].includes(attr(properties,'strike'))}:{}),...(attr(properties,'spc')?{charSpacing:finite(attr(properties,'spc'))/100}:{}),};
}
function nativeText(body:Element,b:Box,parent:TMat2D,theme:Map<string,string>,themeFonts:{major:string;minor:string},report:CanvaImportReport,page:number,name:string):Textbox|null {
  const paragraphs=children(body,'p'),defaultProperties=child(child(paragraphs[0],'pPr'),'defRPr')||descendants(body,'rPr')[0]||descendants(body,'endParaRPr')[0];
  const baseDefaults=runStyle(child(child(paragraphs[0],'pPr'),'defRPr')||descendants(body,'endParaRPr')[0],theme,themeFonts,{fontFamily:themeFonts.minor||'Arial',fontSize:24,fill:'#000000',fontWeight:'normal',fontStyle:'normal'});
  const defaults=runStyle(defaultProperties,theme,themeFonts,baseDefaults);
  let text='',line=0,column=0;const styles:Record<number,Record<number,Record<string,unknown>>>={};
  paragraphs.forEach((paragraph,index)=>{
    if(index){text+='\n';line++;column=0;}
    const paragraphStyle=runStyle(child(child(paragraph,'pPr'),'defRPr'),theme,themeFonts,baseDefaults);
    if(children(child(paragraph,'pPr')||paragraph).some(item=>['buChar','buAutoNum','buBlip'].includes(local(item))))issue(report,page,'appearance','PowerPoint list bullets/numbering are not reconstructed. The paragraph text remains editable.');
    for(const run of children(paragraph)){
      if(local(run)==='br'){text+='\n';line++;column=0;continue;}
      if(!['r','fld'].includes(local(run)))continue;
      const runText=child(run,'t')?.textContent||'',style=runStyle(child(run,'rPr'),theme,themeFonts,paragraphStyle);
      if(attr(child(run,'rPr'),'baseline'))issue(report,page,'appearance','Superscript/subscript text remains editable but its baseline can differ.');
      addFont(report,page,String(style.fontFamily||defaults.fontFamily));
      for(const character of runText){if(character==='\n'){line++;column=0;}else{(styles[line]??={})[column++]={...style};}text+=character;}
    }
  });
  if(!text.trim())return null;
  const bodyProperties=child(body,'bodyPr'),left=emu(attr(bodyProperties,'lIns','91440')),right=emu(attr(bodyProperties,'rIns','91440')),top=emu(attr(bodyProperties,'tIns','45720')),bottom=emu(attr(bodyProperties,'bIns','45720'));
  const align=attr(child(paragraphs[0],'pPr'),'algn','l'),alignment:Record<string,string>={l:'left',ctr:'center',r:'right',just:'justify',dist:'justify'};
  if(new Set(paragraphs.map(paragraph=>attr(child(paragraph,'pPr'),'algn','l'))).size>1)issue(report,page,'appearance','Mixed paragraph alignment uses the first paragraph’s alignment.');
  if(attr(bodyProperties,'vert')&&!['horz',''].includes(attr(bodyProperties,'vert')))issue(report,page,'appearance','Vertical PowerPoint text is imported horizontally.');
  if(child(bodyProperties,'normAutofit')||child(bodyProperties,'spAutoFit'))issue(report,page,'appearance','PowerPoint text autofit is recalculated as an editable text box.');
  const object=label(new Textbox(text,{...defaults,width:Math.max(1,b.w-left-right),styles,textAlign:(alignment[align]||'left') as 'left',splitByGrapheme:false,stroke:null,strokeWidth:0,padding:0}),name);
  let offsetY=top;const anchor=attr(bodyProperties,'anchor');if(anchor==='ctr')offsetY=top+(b.h-top-bottom-object.height)/2;else if(anchor==='b')offsetY=b.h-bottom-object.height;
  const localOffset:TMat2D=[1,0,0,1,left-b.w/2+object.width/2,offsetY-b.h/2+object.height/2];
  return transformed(object,util.multiplyTransformMatrices(parent,util.multiplyTransformMatrices(matrix(b.x,b.y,b.w,b.h,b.angle,b.flipX,b.flipY),localOffset)));
}

export async function parseCanvaPowerPoint(data:ArrayBuffer,name='Imported Canva presentation',options:{signal?:AbortSignal;onProgress?:(message:string)=>void}={}):Promise<CanvaImportResult>{
  const check=()=>{if(options.signal?.aborted)throw new DOMException('Import cancelled.','AbortError');};check();
  const zip=await archive(data),presentationPath='ppt/presentation.xml',presentation=xml(await zip.text(presentationPath)),report=reportFor('pptx');
  if(!zip.has('[Content_Types].xml'))throw new Error('Choose a valid PowerPoint (.pptx) export.');
  const size=descendants(presentation,'sldSz')[0],width=emu(attr(size,'cx')),height=emu(attr(size,'cy'));
  if(width<16||height<16||width>MAX_DESIGN_SIZE||height>MAX_DESIGN_SIZE)throw new Error(`Presentation dimensions must be between 16 and ${MAX_DESIGN_SIZE} pixels.`);
  const theme=new Map<string,string>(Object.entries({dk1:'#000000',lt1:'#ffffff',dk2:'#1f497d',lt2:'#eeece1',accent1:'#4f81bd',accent2:'#c0504d',accent3:'#9bbb59',accent4:'#8064a2',accent5:'#4bacc6',accent6:'#f79646',hlink:'#0000ff',folHlink:'#800080',tx1:'#000000',tx2:'#1f497d',bg1:'#ffffff',bg2:'#eeece1'}));
  const themeFonts={major:'Arial',minor:'Arial'};
  if(zip.has('ppt/theme/theme1.xml')){const source=xml(await zip.text('ppt/theme/theme1.xml'));for(const scheme of descendants(source,'clrScheme'))for(const item of children(scheme))theme.set(local(item),color(item,theme));themeFonts.major=attr(child(descendants(source,'majorFont')[0],'latin'),'typeface','Arial');themeFonts.minor=attr(child(descendants(source,'minorFont')[0],'latin'),'typeface','Arial');theme.set('tx1',theme.get('dk1')!);theme.set('tx2',theme.get('dk2')!);theme.set('bg1',theme.get('lt1')!);theme.set('bg2',theme.get('lt2')!);}
  const rels=await relationships(zip,presentationPath),slideIds=descendants(presentation,'sldId');
  if(!slideIds.length||slideIds.length>100)throw new Error('Import a PowerPoint with between 1 and 100 slides.');
  const project=createProject(name,width,height,'#ffffff');project.pages=[];
  for(let index=0;index<slideIds.length;index++){
    check();const page=index+1;options.onProgress?.(`Importing editable slide ${page} of ${slideIds.length}`);
    const relation=rels.get(attr(slideIds[index],'r:id')),path=relation?.path;if(!path||relation?.external||relation?.type!=='slide')throw new Error(`Slide ${page} is missing from this export.`);
    const slide=xml(await zip.text(path)),slideRels=await relationships(zip,path),tree=descendants(slide,'spTree')[0];
    if(!tree)throw new Error(`Slide ${page} has no supported layer tree.`);
    if(descendants(slide,'timing').length||descendants(slide,'transition').length)issue(report,page,'unsupported','Presentation animations/transitions are not imported.');
    const backgroundProperties=descendants(slide,'bgPr')[0],backgroundFill=fill(backgroundProperties,theme);let background=typeof backgroundFill==='string'?backgroundFill:'#ffffff';
    const objects:FabricObject[]=[];
    if(backgroundFill instanceof Gradient){objects.push(label(new Rect({left:0,top:0,width,height,fill:backgroundFill,stroke:null,strokeWidth:0}),'Slide background'));issue(report,page,'appearance','The slide gradient is an editable background rectangle.');}
    const layoutRelation=[...slideRels.values()].find(item=>item.type==='slideLayout');
    if(layoutRelation?.path&&zip.has(layoutRelation.path)){const layout=xml(await zip.text(layoutRelation.path));const layoutTree=descendants(layout,'spTree')[0];if(layoutTree&&children(layoutTree).some(item=>['sp','pic','grpSp','graphicFrame','cxnSp'].includes(local(item))&&!descendants(item,'ph').length))issue(report,page,'unsupported','Decorative slide-layout/master layers are not imported; exported slide layers remain editable.');}
    let parsedLayers=0;
    const readNode=async(node:Element,parent:TMat2D,depth=0):Promise<FabricObject[]>=>{
      check();if(++parsedLayers>MAX_LAYERS*3)throw new Error(`Slide ${page} contains too many layers.`);if(depth>24)throw new Error('This presentation contains groups nested too deeply.');
      const type=local(node),properties=child(node,type==='grpSp'?'grpSpPr':'spPr'),transform=child(properties,'xfrm'),b=box(transform),nameNode=descendants(node,'cNvPr')[0],layerName=attr(nameNode,'name',`${type} layer`);
      if(attr(nameNode,'hidden')==='1')issue(report,page,'appearance','A hidden PowerPoint layer was imported as visible so it remains accessible.');
      if(type==='grpSp'){
        if(!b){issue(report,page,'unsupported',`Group “${layerName}” has no supported transform and was skipped.`);return [];}
        const childOffset=child(transform,'chOff'),childExtent=child(transform,'chExt'),cx=emu(attr(childOffset,'x')),cy=emu(attr(childOffset,'y')),cw=emu(attr(childExtent,'cx'))||b.w,ch=emu(attr(childExtent,'cy'))||b.h;
        if(cw<=0||ch<=0)return [];
        const scale:TMat2D=[b.w/cw,0,0,b.h/ch,-(cx+cw/2)*b.w/cw,-(cy+ch/2)*b.h/ch],groupMatrix=util.multiplyTransformMatrices(parent,util.multiplyTransformMatrices(matrix(b.x,b.y,b.w,b.h,b.angle,b.flipX,b.flipY),scale));
        const nested:FabricObject[]=[];for(const item of children(node))nested.push(...await readNode(item,groupMatrix,depth+1));
        return nested.length?[label(new Group(nested),layerName)]:[];
      }
      if(['nvGrpSpPr','grpSpPr','extLst','nvSpPr','nvPicPr'].includes(type))return [];
      if(!['sp','pic','cxnSp'].includes(type)){if(['graphicFrame','contentPart','oleObj'].includes(type))issue(report,page,'unsupported',`“${layerName}” contains a table, chart, diagram or embedded object and was skipped.`);return [];}
      if(!b||b.w<0||b.h<0||b.w===0&&b.h===0){issue(report,page,'unsupported',`“${layerName}” has no explicit supported position/size and was skipped.`);return [];}
      const transformMatrix=util.multiplyTransformMatrices(parent,matrix(b.x,b.y,b.w,b.h,b.angle,b.flipX,b.flipY));
      if(descendants(properties||node,'effectLst').some(item=>item.children.length)||descendants(properties||node,'effectDag').length)issue(report,page,'appearance','PowerPoint shadows and artistic effects are not reconstructed.');
      if(type==='pic'){
        const blip=descendants(node,'blip')[0],imageRel=slideRels.get(attr(blip,'r:embed'));
        if(!imageRel?.path||imageRel.external||!zip.has(imageRel.path)){issue(report,page,'unsupported',`Image “${layerName}” is external or unavailable and was skipped.`);return [];}
        const extension=imageRel.path.split('.').at(-1)?.toLowerCase(),mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'} as Record<string,string>)[extension||''];
        if(!mime){issue(report,page,'unsupported',`Image “${layerName}” uses ${extension||'an unknown format'}; export PNG/JPG media for local editing.`);return [];}
        const bytes=await zip.bytes(imageRel.path);check();if(bytes.byteLength>30*1024*1024)throw new Error('An embedded presentation image exceeds 30 MB.');
        const image=await FabricImage.fromURL(`data:${mime};base64,${base64(bytes)}`,{signal:options.signal});
        if(image.width*image.height>64_000_000)throw new Error('An embedded image is too large to edit safely.');
        const crop=descendants(node,'srcRect')[0],l=Math.max(0,Math.min(.99,finite(attr(crop,'l'))/100000)),r=Math.max(0,Math.min(.99,finite(attr(crop,'r'))/100000)),t=Math.max(0,Math.min(.99,finite(attr(crop,'t'))/100000)),bottom=Math.max(0,Math.min(.99,finite(attr(crop,'b'))/100000));
        if(l+r>=1||t+bottom>=1){issue(report,page,'unsupported',`Image “${layerName}” has an invalid crop and was skipped.`);return [];}
        const cropWidth=image.width*(1-l-r),cropHeight=image.height*(1-t-bottom);image.set({cropX:image.width*l,cropY:image.height*t,width:cropWidth,height:cropHeight});
        transformed(image,util.multiplyTransformMatrices(transformMatrix,[b.w/cropWidth,0,0,b.h/cropHeight,0,0]));
        const clipGeometry=child(properties,'prstGeom');if(clipGeometry&&attr(clipGeometry,'prst')!=='rect'){const clip=geometry(properties!,{...b,w:cropWidth,h:cropHeight},report,page);if(clip){clip.set({originX:'center',originY:'center',left:0,top:0,scaleX:cropWidth/(clip.width||1),scaleY:cropHeight/(clip.height||1),stroke:null,strokeWidth:0});image.set('clipPath',clip);issue(report,page,'appearance','Picture shape clipping is retained; adjustable crop-shape handles can differ.');}}
        return [label(image,layerName)];
      }
      const result:FabricObject[]=[],textBody=child(node,'txBody'),shape=properties?geometry(properties,b,report,page):null,shapeFill=fill(properties,theme),line=child(properties,'ln');
      const lineWidth=line?emu(attr(line,'w','12700')):0,lineAlpha=line?descendants(line,'alpha')[0]:undefined,lineVisible=!!line&&!!child(line,'solidFill')&&!child(line,'noFill')&&lineWidth>0&&(!lineAlpha||finite(attr(lineAlpha,'val'),100000)>0);
      if(shape&&(shapeFill!==null||lineVisible||type==='cxnSp')){
        const stroke=lineVisible?paintColor(child(line,'solidFill'),theme):null;
        shape.set({fill:shapeFill,stroke,strokeWidth:lineVisible?lineWidth:0,strokeUniform:true,opacity:1});
        if(children(line||properties!).some(item=>['headEnd','tailEnd'].includes(local(item))&&attr(item,'type')!=='none'))issue(report,page,'appearance','PowerPoint line-end arrow markers are not reconstructed.');
        const dash=attr(child(line,'prstDash'),'val');if(dash&&!['solid',''].includes(dash))shape.set('strokeDashArray',dash==='dot'?[1,3]:[6,4]);
        result.push(label(transformed(shape,util.multiplyTransformMatrices(transformMatrix,[shape.width?b.w/shape.width:1,0,0,shape.height?b.h/shape.height:1,0,0])),textBody?`${layerName} shape`:layerName));
      }else if(properties&&child(properties,'blipFill'))issue(report,page,'unsupported',`Shape “${layerName}” uses an unsupported image fill.`);
      if(textBody){const text=nativeText(textBody,b,parent,theme,themeFonts,report,page,textBody&&result.length?`${layerName} text`:layerName);if(text)result.push(text);}
      return result.length>1?[label(new Group(result),layerName)]:result;
    };
    for(const item of children(tree))objects.push(...await readNode(item,IDENTITY));
    checkLayers(objects,page);tally(report,objects);
    const id=newId('page');project.pages.push({id,name:`Page ${page}`,background,canvas:{version:'7.4.0',objects:objects.map(serialize),background}});
    check();await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  if(!report.layers)throw new Error('This PowerPoint contains no supported editable layers. Try an SVG export or import the PDF for annotation.');
  report.pages=project.pages.length;project.activePageId=project.pages[0].id;project.brand.fonts=report.fonts.slice(0,32);
  issue(report,0,'source','Only layers present in the PowerPoint export can be recovered. Canva may already have flattened effects or artwork; fonts, wrapping and layer names can differ.');
  return {project:validateProject(project),report};
}

export async function importCanvaExport(file:File,options:{signal?:AbortSignal;onProgress?:(message:string)=>void}={}):Promise<CanvaImportResult&{name:string}> {
  if(options.signal?.aborted)throw new DOMException('Import cancelled.','AbortError');
  if(file.size>MAX_INPUT)throw new Error('Choose a Canva export smaller than 40 MB.');
  const name=file.name.replace(/\.(pptx|svg)$/i,'')||'Imported Canva design';
  options.onProgress?.('Reading your Canva export');
  let result:CanvaImportResult;
  if(/\.pptx$/i.test(file.name))result=await parseCanvaPowerPoint(await file.arrayBuffer(),name,options);
  else if(/\.svg$/i.test(file.name)){if(file.size>MAX_XML)throw new Error('Choose an SVG smaller than 6 MB.');result=await parseCanvaSVG(await file.text(),name);}
  else throw new Error('Choose a PowerPoint (.pptx) or SVG export. Canva links and private Canva files are not portable projects.');
  if(options.signal?.aborted)throw new DOMException('Import cancelled.','AbortError');
  return {...result,name};
}
