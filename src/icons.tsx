import type { SVGProps } from 'react';

export type StudioIconName = 'menu'|'create'|'home'|'projects'|'templates'|'brand'|'ai'|'more'|'notifications'|'search'|'presentation'|'social'|'video'|'print'|'document'|'whiteboard'|'sheet'|'website'|'custom'|'upload'|'elements'|'text'|'tools'|'apps'|'components'|'audio'|'background'|'charts'|'comments'|'file'|'resize'|'star'|'trash'|'settings'|'sun'|'moon'|'chevron'|'close'|'check';
export interface StudioIconProps extends SVGProps<SVGSVGElement> { name: StudioIconName; size?: number; filled?: boolean; }

/** Shared 24 px interface glyphs, with the reference UI's rounded 1.5 px outlines. */
export function StudioIcon({name,size=24,filled=false,strokeWidth=1.5,...props}:StudioIconProps) {
 const solid=filled?'currentColor':'none';
 let glyph;
 switch(name) {
  case 'menu': glyph=<><path d="M5 6.5h14M5 12h14M5 17.5h14"/></>;break;
  case 'create':case 'custom':glyph=<><path d="M12 5v14M5 12h14"/></>;break;
  case 'home':glyph=<><path d="M3.8 10.2 12 3.7l8.2 6.5v9.1a1 1 0 0 1-1 1h-4.4v-7H9.2v7H4.8a1 1 0 0 1-1-1Z" fill={solid}/><path d="m2.5 11.2 9.5-7.5 9.5 7.5"/></>;break;
  case 'projects':glyph=<><path d="M3.5 7.2V5.9a1.6 1.6 0 0 1 1.6-1.6h4.3l2 2.1h7.4A1.7 1.7 0 0 1 20.5 8v10.1a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6Z" fill={solid}/><path d="M3.8 8.4h16.4"/></>;break;
  case 'templates':glyph=<><rect x="3.5" y="4" width="17" height="16" rx="1.6" fill={solid}/><path d="M11 4v16M11 11h9.5" stroke={filled?'var(--icon-cutout, #fff)':'currentColor'}/></>;break;
  case 'brand':glyph=<><rect x="3.3" y="6.6" width="17.4" height="13.7" rx="2"/><path d="M8.3 6.6V4.7a1.5 1.5 0 0 1 1.5-1.5h4.4a1.5 1.5 0 0 1 1.5 1.5v1.9"/><path d="M12 13.6c-1.7-2.6-4.8-3.5-6-.8-1.2 2.7 2.5 4.7 6 .8 3.5-3.9 7.2-1.9 6 .8-1.2 2.7-4.3 1.8-6-.8Z"/></>;break;
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
  case 'upload':glyph=<><path d="M7.6 18.5H6a3.7 3.7 0 0 1-.6-7.3 6.6 6.6 0 0 1 12.8-1.9 4.7 4.7 0 0 1-.3 9.2h-1.5" fill={solid}/><path d="M12 21V12m-3 3 3-3 3 3"/></>;break;
  case 'elements':glyph=<><path d="M2.8 6.4c0-2.5 3-3.1 4.1-1.1 1.1-2 4.1-1.4 4.1 1.1 0 2-4.1 4.6-4.1 4.6s-4.1-2.6-4.1-4.6Z" fill={solid}/><path d="m17.8 3.4 4.5 7.1h-9Z" fill={solid}/><path d="M6.1 20.4v-6.8l4-1v5.6M6.1 15.8l4-1"/><ellipse cx="4.7" cy="20.4" rx="1.5" ry="1.1" fill="currentColor"/><ellipse cx="8.7" cy="18.2" rx="1.5" ry="1.1" fill="currentColor"/><circle cx="17.9" cy="17.4" r="3.8" fill={solid}/></>;break;
  case 'text':glyph=<><path d="M4.8 5h14.4M12 5v15M8.7 20h6.6M4.8 5v3M19.2 5v3"/></>;break;
  case 'tools':glyph=<><path d="m6.2 12.8 8.9-8.9 4.3 4.3-8.9 8.9-5.5 1.2Zm7.8-7.8 4.3 4.3M6.2 12.8l4.3 4.3"/><path d="M2.5 21c3.5-2.9 5.3 1.3 8.6-1 2.8-1.9 4.5 2.1 8.7-.6"/></>;break;
  case 'apps':glyph=<><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3"/><path d="M17.3 13.5v7.5M13.5 17.3H21"/></>;break;
  case 'components':glyph=<><path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4Z"/><path d="m12 7.8 3.6 2.1v4.2L12 16.2l-3.6-2.1V9.9Z"/></>;break;
  case 'audio':glyph=<><path d="M8 18V5l12-2v13M8 8l12-2"/><ellipse cx="5.2" cy="18.7" rx="3" ry="2.6" fill={solid}/><ellipse cx="17.2" cy="16.7" rx="3" ry="2.6" fill={solid}/></>;break;
  case 'background':glyph=<><rect x="3.5" y="3.5" width="17" height="17" rx="1.3"/><path d="m4 11 7-7M4 17 13 8M8 20l11-11M14 20l6-6"/><path d="m4 20 16-16"/></>;break;
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
