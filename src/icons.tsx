import type { SVGProps } from 'react';

export type StudioIconName = 'menu'|'create'|'home'|'projects'|'templates'|'brand'|'ai'|'more'|'notifications'|'search'|'presentation'|'social'|'video'|'print'|'document'|'whiteboard'|'sheet'|'website'|'custom'|'upload'|'elements'|'text'|'tools'|'apps'|'components'|'audio'|'background'|'charts'|'comments'|'file'|'resize'|'star'|'trash'|'settings'|'sun'|'moon'|'chevron'|'close'|'check'
 |'edit'|'eye'|'copy'|'duplicate'|'clipboard'|'paint-roller'|'lock'|'unlock'|'link'|'alternative-text'|'layers'|'bring-front'|'bring-forward'|'send-backward'|'send-back'|'align-left'|'align-center'|'align-right'|'align-top'|'align-middle'|'align-bottom'|'timing'|'stroke-style'|'corners'|'transparency'|'spacing'|'line-start'|'line-end'|'swap-ends'|'line-type'|'strikethrough'|'uppercase'|'image'|'frames'|'grid';
export interface StudioIconProps extends SVGProps<SVGSVGElement> { name: StudioIconName; size?: number; filled?: boolean; }

/** Independently drawn 24 px glyphs measured against the installed editor UI. */
export function StudioIcon({name,size=24,filled=false,strokeWidth=1.5,...props}:StudioIconProps) {
 const solid=filled?'currentColor':'none';
 let glyph;
 switch(name) {
  case 'menu': glyph=<><path d="M5 6.5h14M5 12h14M5 17.5h14"/></>;break;
  case 'create':case 'custom':glyph=<><path d="M12 5v14M5 12h14"/></>;break;
  case 'home':glyph=<><path d="M3.8 10.2 12 3.7l8.2 6.5v9.1a1 1 0 0 1-1 1h-4.4v-7H9.2v7H4.8a1 1 0 0 1-1-1Z" fill={solid}/><path d="m2.5 11.2 9.5-7.5 9.5 7.5"/></>;break;
  case 'projects':glyph=<><path d="M3.5 7.2V5.9a1.6 1.6 0 0 1 1.6-1.6h4.3l2 2.1h7.4A1.7 1.7 0 0 1 20.5 8v10.1a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6Z" fill={solid}/><path d="M3.8 8.4h16.4"/></>;break;
  case 'templates':glyph=<><rect x="3.5" y="3.5" width="17" height="17" rx="2.6" fill={solid}/><path d="M11 3.5v17M11 12h9.5" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'brand':glyph=<><path d="M5.5 7.2a10.5 10.5 0 0 1 13 0M8.5 3.7a7.5 7.5 0 0 1 7 0"/><rect x="3.5" y="10.2" width="17" height="10.3" rx="3.1" fill={solid}/><path d="M12 15.4c-1.7-2.3-4.6-2.9-5.6-.5-1 2.4 2.4 4.1 5.6.5s6.6-1.9 5.6.5c-1 2.4-3.9 1.8-5.6-.5Z" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'ai':glyph=<><path d="m12.5 3.2 1.8 5.9 5.9 1.8-5.9 1.8-1.8 5.9-1.8-5.9-5.9-1.8 5.9-1.8Z" fill={solid}/><path d="m5.1 15.8.9 2.8 2.8.9-2.8.9-.9 2.8-.9-2.8-2.8-.9 2.8-.9ZM20.4 2.1l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z" fill="currentColor" strokeWidth=".7"/></>;break;
  case 'more':glyph=<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>;break;
  case 'notifications':glyph=<><path d="M5.2 16.8h13.6l-1.8-2.7V9a5 5 0 0 0-10 0v5.1ZM9.5 20h5M12 2.2v1.6"/></>;break;
  case 'search':glyph=<><circle cx="10.5" cy="10.5" r="6.7"/><path d="m15.6 15.6 4.7 4.7"/></>;break;
  case 'presentation':glyph=<><rect x="2.8" y="3.2" width="18.4" height="13.7" rx="2" fill={solid}/><path d="M12 16.9V21M7.8 21h8.4"/><path d="M11.7 6.2a4.2 4.2 0 1 0 4.2 4.2h-4.2Z" fill={filled?'var(--icon-cutout, #fff)':'currentColor'} stroke="none"/><path d="M13.2 5v4h4a4 4 0 0 0-4-4Z" fill={filled?'var(--icon-cutout, #fff)':'currentColor'} stroke="none"/></>;break;
  case 'social':glyph=<><path d="M5.5 4.3h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5.5 3v-3.4a2 2 0 0 1-1-1.6v-10a2 2 0 0 1 2-2Z" fill={solid}/><path d="M8.3 10.2c0-2.7 3-3.4 3.7-1.3.7-2.1 3.7-1.4 3.7 1.3 0 2.1-3.7 4.5-3.7 4.5s-3.7-2.4-3.7-4.5Z" fill={filled?'var(--icon-cutout, #fff)':'none'} stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'video':glyph=<><rect x="3" y="5" width="13" height="14" rx="2.2" fill={solid}/><path d="m16 9 5-3v12l-5-3Z" fill={solid}/><path d="m8 9 4 3-4 3Z" fill={filled?'var(--icon-cutout, #fff)':'currentColor'} stroke="none"/></>;break;
  case 'print':glyph=<><path d="M7 8V3.5h10V8M7 17H4.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H17" fill={solid}/><rect x="7" y="13" width="10" height="7.5" rx=".5" fill={solid}/><path d="M17.1 10.7h.9"/></>;break;
  case 'document':glyph=<><rect x="4" y="2.5" width="16" height="19" rx="2.3" fill={solid}/><path d="M7.5 6.3h9M7.5 9.5h9M7.5 12.7h4.5" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'} strokeWidth="1.6"/><path d="m7 18.5 3.5-3.5 2.2 2 2.4-2.9 2.4 4.4Z" fill={filled?'var(--icon-cutout, #fff)':'currentColor'} stroke="none"/></>;break;
  case 'whiteboard':glyph=<><path d="M9 3.5H3.5V9M15 3.5h5.5V9M3.5 15v5.5H9M15 20.5h5.5V15" strokeWidth={filled?2.6:strokeWidth}/><path d="M8 8h8v8H8Z" fill={solid} strokeWidth="1.2"/></>;break;
  case 'sheet':glyph=<><rect x="3.8" y="3.8" width="16.4" height="16.4" rx="1.4" fill={solid}/><path d="M3.8 9.4h16.4M9.4 3.8v16.4M14.9 9.4v10.8M9.4 14.9h10.8" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'website':glyph=<><rect x="3.1" y="4" width="17.8" height="16" rx="1.8" fill={solid}/><path d="M3.1 8.4h17.8M5.9 6.2h.1M8.2 6.2h.1M10.5 6.2h.1" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/><path d="M7 11.6h4.5v5.1H7ZM14 12.2h3M14 15.6h3" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'upload':glyph=<><path d="M7.3 18.5H6a4.1 4.1 0 0 1-.6-8.2 5.9 5.9 0 0 1 11.5-2 5.1 5.1 0 0 1 .9 10.2h-1.6" fill={solid}/><path d="m9 14.1 3-3.1 3 3.1M12 11v5.3c0 2.2-1.1 3.4-3 3.4" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'elements':glyph=<><path d="M3 5.7c0-2.5 2.7-3.2 4.1-1.2 1.4-2 4.1-1.3 4.1 1.2 0 2.2-4.1 4.9-4.1 4.9S3 7.9 3 5.7Z" fill={solid}/><path d="M14.5 3.4a.7.7 0 0 1 1.1-.6l6 3.7a.7.7 0 0 1 0 1.2l-6 3.7a.7.7 0 0 1-1.1-.6Z" fill={solid}/><path d="M5.6 20v-6l4.8-1v5.6M5.6 16l4.8-1"/><ellipse cx="4.4" cy="20.1" rx="1.5" ry="1.2" fill="currentColor"/><ellipse cx="9.1" cy="18.6" rx="1.5" ry="1.2" fill="currentColor"/><circle cx="17.4" cy="17.5" r="4.1" fill={solid}/></>;break;
  case 'text':glyph=filled?<path d="M4.3 4h15.4v4h-1.5V5.8h-5.3v12.8h2.9v1.5H8.2v-1.5h2.9V5.8H5.8V8H4.3Z" fill="currentColor" stroke="none"/>:<path d="M4.3 7.3V4.5h15.4v2.8M12 4.5v15M8.4 19.5h7.2"/>;break;
  case 'tools':glyph=<><path d="m8 10.6 6.6-6.7a2.4 2.4 0 0 1 3.5 3.4L11.4 14l-5.1 1.8Z" fill={solid}/><path d="m14.1 4.5 3.5 3.4M8 10.6l3.4 3.4" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/><path d="M4.5 15.4H3.3a1.6 1.6 0 0 0 0 3.2h16.4a1.2 1.2 0 0 1 0 2.4H9"/></>;break;
  case 'apps':glyph=<><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3"/><path d="M17.3 13.5v7.5M13.5 17.3H21"/></>;break;
  case 'components':glyph=<><path d="m12 2.5 8.3 4.8v9.4L12 21.5l-8.3-4.8V7.3Z" fill={solid}/><circle cx="12" cy="12" r="4.1" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'audio':glyph=<><path d="M8 18V5l12-2v13M8 8l12-2"/><ellipse cx="5.2" cy="18.7" rx="3" ry="2.6" fill={solid}/><ellipse cx="17.2" cy="16.7" rx="3" ry="2.6" fill={solid}/></>;break;
  case 'background':glyph=<><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill={solid}/><path d="m4 7 3-3M4 10.5 10.5 4M4 14l10-10M4 17.5 17.5 4M5 20 20 5M8.5 20 20 8.5M12 20l8-8M15.5 20l4.5-4.5M19 20l1-1" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'charts':glyph=<><path d="M4 3.7v16.6h16.6"/><path d="M7.8 16.8v-5M12.4 16.8V7.6M17 16.8V4" strokeWidth="2.5"/></>;break;
  case 'comments':glyph=<><path d="M20.8 11.1a8.8 8.8 0 0 1-12.9 7.8L3.2 21l1.3-4.8A8.8 8.8 0 1 1 20.8 11.1Z"/></>;break;
  case 'file':glyph=<><path d="M6.3 3.2h8l4.4 4.4v12.5a.7.7 0 0 1-.7.7H6.3a.7.7 0 0 1-.7-.7V3.9a.7.7 0 0 1 .7-.7Z"/><path d="M14.2 3.2v4.6h4.5"/></>;break;
  case 'resize':glyph=<><path d="M4 10V4h6M20 14v6h-6M4 4l5.5 5.5M20 20l-5.5-5.5"/><path d="M15 4h5v5M9 20H4v-5"/></>;break;
  case 'star':glyph=<><path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.4l6.2-.9Z" fill={solid}/></>;break;
  case 'trash':glyph=<><path d="M4.5 6.8h15M9 6.8V3.5h6v3.3M6.5 6.8l.8 13.5h9.4l.8-13.5M10 10.6v6M14 10.6v6"/></>;break;
  case 'settings':glyph=<><path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="2.4" fill="var(--surface, #fff)"/><circle cx="16" cy="17" r="2.4" fill="var(--surface, #fff)"/></>;break;
  case 'sun':glyph=<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>;break;
  case 'moon':glyph=<><path d="M20.5 14.2A8.9 8.9 0 0 1 9.8 3.5 9 9 0 1 0 20.5 14.2Z"/></>;break;
  case 'chevron':glyph=<><path d="m9 5 7 7-7 7"/></>;break;
  case 'close':glyph=<><path d="m6 6 12 12M18 6 6 18"/></>;break;
  case 'check':glyph=<><path d="m5 12 4.5 4.5L19 7"/></>;break;
  case 'edit':glyph=<><path d="m4.1 15.2 11.4-11.4a2.5 2.5 0 0 1 3.5 3.5L7.6 18.7l-5 1.5Z"/><path d="m13.8 5.5 3.5 3.5M4.1 15.2l3.5 3.5"/></>;break;
  case 'eye':glyph=<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.3"/></>;break;
  case 'copy':case 'duplicate':glyph=<><path d="M7.2 16.8H5a2 2 0 0 1-2-2V4.9a2 2 0 0 1 2-2h9.9a2 2 0 0 1 2 2V7"/><rect x="8" y="8" width="13" height="13" rx="2"/>{name==='duplicate'&&<path d="M14.5 11.8v6M11.5 14.8h6"/>}</>;break;
  case 'clipboard':glyph=<><path d="M8 5H5.3a1.4 1.4 0 0 0-1.4 1.4v13.1a1.4 1.4 0 0 0 1.4 1.4h13.4a1.4 1.4 0 0 0 1.4-1.4V6.4A1.4 1.4 0 0 0 18.7 5H16"/><path d="M10 4.7a2 2 0 0 1 4 0h2v3H8v-3Z"/></>;break;
  case 'paint-roller':glyph=<><rect x="3" y="3.5" width="15.5" height="5" rx="1.4"/><path d="M18.5 6H21v5l-9 2.3V16"/><rect x="10" y="16" width="4" height="6" rx="1.1"/></>;break;
  case 'lock':case 'unlock':glyph=<><rect x="5.1" y="10.1" width="13.8" height="11.1" rx="1.5"/>{name==='lock'?<path d="M7.6 10.1V6.8a4.4 4.4 0 0 1 8.8 0v3.3"/>:<path d="M7.6 10.1V6.8a4.4 4.4 0 0 1 8.8 0"/>}<circle cx="12" cy="14.4" r=".8"/><path d="M12 15.2v2.6"/></>;break;
  case 'link':glyph=<><path d="M10.3 7.5H7.1a4.5 4.5 0 0 0 0 9h5.2a4.5 4.5 0 0 0 4.2-2.8M13.7 16.5h3.2a4.5 4.5 0 0 0 0-9h-5.2a4.5 4.5 0 0 0-4.2 2.8M8.3 12h7.4"/></>;break;
  case 'alternative-text':glyph=<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="6.8" r="1" fill="currentColor" stroke="none"/><path d="m7.5 9.3 4.5 1 4.5-1M12 10.3V14m0 0-2.3 4.5M12 14l2.3 4.5"/></>;break;
  case 'layers':glyph=<><path d="m12 3 10 5.6L12 14.2 2 8.6Zm-7.5 9L2 13.4 12 19l10-5.6-2.5-1.4M4.5 17 12 21l7.5-4"/></>;break;
  case 'bring-front':case 'bring-forward':case 'send-backward':case 'send-back':glyph=<><path d="M5.5 18.5H3V3h15.5v2.5"/><rect x="8" y="8" width="13" height="13" rx=".7" fill={name==='bring-front'||name==='bring-forward'?'currentColor':'none'}/><path d={name==='bring-front'||name==='bring-forward'?'m11 14.8 3.5-3.5 3.5 3.5M14.5 11.3v7':'m11 14.2 3.5 3.5 3.5-3.5M14.5 17.7v-7'} stroke={name==='bring-front'||name==='bring-forward'?'var(--icon-cutout, #fff)':'currentColor'}/>{(name==='bring-front'||name==='send-back')&&<path d={name==='bring-front'?'M11 10h7':'M11 19h7'} stroke={name==='bring-front'?'var(--icon-cutout, #fff)':'currentColor'}/>}</>;break;
  case 'align-left':case 'align-center':case 'align-right':glyph=<>{name==='align-left'?<><path d="M3 3v18"/><rect x="6.5" y="5" width="14" height="4.5" rx=".7"/><rect x="6.5" y="14.5" width="9" height="4.5" rx=".7"/></>:name==='align-right'?<><path d="M21 3v18"/><rect x="3.5" y="5" width="14" height="4.5" rx=".7"/><rect x="8.5" y="14.5" width="9" height="4.5" rx=".7"/></>:<><path d="M12 2.5V21.5"/><rect x="3" y="5" width="18" height="4.5" rx=".7" fill="var(--icon-cutout, #fff)"/><rect x="6.5" y="14.5" width="11" height="4.5" rx=".7" fill="var(--icon-cutout, #fff)"/></>}</>;break;
  case 'align-top':case 'align-middle':case 'align-bottom':glyph=<g transform="rotate(90 12 12)">{name==='align-top'?<><path d="M3 3v18"/><rect x="6.5" y="5" width="14" height="4.5" rx=".7"/><rect x="6.5" y="14.5" width="9" height="4.5" rx=".7"/></>:name==='align-bottom'?<><path d="M21 3v18"/><rect x="3.5" y="5" width="14" height="4.5" rx=".7"/><rect x="8.5" y="14.5" width="9" height="4.5" rx=".7"/></>:<><path d="M12 2.5V21.5"/><rect x="3" y="5" width="18" height="4.5" rx=".7" fill="var(--icon-cutout, #fff)"/><rect x="6.5" y="14.5" width="11" height="4.5" rx=".7" fill="var(--icon-cutout, #fff)"/></>}</g>;break;
  case 'timing':glyph=<><circle cx="12" cy="12" r="9.2"/><path d="M12 4.9V12l4.7 4.7"/></>;break;
  case 'stroke-style':glyph=<><path d="M3 5h18M3 10h18"/><path d="M3 17h18" strokeWidth="5" strokeLinecap="butt"/></>;break;
  case 'corners':glyph=<><path d="M4 19v-6a9 9 0 0 1 9-9h6"/><circle cx="4" cy="20" r="1.5" fill="currentColor"/><circle cx="20" cy="4" r="1.5" fill="currentColor"/></>;break;
  case 'transparency':glyph=<>{Array.from({length:16},(_,index)=>{const row=Math.floor(index/4),column=index%4;return <rect key={index} x={2+column*5.2} y={2+row*5.2} width="4" height="4" rx=".5" fill="currentColor" stroke="none" opacity={Math.max(.16,1-column*.22-row*.035)}/>;})}</>;break;
  case 'spacing':glyph=<><path d="M6.3 6V3.5h11.4V6M12 3.5v11M9 14.5h6M3 19h18m-18 0 3-3m-3 3 3 3m15-3-3-3m3 3-3 3"/></>;break;
  case 'line-start':case 'line-end':glyph=<><path d="M3 12h18"/><path d={name==='line-start'?'m8 7-5 5 5 5':'m16 7 5 5-5 5'}/></>;break;
  case 'swap-ends':glyph=<><path d="m8.5 7-5 5 5 5m7-10 5 5-5 5"/></>;break;
  case 'line-type':glyph=<><path d="m5 19 14-14"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/></>;break;
  case 'strikethrough':glyph=<><path d="M17 6a4 4 0 0 0-4-2H11a3.5 3.5 0 0 0-.9 6.9M7 18a4 4 0 0 0 4 2h2a3.5 3.5 0 0 0 .9-6.9M3 12h18"/></>;break;
  case 'uppercase':glyph=<><path d="m12 19 5-14 5 14m-8.7-4.5h7.4M9 19v-6.2a2.8 2.8 0 0 0-5.6 0M9 16.2H5.5a2 2 0 1 0 0 4c1.6 0 2.6-.9 3.5-2"/></>;break;
  case 'image':glyph=<><rect x="2.5" y="3.5" width="19" height="17" rx="2" fill={solid}/><circle cx="8" cy="8.5" r="1.6"/><path d="m3 17 5-5 4 3.5 3-2.5 6 5"/></>;break;
  case 'frames':glyph=<><path d="M7 3.5h10a3.5 3.5 0 0 1 3.5 3.5v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5Z" fill={solid}/><path d="M7 1.5v4M12 1.5v4M17 1.5v4M7 18.5v4M12 18.5v4M17 18.5v4M1.5 7h4M1.5 12h4M1.5 17h4M18.5 7h4M18.5 12h4M18.5 17h4"/><path d="m6.5 15 4-4 3 2.5 2-1.5 2 3.5" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'grid':glyph=<><rect x="2.5" y="2.5" width="19" height="19" rx="2" fill={solid}/><path d="M11.5 2.5v19M11.5 12h10" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
 }
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{glyph}</svg>;
}
export const TemplatesIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="templates" {...props}/>;
export const ElementsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="elements" {...props}/>;
export const TextIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="text" {...props}/>;
export const BrandIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="brand" {...props}/>;
export const UploadsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="upload" {...props}/>;
export const ToolsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="tools" {...props}/>;
export const ProjectsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="projects" {...props}/>;
export const AppsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="apps" {...props}/>;
export const ComponentsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="components" {...props}/>;
export const AudioIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="audio" {...props}/>;
export const BackgroundIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="background" {...props}/>;
export const ChartsIcon=(props:Omit<StudioIconProps,'name'>)=><StudioIcon name="charts" {...props}/>;
