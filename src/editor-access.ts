import type {StudioEditor} from './editor';
import type {EditingMode} from './EditingModeMenu';

/** View modes gate the editor's mutation entry points as well as pointer editing.
 * Loading, page navigation, selection, zoom, copying and export remain available. */
export const EDITOR_MUTATIONS=[
  'convertSelectedShapeToFrame','insertDesign','addImage','insertFrame','replaceSelectedImage','replaceImageById','applyImageMask','duplicate','addPage','addPageAfter','movePage','duplicatePage','deletePage','undo','redo','bulkCreate','paste','cut','distribute','setName','setBrand','addText','addShape','replaceShape','addTable','addChart','setSelectedImageFrame','addFrame','removeFrame','addSVG','addGraphic','setGraphicColor','setGradient','setTextEffect','setPageMetadata','setProjectMetadata','formatSelectedText','updateSelectedTextStyle','continueSelectedTextList','indentSelectedTextList','updateSelected','nudge','rotateSelection','resizeSelection','editSelectedText','pasteStyle','setElementMetadata','insertObjects','remove','group','ungroup','arrange','align','flip','setBackground','resizeDesign','renamePage','applyEffects','cropSelectedImage','cropImage','setSelectedImageAsBackground','resetImageEffects','setDrawing','setLayerVisibility','setLayerLocked','reorderLayer','moveLayer','setCornerRadius',
] as const;
const ASYNC_MUTATIONS=new Set(['convertSelectedShapeToFrame','insertDesign','addImage','insertFrame','replaceSelectedImage','replaceImageById','applyImageMask','duplicate','addPage','addPageAfter','duplicatePage','deletePage','undo','redo','bulkCreate','paste','cut','addSVG','insertObjects']);
export interface EditorAccess {getMode:()=>EditingMode;setMode:(mode:EditingMode)=>Promise<void>;dispose:()=>void}
export function installEditorAccess(editor:StudioEditor):EditorAccess {
  let mode:EditingMode='editing',epoch=0,disposed=false;
  const instance=editor as unknown as Record<string,unknown>,originals=new Map<string,Function>();
  for(const name of EDITOR_MUTATIONS){const original=instance[name];if(typeof original!=='function')continue;originals.set(name,original);instance[name]=function(...args:unknown[]){if(mode!=='editing')return ASYNC_MUTATIONS.has(name)?Promise.resolve():false;return Reflect.apply(original,editor,args);};}
  const enforce=()=>{
    if(disposed||mode==='editing')return;
    editor.canvas.isDrawingMode=false;editor.canvas.selection=false;editor.canvas.skipTargetFind=true;
    if(editor.canvas.getActiveObject())editor.canvas.discardActiveObject();
    editor.canvas.defaultCursor='default';editor.canvas.hoverCursor='default';
  };
  // Releasing Space restores Fabric's normal interaction flags synchronously.
  // Keep that restoration inside the current access mode before another
  // pointer event can arrive, rather than waiting for the next painted frame.
  const originalPan=editor.setPanMode;
  originals.set('setPanMode',originalPan);
  instance.setPanMode=function(enabled:boolean){const result=Reflect.apply(originalPan,editor,[enabled]);if(!enabled)enforce();return result;};
  const off=editor.canvas.on('after:render',enforce);
  return {
    getMode:()=>mode,
    setMode:async(next)=>{
      if(disposed)return;const ticket=++epoch;
      // Finish the in-progress text gesture before closing the editing surface.
      const selected=editor.canvas.getActiveObject() as unknown as {exitEditing?:()=>void;isEditing?:boolean}|undefined;
      if(selected?.isEditing)selected.exitEditing?.();
      editor.flushPendingChanges();mode=next;
      if(next!=='editing'){editor.canvas.discardActiveObject();enforce();}
      await editor.whenIdle();if(disposed||ticket!==epoch)return;
      editor.canvas.selection=next==='editing';editor.canvas.skipTargetFind=next!=='editing';editor.canvas.isDrawingMode=false;
      editor.canvas.defaultCursor='default';editor.canvas.hoverCursor=next==='editing'?'move':'default';
      editor.canvas.requestRenderAll();
    },
    dispose:()=>{disposed=true;++epoch;off();for(const [name,original] of originals)instance[name]=original;},
  };
}
