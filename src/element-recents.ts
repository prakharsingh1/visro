export type RecentElementKind='shape'|'graphic'|'frame'|'text-combination'|'mockup';
export interface RecentElement {kind:RecentElementKind;id:string}
const key='visro-recent-elements',kinds=new Set(['shape','graphic','frame','text-combination','mockup']);
export function readRecentElements():RecentElement[]{
 try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(value))return[];return value.filter((item):item is RecentElement=>item&&kinds.has(item.kind)&&typeof item.id==='string'&&item.id.length<128).slice(0,24);}catch{return[];}
}
export function rememberElement(kind:RecentElementKind,id:string):void{
 if(!kinds.has(kind)||!id||id.length>=128)return;
 try{localStorage.setItem(key,JSON.stringify([{kind,id},...readRecentElements().filter(item=>item.kind!==kind||item.id!==id)].slice(0,24)));}catch{/* Editing remains available when local preferences are full. */}
}
