export interface WorkspaceTab {id:string;name:string}
export function normalizeWorkspaceTabs(value:unknown):WorkspaceTab[]{
  if(!Array.isArray(value))return[];
  const seen=new Set<string>();
  return value.flatMap(item=>{
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id.trim()||item.id.length>200||seen.has(item.id))return[];
    seen.add(item.id);return[{id:item.id,name:typeof item.name==='string'?item.name.slice(0,200)||'Untitled design':'Untitled design'}];
  }).slice(-20);
}
export function upsertWorkspaceTab(tabs:WorkspaceTab[],tab:WorkspaceTab):WorkspaceTab[]{
  const index=tabs.findIndex(t=>t.id===tab.id);
  return normalizeWorkspaceTabs(index<0?[...tabs,tab]:tabs.map((previous,i)=>i===index?tab:previous));
}
