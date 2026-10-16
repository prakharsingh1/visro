import {FabricImage,Group,Path,Rect,type FabricObject} from 'fabric';
import {getShapeFramePlaceholder} from './shape-frame';
import {FRAME_PLACEHOLDER_ART} from './frames';
export interface MockupPart {path:string;fill:string;stroke?:string;strokeWidth?:number}
export interface MockupDefinition {id:string;name:string;width:number;height:number;tags:string;parts:MockupPart[];screen:{x:number;y:number;width:number;height:number;radius:number};details?:MockupPart[]}
const box=(x:number,y:number,w:number,h:number,r=0)=>`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
const part=(path:string,fill:string,stroke?:string,strokeWidth=0):MockupPart=>({path,fill,stroke,strokeWidth});
const screen=(x:number,y:number,width:number,height:number,radius=0)=>({x,y,width,height,radius});
/** Original flat product/device scenes, each with a real replaceable photo area. */
export const MOCKUPS:readonly MockupDefinition[]=[
 {id:'phone-portrait',name:'Portrait phone',width:210,height:400,tags:'mobile smartphone device app story',parts:[part(box(0,0,210,400,30),'#20252c'),part(box(5,5,200,390,26),'#434a54')],screen:screen(12,14,186,372,20),details:[part(box(77,16,56,13,7),'#20252c'),part(box(77,378,56,4,2),'#ffffff')]},
 {id:'phone-landscape',name:'Landscape phone',width:400,height:210,tags:'mobile smartphone device video',parts:[part(box(0,0,400,210,28),'#20252c')],screen:screen(16,12,368,186,18),details:[part(box(18,78,12,54,6),'#20252c')]},
 {id:'tablet-portrait',name:'Portrait tablet',width:320,height:420,tags:'tablet device portfolio poster',parts:[part(box(0,0,320,420,22),'#28303a'),part(box(4,4,312,412,19),'#4b5565')],screen:screen(14,18,292,384,10),details:[part(box(148,7,24,4,2),'#17212a')]},
 {id:'tablet-landscape',name:'Landscape tablet',width:420,height:300,tags:'tablet device presentation screen',parts:[part(box(0,0,420,300,22),'#28303a')],screen:screen(18,13,384,274,10)},
 {id:'laptop',name:'Laptop',width:480,height:320,tags:'computer laptop device website screen',parts:[part(box(26,0,428,290,17),'#242a35'),part('M0 286H480L451 315H29Z','#b7c1cd'),part(box(184,287,112,9,4),'#929eac')],screen:screen(38,15,404,257,5),details:[part(box(34,276,412,4,2),'#101725')]},
 {id:'desktop-display',name:'Desktop display',width:460,height:390,tags:'computer monitor device desk screen',parts:[part(box(0,0,460,305,16),'#222934'),part('M193 300H267L280 365H180Z','#aebac7'),part(box(132,363,196,15,7),'#c7cfd8')],screen:screen(14,14,432,264,5),details:[part(box(0,279,460,25,0),'#c4ccd5')]},
 {id:'browser-window',name:'Browser window',width:480,height:320,tags:'browser website webpage app desktop',parts:[part(box(0,0,480,320,12),'#dfe5ec'),part(box(4,36,472,280,5),'#ffffff')],screen:screen(8,42,464,270,3),details:[part(box(16,15,8,8,4),'#ff6f6f'),part(box(32,15,8,8,4),'#ffc458'),part(box(48,15,8,8,4),'#58c894'),part(box(90,11,292,18,6),'#f7f9fc')]},
 {id:'instant-photo',name:'Instant photo print',width:300,height:350,tags:'polaroid print photography paper',parts:[part(box(0,0,300,350,3),'#fffdf6','#dedbd1',1)],screen:screen(15,15,270,275,0)},
 {id:'framed-poster',name:'Framed poster',width:320,height:430,tags:'wall frame art gallery print',parts:[part(box(0,0,320,430,3),'#806448'),part(box(8,8,304,414,0),'#fff9ee')],screen:screen(20,20,280,390,0)},
 {id:'billboard',name:'Outdoor billboard',width:480,height:350,tags:'outdoor advertising signage banner',parts:[part(box(92,245,18,105,0),'#758493'),part(box(370,245,18,105,0),'#758493'),part(box(0,0,480,274,5),'#2c3642')],screen:screen(12,12,456,250,0)},
 {id:'tee-shirt',name:'T-shirt print',width:360,height:390,tags:'shirt tee apparel clothing merchandise',parts:[part('M105 18L143 34H217L255 18L353 98L300 167L261 137V382H99V137L60 167L7 98Z','#e6ecf2','#b8c6d4',2)],screen:screen(114,98,132,177,2),details:[part('M143 34Q180 94 217 34','none','#c0cdda',5),part('M104 371H256','none','#c0cdda',2)]},
 {id:'tote-bag',name:'Canvas tote bag',width:300,height:370,tags:'bag tote canvas merchandise shop',parts:[part('M83 107V69C83-9 217-9 217 69V107','none','#c7b797',18),part('M26 95H274L287 364H13Z','#e9dec5','#c6b895',2)],screen:screen(65,132,170,192,2)},
 {id:'coffee-mug',name:'Coffee mug print',width:390,height:300,tags:'cup coffee ceramic merchandise',parts:[part('M294 42H325C398 42 398 221 325 221H292','none','#d1dce5',23),part(box(42,12,266,270,34),'#edf3f7','#c3d2de',2)],screen:screen(69,49,212,195,5),details:[part('M66 30Q173 12 284 30','none','#d2dee7',5)]},
];
export const getMockup=(id:string)=>MOCKUPS.find(item=>item.id===id);
export const searchMockups=(query:string)=>{const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);return MOCKUPS.filter(item=>words.every(word=>`${item.name} ${item.tags}`.toLowerCase().includes(word)));};
export function mockupPreviewSVG(item:MockupDefinition):string{
 const s=item.screen,id=`mockup-preview-${item.id}`;
 const paths=(parts:MockupPart[])=>parts.map(p=>`<path d="${p.path}" fill="${p.fill}" stroke="${p.stroke??'none'}" stroke-width="${p.strokeWidth??0}"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 ${item.width+10} ${item.height+10}">${paths(item.parts)}<defs><clipPath id="${id}"><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.radius}"/></clipPath></defs><g clip-path="url(#${id})"><svg x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${FRAME_PLACEHOLDER_ART}</svg></g>${paths(item.details??[])}</svg>`;
}
export async function createNativeMockup(id:string,options?:{signal?:AbortSignal}):Promise<Group>{
 const item=getMockup(id);if(!item)throw new Error('Choose a mockup from Elements.');options?.signal?.throwIfAborted();
 const makePart=(p:MockupPart):FabricObject=>new Path(p.path,{fill:p.fill,stroke:p.stroke??null,strokeWidth:p.strokeWidth??0,strokeLineJoin:'round'});
 const image=await FabricImage.fromURL(await getShapeFramePlaceholder(),{signal:options?.signal});options?.signal?.throwIfAborted();
 const s=item.screen,ratio=s.width/s.height,width=Math.min(image.width,image.height*ratio),height=width/ratio;
 image.set({originX:'center',originY:'center',left:s.x+s.width/2,top:s.y+s.height/2,width,height,cropX:(image.width-width)/2,cropY:(image.height-height)/2,scaleX:s.width/width,scaleY:s.height/height,strokeWidth:0});
 image.set('clipPath',new Rect({originX:'center',originY:'center',left:0,top:0,width,height,rx:s.radius*width/s.width,ry:s.radius*height/s.height,fill:'#000000',strokeWidth:0}));
 Object.assign(image,{visroFrame:'custom-shape',visroEmptyFrame:true,visroName:`${item.name} image`});
 const objects=[...item.parts.map(makePart),image,...(item.details??[]).map(makePart)];
 objects.forEach((object,index)=>Object.assign(object,{id:crypto.randomUUID(),visroName:object===image?`${item.name} image`:`${item.name} part ${index+1}`}));
 return Object.assign(new Group(objects,{subTargetCheck:true,interactive:true}),{visroMockupId:item.id,visroName:item.name});
}
