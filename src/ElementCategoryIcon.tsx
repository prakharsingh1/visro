import {useId} from 'react';

export const ELEMENT_CATEGORIES=[
  ['shapes','Shapes'],['graphics','Graphics'],['animations','Animations'],
  ['photos','Photos'],['videos','Videos'],['audio','Audio'],
  ['charts','Charts'],['forms','Forms'],['sheets','Sheets'],
  ['tables','Tables'],['frames','Frames'],['grids','Grids'],
  ['mockups','Mockups'],['3d','3D'],
] as const;
export type ElementCategory=typeof ELEMENT_CATEGORIES[number][0];
const COLOURS:Record<ElementCategory,[string,string,string]>={
 shapes:['#64e5eb','#0694ad','#006676'],graphics:['#ffb475','#ff6400','#bb4100'],animations:['#8fe4aa','#08b74d','#00783c'],
 photos:['#8fc9ff','#228aeb','#005bb8'],videos:['#f4a5ff','#bf16e2','#7c00a8'],audio:['#ff8d9a','#ed2458','#b60936'],
 charts:['#a9edec','#34b5c6','#087f98'],forms:['#8ce7ae','#00b74c','#007638'],sheets:['#86b8ff','#3a80ed','#215ab5'],
 tables:['#ffb68c','#ff711a','#c04c00'],frames:['#a9f0bb','#49c968','#0b8e37'],grids:['#f5b8ff','#c441e7','#8523aa'],
 mockups:['#91e9ef','#31b5c8','#078196'],'3d':['#f3adff','#d93bf0','#9115aa'],
};
/** Original vector category art. Shared size, lighting and baseline keep the grid aligned. */
export function ElementCategoryIcon({kind}:{kind:ElementCategory}){
 const uid=useId().replace(/[^a-z0-9]/gi,''),[light,main,dark]=COLOURS[kind],face=`element-face-${uid}`,shine=`element-shine-${uid}`,shadow=`element-shadow-${uid}`;
 const landscape=<><rect x="21" y="23" width="48" height="43" rx="4" fill="#bfeafa"/><circle cx="58" cy="33" r="5" fill="#fff4aa"/><path d="m22 56 15-19 15 16 9-10 8 13v10H22Z" fill="#79c964"/><path d="m22 60 15-10 15 12 17-8v12H22Z" fill="#269a5a"/></>;
 let art;
 switch(kind){
  case'shapes':art=<><path d="m31 27 11 8-4 14H24l-4-14Z" fill="#a1f8ff"/><path d="m56 36 12 22H44Z" fill="#f6a1ff" stroke="#fbcaff" strokeWidth="2"/><g fill="#052a37">{[27,36,45,54,63].map(x=><circle key={x} cx={x} cy="68" r="2.3"/>)}</g></>;break;
  case'graphics':art=<><path d="M45 55v16m0-8c-13 1-18-7-18-12 13-1 18 7 18 12m1 4c13 1 18-7 18-12-13-1-18 7-18 12" stroke="#2faa26" fill="#4eda2d" strokeWidth="3"/>{Array.from({length:12},(_,i)=><ellipse key={i} cx="45" cy="27" rx="5.5" ry="10" fill="#ffdc29" transform={`rotate(${i*30} 45 41)`}/>)}<circle cx="45" cy="41" r="12" fill="#b65100"/><circle cx="42" cy="37" r="4" fill="#cf7719" opacity=".6"/></>;break;
  case'animations':art=<><circle cx="45" cy="46" r="26" fill="#fff12a"/><circle cx="37" cy="41" r="3.5" fill="#4d11a5"/><circle cx="54" cy="41" r="3.5" fill="#4d11a5"/><path d="M33 52q12 13 25 0" fill="none" stroke="#4d11a5" strokeWidth="4" strokeLinecap="round"/><path d="m52 72 18-18q-17-1-18 18Z" fill="#fff"/></>;break;
  case'photos':art=<><rect x="17" y="19" width="56" height="52" rx="6" fill="#fff"/>{landscape}<path d="M21 24h48" stroke="#fff" strokeWidth="2"/></>;break;
  case'videos':art=<><circle cx="45" cy="46" r="25" fill="#9b00bd" stroke="#f0a7ff" strokeWidth="2"/><path d="m39 33 20 13-20 13Z" fill="#fff"/></>;break;
  case'audio':art=<><path d="M38 56V30l26-6v28M38 38l26-6" fill="none" stroke="#ffe6e9" strokeWidth="8" strokeLinejoin="round"/><ellipse cx="30" cy="58" rx="10" ry="8" fill="#ffe6e9"/><ellipse cx="56" cy="54" rx="10" ry="8" fill="#ffe6e9"/></>;break;
  case'charts':art=<><rect x="18" y="20" width="55" height="54" rx="5" fill="#e8fcfc"/><path d="M18 33h55M18 46h55M18 59h55M32 20v54M47 20v54M62 20v54" stroke="#a7d8db"/><path d="m22 62 16-17 13 7 18-20v38H22Z" fill="#d0a0ff" opacity=".8"/><path d="m22 62 16-17 13 7 18-20M22 44l16-15 13 9 18-12" fill="none" stroke="#8f35e6" strokeWidth="2.5"/><circle cx="38" cy="45" r="3" fill="#8f35e6"/></>;break;
  case'forms':art=<><rect x="20" y="24" width="51" height="22" rx="11" fill="#a3efb7"/><circle cx="31" cy="35" r="4" fill="#17b85a"/><rect x="20" y="51" width="51" height="22" rx="11" fill="#009d46"/><path d="m30 61 5 5 8-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>;break;
  case'sheets':art=<><rect x="18" y="20" width="55" height="54" rx="5" fill="#f9ffff"/><path d="M18 20h55v16H18Z" fill="#7162ef"/><text x="24" y="32" fill="#fff" fontSize="13" fontStyle="italic" fontFamily="Georgia,serif">f(x)</text><path d="M37 37v37M55 37v37M19 49h53M19 61h53" stroke="#c6d4e5" strokeWidth="2"/><rect x="22" y="40" width="12" height="6" rx="2" fill="#b7c8e2"/><rect x="40" y="52" width="12" height="6" rx="2" fill="#9db6d8"/></>;break;
  case'tables':art=<><rect x="18" y="19" width="55" height="56" rx="5" fill="#fff9ef"/><path d="M18 19h55v15H18Z" fill="#ff7220"/><path d="M36 20v54M55 20v54M18 34h55M18 48h55M18 61h55" stroke="#ffb788" strokeWidth="2"/></>;break;
  case'frames':art=<><path d="M45 19c7-7 12 1 17 4 10-2 12 6 11 13 8 5 3 13-1 18 2 10-7 12-13 12-6 9-14 4-19 1-10 3-14-3-15-10-8-4-4-13-2-18-4-8 1-14 8-15 4-9 11-6 14-5Z" fill="#fff"/>{landscape}<path d="M23 63q11-5 23 2t22-1" fill="none" stroke="#fff" strokeWidth="3"/></>;break;
  case'grids':art=<><g transform="rotate(13 53 35)"><rect x="35" y="16" width="39" height="46" rx="5" fill="#fdf3ff"/><rect x="39" y="21" width="31" height="35" rx="2" fill="#b0e9fa"/><path d="m40 50 9-13 8 9 7-8 6 13v5H40Z" fill="#78c84b"/></g><g transform="rotate(-8 38 52)"><rect x="15" y="30" width="47" height="44" rx="5" fill="#fff"/><path d="M19 35h18v15H19Zm22 0h17v15H41ZM19 54h18v15H19Zm22 0h17v15H41Z" fill="#90d7f2"/><path d="m20 47 5-7 6 7 6-4v7H20Zm22 17 6-8 10 10v3H42Z" fill="#71c342"/></g></>;break;
  case'mockups':art=<><path d="m33 24 12 5 12-5 16 13-10 12-7-5v28H34V44l-7 5-10-12Z" fill="#edfbff" stroke="#bdebf5" strokeWidth="2"/><rect x="37" y="38" width="16" height="19" rx="2" fill="#8fd1ea"/><path d="m38 52 5-7 9 9v3H38Z" fill="#74bf6b"/><path d="M34 25q11 12 22 0" fill="none" stroke="#a9d8e8" strokeWidth="3"/></>;break;
  case'3d':art=<><path d="m18 62 28-16 28 16-28 16Z" fill="none" stroke="#f4b3ff"/><path d="m18 54 28-16 28 16M27 73V57m19 21V62m19 11V57" fill="none" stroke="#f4b3ff"/><path d="m30 28 18-10 18 10-18 11Z" fill="#b48bff"/><path d="m30 28 18 11v22L30 50Z" fill="#7161fa"/><path d="m48 39 18-11v22L48 61Z" fill="#993cf0"/><path d="m39 27 9-5 9 5-9 5Z" fill="#d3b5ff"/></>;break;
 }
 return <svg className="element-category-art" viewBox="0 0 90 90" aria-hidden="true"><defs><linearGradient id={face} x1="0" y1="0" x2="1" y2="1"><stop stopColor={light}/><stop offset=".5" stopColor={main}/><stop offset="1" stopColor={dark}/></linearGradient><linearGradient id={shine} x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".7"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient><filter id={shadow} x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity=".16"/></filter></defs><g filter={`url(#${shadow})`}><rect x="17" y="9" width="65" height="69" rx="17" fill={light} stroke={light} transform="rotate(8 49 44)"/><rect x="10" y="14" width="67" height="66" rx="17" fill={`url(#${face})`} stroke={main}/><path d="M27 16h32q16 0 16 16v5q-5-17-21-17H26q-12 0-14 15v-4q0-15 15-15Z" fill={`url(#${shine})`}/></g>{art}</svg>;
}
