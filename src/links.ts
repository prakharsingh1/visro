import type {VisroProject} from './editor-types';
export interface DesignLink {url:string;label:string;left:number;top:number;width:number;height:number;polygon:string;}
type Matrix=[number,number,number,number,number,number];
const identity:Matrix=[1,0,0,1,0,0];
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const number=(v:unknown,fallback:number)=>Number.isFinite(Number(v))?Number(v):fallback;
const origin=(v:unknown)=>v==='center'?.5:v==='right'||v==='bottom'?1:typeof v==='number'?v:0;
export function pageLinks(project:VisroProject,pageId:string):DesignLink[]{
 const output:DesignLink[]=[];
 const walk=(objects:unknown,parent:Matrix=identity)=>{if(!Array.isArray(objects))return;for(const o of objects){if(!o||typeof o!=='object'||o.visible===false)continue;const w=number(o.width,0),h=number(o.height,0),scaleX=number(o.scaleX,1),scaleY=number(o.scaleY,1),sx=scaleX*(o.flipX?-1:1),sy=scaleY*(o.flipY?-1:1),angle=number(o.angle,0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),ox=(.5-origin(o.originX))*w*scaleX,oy=(.5-origin(o.originY))*h*scaleY;
 const matrix=multiply(parent,[c*sx,s*sx,-s*sy,c*sy,number(o.left,0)+c*ox-s*oy,number(o.top,0)+s*ox+c*oy]);
 const metadata=o.visroMetadata;const url=typeof metadata?.link==='string'?metadata.link:'';
 if(/^(https?:\/\/|mailto:|#[a-z0-9_-])/i.test(url)){const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys);output.push({url,label:metadata.altText||o.text||o.name||'Open link',left,top,width:Math.max(...xs)-left,height:Math.max(...ys)-top,polygon:corners.map(([x,y])=>`${x/project.width*100}% ${y/project.height*100}%`).join(',')});}
 if(Array.isArray(o.objects))walk(o.objects,matrix);
 }};
 walk(project.pages.find(p=>p.id===pageId)?.canvas.objects);return output;
}
export const escapeHTML=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
