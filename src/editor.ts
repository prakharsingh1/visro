import {convertShapeToFrameObject} from './shape-frame';
import {createNativeMockup,getMockup} from './mockups';
import {getTextCombination} from './text-combinations';
import {formatTextSelection} from './text-formatting';
import {convertCatalogLineObject,getLineStyle,installLineControls,isEditableLine,swapLineObjectEnds,syncLineAppearance,syncLineSubtree,updateLineObject} from './line-editing';
import type {LineGeometry,LineStyle} from './line-geometry';
import {resizeSerializedObjects} from './document-resize';
import {installInteractionControls} from './interaction-controls';
import {SHAPE_EFFECT_CUSTOM_PROPS,applyShapeEffectPatch,createShapeEffectObject,getShapeEffect,getShapeEffectBase,isShapeEffectObject,normalizeShapeEffect,refreshShapeEffect,supportsShapeEffect,updateShapeEffectBase,updateVectorBasePaint,type ShapeEffect,type ShapeEffectPatch,type ShapeEffectObject} from './shape-effects';
import {inlineBundledImage} from './bundled-images';
import {getGraphic} from './graphics-library';
import {getShapeGeometry} from './shapes';
import {getFrameDefinition,getFrameLibraryItem,resolveGridSlots,type FrameDefinition} from './frames';
import {formatTextObject,applyTextObjectStyle,continueTextObjectList,indentTextObjectList,getTextObjectSelectionStyle} from './editor-text';
import type {TextFormatAction} from './text-formatting';
import {
  ActiveSelection,
  type IText,
  Canvas,
  StaticCanvas,
  Circle,
  FabricImage,
  FabricObject,
  Group,
  Gradient,
  Ellipse,
  Path,
  Line,
  PencilBrush,
  Point,
  Polygon,
  Rect,
  Shadow,
  Textbox,
  Triangle,
  filters,
  util,
  loadSVGFromString,
} from "fabric";
import type {
  Alignment,
  ArrangeDirection,
  DesignElement,
  DesignSpec,
  EditorOptions,
  EditorState,
  ExportOptions,
  SelectedObject,
  SelectionUpdate,
  ShapeType,
  TextRole,
  VisroProject,
  ChartOptions,
  FrameShape,
  PageMetadata,
  TableOptions,
  TextEffect,
  ElementMetadata,
  ImageEffects,
  ImageCropRect,
  ElementPlacement,
  ImagePlacement,
} from "./editor-types";
import {
  cloneProject,
  createProject,
  MAX_DESIGN_SIZE,
  newId,
  projectsEqual,
  sanitizeElementMetadata,
  validateProject,
} from "./project";
import { getTemplate } from "./templates";

export type { EditorState, SelectionState, VisroProject } from "./editor-types";

type StudioObject = FabricObject & {
  id?: string;
  visroName?: string;
  visroLocked?: boolean;
  visroTextEffect?: TextEffect;
  visroGradient?: { colors: string[]; angle: number };
  visroFrame?: FrameShape;
  visroTextBaseFill?: string;
  visroOriginalSrc?: string;
  visroMetadata?: ElementMetadata;
  visroGraphicId?: string;
  visroEmptyFrame?: boolean;
  visroGridId?: string;
  visroMockupId?: string;
  visroShapeType?: ShapeType;
  visroShapeEffect?:ShapeEffect;
  visroShapeEffectBase?:ShapeEffectObject['visroShapeEffectBase'];
  visroShapeEffectRole?:ShapeEffectObject['visroShapeEffectRole'];
  visroLine?: LineGeometry;
};
type OptionDrag = {
  target: FabricObject;
  originals: StudioObject[];
  originalIds: Map<StudioObject, string | undefined>;
  copies?: StudioObject[];
  moved: boolean;
  ended: boolean;
  failed: boolean;
  finish: () => void;
};
const CUSTOM_PROPS = ["id", "visroName", "visroLocked", "visroTextEffect", "visroGradient", "visroFrame", "visroTextBaseFill", "visroOriginalSrc", "visroMetadata", "visroGraphicId", "visroEmptyFrame", "visroGridId", "visroMockupId", "visroShapeType", "visroLine",...SHAPE_EFFECT_CUSTOM_PROPS];
const SELECTION_COLOR = '#8B3DFF';
const INTERACTION_STYLE = {
  cornerColor: '#ffffff', cornerStrokeColor: SELECTION_COLOR,
  cornerStyle: 'circle' as const, cornerSize: 9, touchCornerSize: 24,
  transparentCorners: false, borderColor: SELECTION_COLOR, padding: 3,
  activeOn: 'down' as const, hoverCursor: 'move', moveCursor: 'move',
};
FabricObject.customProperties = [
  ...new Set([...FabricObject.customProperties, ...CUSTOM_PROPS]),
];

function label(object: StudioObject, name: string): StudioObject {
  object.id = newId();
  object.visroName = name;
  object.set(INTERACTION_STYLE);
  installInteractionControls(object);
  return object;
}

function isStudioImage(object:StudioObject|undefined):object is FabricImage&StudioObject {return object instanceof FabricImage;}

function objectName(object: StudioObject): string {
  if (object.visroName) return object.visroName;
  if (object instanceof Textbox) return object.text.slice(0, 36) || "Text";
  return object instanceof FabricImage
    ? "Image"
    : object.type.charAt(0).toUpperCase() + object.type.slice(1);
}

function isText(object: FabricObject): object is Textbox {
  return (
    object.type === "textbox" ||
    object.type === "i-text" ||
    object.type === "text"
  );
}

function objectType(object: FabricObject): string {
  if(isShapeEffectObject(object))return objectType(getShapeEffectBase(object));
  if (isEditableLine(object)) return 'line';
  if (isText(object)) return "text";
  if (object instanceof FabricImage) return "image";
  if (object instanceof Group || object instanceof ActiveSelection)
    return "group";
  return object.type;
}

function selectedGradient(value:FabricObject['fill']):SelectedObject['fillGradient'] {
  if(!(value instanceof Gradient))return undefined;
  const coords=value.coords,angle=value.type==='radial'?0:Math.atan2(coords.y2-coords.y1,coords.x2-coords.x1)*180/Math.PI;
  return{type:value.type,colors:value.colorStops.map(stop=>stop.color),angle};
}
function resizedNativeGradient(value:FabricObject['fill'],width:number,height:number,oldWidth:number,oldHeight:number):FabricObject['fill'] {
  if(!(value instanceof Gradient))return value;
  const data=value.toObject();if(!data.coords)return value;const coords={x1:data.coords.x1??0,y1:data.coords.y1??0,x2:data.coords.x2??0,y2:data.coords.y2??0},radial=data.coords as {r1?:number;r2?:number};let r1=radial.r1??0,r2=radial.r2??0;
  if(data.gradientUnits==='pixels'){
    const sx=width/Math.max(.001,oldWidth),sy=height/Math.max(.001,oldHeight);
    coords.x1*=sx;coords.x2*=sx;coords.y1*=sy;coords.y2*=sy;r1*=Math.max(sx,sy);r2*=Math.max(sx,sy);
  }
  return data.type==='radial'?new Gradient({...data,type:'radial',coords:{...coords,r1,r2}}):new Gradient({...data,type:'linear',coords});
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(
    minimum,
    Math.min(maximum, Number.isFinite(value) ? value : minimum),
  );
}

function starPoints(size: number): { x: number; y: number }[] {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = (index * Math.PI) / 5 - Math.PI / 2;
    const radius = index % 2 ? size * 0.22 : size * 0.5;
    return {
      x: size / 2 + Math.cos(angle) * radius,
      y: size / 2 + Math.sin(angle) * radius,
    };
  });
}

let placeholderData:string|undefined;
function framePlaceholderData():string {
  if(placeholderData)return placeholderData;
  const canvas=util.createCanvasElement();canvas.width=1000;canvas.height=1000;
  const context=canvas.getContext('2d')!;context.scale(10,10);
  context.fillStyle='#bed9ec';context.fillRect(0,0,100,100);context.fillStyle='#fff7d6';context.beginPath();context.arc(74,25,10,0,Math.PI*2);context.fill();
  context.fillStyle='#8fb899';context.beginPath();context.moveTo(0,68);context.quadraticCurveTo(17,40,40,67);context.quadraticCurveTo(60,88,100,49);context.lineTo(100,100);context.lineTo(0,100);context.closePath();context.fill();
  context.fillStyle='#567d65';context.beginPath();context.moveTo(0,83);context.quadraticCurveTo(27,62,52,81);context.quadraticCurveTo(77,101,100,74);context.lineTo(100,100);context.lineTo(0,100);context.closePath();context.fill();
  placeholderData=canvas.toDataURL('image/png');return placeholderData;
}

/** A logical-pixel document independent from the screen viewport. */
export class StudioEditor {
  readonly canvas: Canvas;
  private document: VisroProject;
  private options: EditorOptions;
  private snapshots: VisroProject[] = [];
  private historyIndex = -1;
  private restoring = false;
  private viewportWidth = 800;
  private viewportHeight = 700;
  private dirty = false;
  private destroyed = false;
  private lastSaved: VisroProject | undefined;
  private exporting = false;
  private revision = 0;
  private asyncQueue: Promise<unknown> = Promise.resolve();
  private lifecycle = new AbortController();
  private suppressEvents = 0;
  private lastHistoryKey = '';
  private lastHistoryAt = 0;
  private clipboard: StudioObject[] = [];
  private pasteOffset = 0;
  private snapping = false;
  private alignmentGuides: { x: number[]; y: number[] } = { x: [], y: [] };
  private snapGuides: { x?: number; y?: number } = {};
  private hoverTarget?: FabricObject;
  private panMode = false;
  private panPoint?: Point;
  private drawingBeforePan = false;
  private transformFrame?: number;
  private pendingTransformKey = '';
  private styleClipboard?: Record<string, unknown>;
  private optionDrag?: OptionDrag;
  private removeLayerPicker?: () => void;
  private documentMutationAllowed=()=>true;

  constructor(element: HTMLCanvasElement, options: EditorOptions = {}) {
    this.options = options;
    this.document = createProject(
      "Untitled design",
      options.width ?? 1080,
      options.height ?? 1080,
    );
    this.canvas = new Canvas(element, {
      width: this.viewportWidth,
      height: this.viewportHeight,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selectionColor: "rgba(139,61,255,0.12)",
      selectionBorderColor: SELECTION_COLOR,
      selectionLineWidth: 1,
      controlsAboveOverlay: true,
      uniformScaling: true,
      stopContextMenu: true,
      perPixelTargetFind: true,
      targetFindTolerance: 3,
    });
    const pickBehind = (event: MouseEvent): void => {
      if (event.button !== 0 || event.altKey || event.shiftKey || (!event.metaKey && !event.ctrlKey) || this.isTextEditing() || this.panMode || this.canvas.isDrawingMode) return;
      this.canvas.altSelectionKey = event.metaKey ? 'metaKey' : 'ctrlKey';
      this.cycleAt(this.canvas.getViewportPoint(event));
    };
    // Capture before Fabric chooses its transform target. Its documented
    // altSelectionKey then keeps the chosen underlying layer draggable.
    this.canvas.upperCanvasEl.addEventListener('mousedown', pickBehind, true);
    this.removeLayerPicker = () => this.canvas.upperCanvasEl.removeEventListener('mousedown', pickBehind, true);
    this.canvas.on("selection:created", () => this.selectionChanged());
    this.canvas.on("selection:updated", () => this.selectionChanged());
    this.canvas.on("selection:cleared", () => this.selectionChanged());
    this.canvas.on('text:selection:changed',()=>this.selectionChanged());
    this.canvas.on('text:editing:entered',()=>this.selectionChanged());
    this.canvas.on("object:modified", ({ target,action }) => {
      this.snapGuides = {}; this.hoverTarget = undefined;
      if (this.optionDrag?.moved && this.optionDrag.target === target) return;
      if(target&&typeof action==='string'&&action.startsWith('scale'))syncLineSubtree(target);
      this.commit();
    });
    this.canvas.on('before:transform', ({ e, transform }) => {
      if (e.altKey && transform.action === 'drag') this.beginOptionDrag(transform.target);
    });
    this.canvas.on('object:moving', ({ target }) => {
      this.hoverTarget = undefined;
      const drag = this.optionDrag;
      if (drag && target === drag.target && !drag.moved) {
        drag.moved = true;
        if (!drag.failed) for (const object of drag.originalIds.keys()) object.id = newId();
        this.insertOptionDragCopies(drag);
      }
      if (!this.snapping || !target) return;
      // Fabric emits object:moving from inside its drag handler, before it
      // refreshes aCoords. Read the new position, not the previous pointer step.
      target.setCoords();
      const threshold = 7 / this.canvas.getZoom();
      const bounds = target.getBoundingRect();
      const positions = [0, this.width / 2, this.width, ...this.alignmentGuides.x];
      const vertical = [0, this.height / 2, this.height, ...this.alignmentGuides.y];
      const active = new Set(this.canvas.getActiveObjects());
      for (const object of this.canvas.getObjects()) {
        if (object === target || active.has(object) || !object.visible) continue;
        const other = object.getBoundingRect();
        positions.push(other.left, other.left + other.width / 2, other.left + other.width);
        vertical.push(other.top, other.top + other.height / 2, other.top + other.height);
      }
      let dx = 0, dy = 0, nearestX = threshold, nearestY = threshold;
      this.snapGuides = {};
      for (const position of positions) {
        for (const current of [bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width]) {
          if (Math.abs(position - current) < nearestX) { dx = position - current; nearestX = Math.abs(dx); this.snapGuides.x = position; }
        }
      }
      for (const position of vertical) {
        for (const current of [bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height]) {
          if (Math.abs(position - current) < nearestY) { dy = position - current; nearestY = Math.abs(dy); this.snapGuides.y = position; }
        }
      }
      if (dx || dy) target.set({ left: target.left + dx, top: target.top + dy });
      target.setCoords();
    });
    this.canvas.on('mouse:down:before', ({ e }) => {
      this.flushPendingChanges();
      this.hoverTarget = undefined;
      if (this.panMode) {
        this.panPoint = this.canvas.getViewportPoint(e);
        this.canvas.setCursor('grabbing');
        e.preventDefault();
      }
    });
    this.canvas.on('mouse:move', ({ e, target }) => {
      if (this.panMode) {
        if (this.panPoint) {
          const point = this.canvas.getViewportPoint(e);
          this.pan(point.x - this.panPoint.x, point.y - this.panPoint.y);
          this.panPoint = point;
          this.canvas.setCursor('grabbing');
          e.preventDefault();
        }
        return;
      }
      if (this.canvas.isDrawingMode || this.isTextEditing() || ('buttons' in e && e.buttons)) return;
      const next = target && target.visible && !(target as StudioObject).visroLocked && !this.canvas.getActiveObjects().includes(target) ? target : undefined;
      if (next !== this.hoverTarget) { this.hoverTarget = next; this.canvas.requestRenderAll(); }
    });
    this.canvas.on('mouse:out', () => {
      if (this.hoverTarget) { this.hoverTarget = undefined; this.canvas.requestRenderAll(); }
    });
    this.canvas.on('mouse:up', () => {
      this.snapGuides = {}; this.panPoint = undefined;
      if (this.optionDrag) { this.optionDrag.ended = true; this.finishOptionDrag(this.optionDrag); }
      if (this.panMode) this.canvas.setCursor('grab');
      this.canvas.requestRenderAll();
    });
    this.canvas.on('mouse:wheel', ({ e }) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const point = this.canvas.getViewportPoint(e);
      this.zoomAt(this.canvas.getZoom() * Math.exp(-e.deltaY * 0.003), point);
      e.preventDefault(); e.stopPropagation();
    });
    this.canvas.on('after:render', ({ ctx }) => {
      if (this.exporting) return;
      ctx.save(); ctx.transform(...this.canvas.viewportTransform);
      const zoom = this.canvas.getZoom(); ctx.lineWidth = 1 / zoom; ctx.strokeStyle = SELECTION_COLOR;
      const hovered = this.hoverTarget;
      if (hovered?.visible && !this.panMode && !this.isTextEditing()) {
        const corners = hovered.getCoords();
        ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
        corners.slice(1).forEach(({ x, y }) => ctx.lineTo(x, y));
        ctx.closePath(); ctx.stroke();
      }
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      if (this.snapGuides.x !== undefined) { ctx.moveTo(this.snapGuides.x, 0); ctx.lineTo(this.snapGuides.x, this.height); }
      if (this.snapGuides.y !== undefined) { ctx.moveTo(0, this.snapGuides.y); ctx.lineTo(this.width, this.snapGuides.y); }
      ctx.stroke(); ctx.restore();
    });
    this.canvas.on("text:editing:exited", () => this.commit());
    this.canvas.on("path:created", (event) => {
      label(event.path as StudioObject, "Drawing");
      this.commit();
    });
    this.updateClip();
    this.fit();
    this.resetHistory();
  }


  loadProject(project: VisroProject): Promise<void> { return this.runQueued(() => this.loadProjectInternal(project)); }
  loadTemplate(id: string): Promise<void> { return this.runQueued(() => this.loadTemplateInternal(id)); }
  insertDesign(spec: DesignSpec, preserveHistory = true): Promise<void> { return this.runQueued(() => this.insertDesignInternal(spec, preserveHistory)); }
  addImage(url: string, name = 'Image', placement?: ImagePlacement): Promise<void> {
    const captured={...placement,pageId:placement?.pageId??this.document.activePageId};
    const target=captured.targetFrameId?this.findObject(captured.targetFrameId):undefined;
    return this.runQueued(() => this.addImageInternal(url,name,captured,target));
  }
  insertFrame(id:string,placement?:ElementPlacement):Promise<void> {
    const captured={...placement,pageId:placement?.pageId??this.document.activePageId};
    return this.runQueued(()=>this.insertFrameInternal(id,captured));
  }
  insertMockup(id:string,placement?:ElementPlacement):Promise<void> {
    const origin=this.document,pageId=placement?.pageId??this.document.activePageId,definition=getMockup(id),center=placement?.center?{...placement.center}:undefined;
    return this.runQueued(async()=>{
      const guard=()=>{this.assertOriginPage(pageId);placement?.signal?.throwIfAborted();if(origin!==this.document||!this.documentMutationAllowed())throw new Error('This design is no longer editable.');};guard();
      if(!definition)throw new Error('Choose a mockup from Elements.');
      const group=await createNativeMockup(id,{signal:placement?.signal?AbortSignal.any([placement.signal,this.lifecycle.signal]):this.lifecycle.signal});
      try{guard();}catch(error){group.dispose();throw error;}
      const object=label(group,definition.name),scale=Math.max(.0001,Math.floor(Math.min(this.width*.72/group.width,this.height*.72/group.height,2)*10000)/10000);
      object.set({scaleX:scale,scaleY:scale});object.setPositionByOrigin(new Point(center?.x??this.width/2,center?.y??this.height/2),'center','center');
      this.addAndSelect(object);
    });
  }
  convertSelectedShapeToFrame():Promise<void> {
    const previous=this.canvas.getActiveObject() as StudioObject|undefined,pageId=this.document.activePageId,origin=this.document;
    return this.runQueued(async()=>{
      this.assertOriginPage(pageId);
      if(!previous?.id||this.findObject(previous.id)!==previous||this.objectLocked(previous))throw new Error('Select an unlocked filled shape first.');
      const revision=this.revision,plain=isShapeEffectObject(previous)?await createShapeEffectObject(previous,{type:'none'},{signal:this.lifecycle.signal}):previous;
      let frame:StudioObject;try{frame=await convertShapeToFrameObject(plain,{signal:this.lifecycle.signal}) as StudioObject;}finally{if(plain!==previous)plain.dispose();}
      try{this.assertOriginPage(pageId);if(origin!==this.document||!this.documentMutationAllowed()||revision!==this.revision||this.findObject(previous.id)!==previous||this.objectLocked(previous))throw new Error('The shape was removed, changed or locked while the frame was preparing.');}catch(error){frame.dispose();throw error;}
      frame.set(INTERACTION_STYLE);
      const parent=previous.group instanceof Group&&!(previous.group instanceof ActiveSelection)?previous.group:undefined,index=(parent?parent.getObjects():this.canvas.getObjects()).indexOf(previous);
      this.canvas.discardActiveObject();
      if(parent){parent.insertAt(index,frame);parent.remove(previous);parent.set('dirty',true);}else{this.canvas.insertAt(index,frame);this.canvas.remove(previous);}
      this.canvas.setActiveObject(frame);frame.setCoords();this.commit();
    });
  }
  replaceSelectedImage(url:string):Promise<void> {
    const image=this.canvas.getActiveObject() as StudioObject|undefined,pageId=this.document.activePageId;
    return this.runQueued(()=>this.replaceImageInternal(image,url,pageId,'mask'));
  }
  replaceImageById(id:string,url:string,source?:ElementMetadata['source'],options?:{signal?:AbortSignal}):Promise<void> {
    const image=this.findObject(id),pageId=this.document.activePageId;
    return this.runQueued(()=>this.replaceImageInternal(image,url,pageId,'replace',source,options?.signal));
  }
  applyImageMask(url: string): Promise<void> { return this.replaceSelectedImage(url); }
  duplicate(): Promise<void> { return this.runQueued(() => this.duplicateInternal()); }
  addPage(): Promise<void> { return this.runQueued(() => this.addPageInternal()); }
  addPageAfter(id:string):Promise<void> {return this.runQueued(()=>this.addPageInternal(id));}
  movePage(id:string,direction:1|-1):void {
    if(this.destroyed||this.restoring)return;this.syncPage();const index=this.document.pages.findIndex(page=>page.id===id),target=index+direction;
    if(index<0||target<0||target>=this.document.pages.length)return;const [page]=this.document.pages.splice(index,1);this.document.pages.splice(target,0,page);this.commit();
  }
  duplicatePage(id?: string): Promise<void> { return this.runQueued(() => this.duplicatePageInternal(id)); }
  deletePage(id?: string): Promise<void> { return this.runQueued(() => this.deletePageInternal(id)); }
  setPage(id: string): Promise<void> { return this.runQueued(() => this.setPageInternal(id)); }
  setShapeEffect(patch:ShapeEffectPatch={}):Promise<void> {
    const origin=this.document,pageId=this.document.activePageId,ids=[...new Set(this.canvas.getActiveObjects().map(object=>(object as StudioObject).id).filter((id):id is string=>Boolean(id)))];
    return this.runQueued(async()=>{
      const guard=()=>{this.assertOriginPage(pageId);if(this.document!==origin||!this.documentMutationAllowed())throw new Error('This design is no longer editable.');};guard();
      const targets=ids.map(id=>this.findObject(id));if(!targets.length)return;
      if(targets.some(object=>!object||this.objectLocked(object)||isEditableLine(object)||!supportsShapeEffect(object)))throw new Error('Select unlocked vector shapes or graphics for effects.');
      const objects=targets as StudioObject[],changed=objects.filter(object=>patch.preset||JSON.stringify(normalizeShapeEffect(patch,getShapeEffect(object)))!==JSON.stringify(getShapeEffect(object)));if(!changed.length)return;
      if(changed.every(object=>isShapeEffectObject(object)&&normalizeShapeEffect(patch,getShapeEffect(object)).type===getShapeEffect(object).type&&getShapeEffect(object).type!=='none')){
        changed.forEach(object=>applyShapeEffectPatch(object,patch));this.commit(patch.preset?'':`shape-effect:${ids.join(',')}:${Object.keys(patch).sort().join(',')}`);return;
      }
      const revision=this.revision,replacements=await Promise.all(changed.map(object=>createShapeEffectObject(object,patch,{signal:this.lifecycle.signal})));
      try{guard();if(revision!==this.revision||changed.some(object=>this.findObject(object.id!)!==object||this.objectLocked(object)))throw new Error('The selected shape changed while the effect was preparing. Choose the effect again.');}catch(error){replacements.forEach(object=>object.dispose());throw error;}
      changed.forEach((object,index)=>this.replaceShapeEffectTarget(object,replacements[index]));
      const selected=ids.map(id=>this.findObject(id)).filter((object):object is StudioObject=>Boolean(object));if(selected.length)this.canvas.setActiveObject(selected.length===1?selected[0]:new ActiveSelection(selected,{canvas:this.canvas}));this.commit();
    });
  }
  private replaceShapeEffectTarget(previous:StudioObject,result:FabricObject):void {
    const parent=previous.group instanceof Group&&!(previous.group instanceof ActiveSelection)?previous.group:undefined,index=(parent?parent.getObjects():this.canvas.getObjects()).indexOf(previous);
    this.canvas.discardActiveObject();result.set(INTERACTION_STYLE);
    if(parent){parent.insertAt(index,result);parent.remove(previous);parent.set('dirty',true);}else{this.canvas.insertAt(index,result);this.canvas.remove(previous);}
    this.normalizeShapeEffectInteraction(result);result.setCoords();
  }
  private normalizeShapeEffectInteraction(object:FabricObject):void {
    if(!isShapeEffectObject(object))return;
    object.set({subTargetCheck:false,interactive:false,objectCaching:false});
    const disable=(child:FabricObject)=>{child.set({selectable:false,evented:false});if(child instanceof Group)child.getObjects().forEach(disable);};object.getObjects().forEach(disable);
  }
  undo(): Promise<void> { return this.runQueued(() => this.undoInternal()); }
  redo(): Promise<void> { return this.runQueued(() => this.redoInternal()); }
  exportImage(options: ExportOptions = {}): Promise<string> { return this.runQueued(() => this.exportImageInternal(options)); }
  exportPages(scale = 1): Promise<{id: string; name: string; dataURL: string; width: number; height: number}[]> { return this.runQueued(() => this.exportPagesInternal(scale)); }
  bulkCreate(rows: Record<string, string>[]): Promise<void> {
    return this.runQueued(async () => {
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50) throw new Error('Bulk create needs between 1 and 50 data rows.');
      if (this.document.pages.length + rows.length > 100) throw new Error('This would exceed the 100-page project limit.');
      for (const row of rows) {
        if (!row || Array.isArray(row) || typeof row !== 'object' || Object.keys(row).length > 64) throw new Error('Each data row must contain up to 64 named columns.');
        let rowLength = 0;
        for (const [key, value] of Object.entries(row)) {
          if (key.length > 128 || typeof value !== 'string' || value.length > 10000) throw new Error('Column names must fit 128 characters and values 10,000 characters.');
          rowLength += key.length + value.length;
        }
        if (rowLength > 100000) throw new Error('A data row is too large (100,000 characters maximum).');
      }
      this.syncPage();
      const before = cloneProject(this.document);
      const source = this.document.pages.find((page) => page.id === this.document.activePageId)!;
      const pages = rows.map((row, index) => {
        const page = cloneProject(source); page.id = newId('page');
        const title = row.name ?? row.Name ?? row.title ?? row.Title ?? Object.values(row)[0] ?? String(index + 1);
        page.name = `${source.name} · ${title}`.slice(0, 100);
        const replace = (object: Record<string, unknown>): void => {
          object.id = newId();
          if (typeof object.text === 'string') {
            object.text = object.text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (placeholder, key: string) => Object.hasOwn(row, key.trim()) ? row[key.trim()] : placeholder);
            if (typeof object.visroName === 'string') object.visroName = String(object.text).slice(0, 36);
          }
          if (Array.isArray(object.objects)) object.objects.forEach((child) => { if (child && typeof child === 'object') replace(child as Record<string, unknown>); });
        };
        (page.canvas.objects as Record<string, unknown>[]).forEach(replace);
        return page;
      });
      this.document.pages.push(...pages);
      try { await this.activatePage(pages[0].id); }
      catch (error) { this.document = before; throw error; }
      this.commit();
    });
  }

  get width(): number {
    return this.document.width;
  }
  get height(): number {
    return this.document.height;
  }
  get selected(): SelectedObject | null {
    return this.getSelected();
  }
  get state(): EditorState {
    return this.getState();
  }

  getProjectContent(): unknown { return this.document.content; }

  copy(): Promise<void> {
    return this.runQueued(async () => {
      const originals = this.canvas.getActiveObjects();
      const matrices = originals.map((object) => object.calcTransformMatrix());
      const copies = await Promise.all(originals.map((object) => object.clone(CUSTOM_PROPS)));
      this.assertAlive();
      copies.forEach((object, index) => util.applyTransformToObject(object, matrices[index]));
      this.clipboard = copies as StudioObject[];
      this.pasteOffset = 0;
    });
  }

  paste(): Promise<void> {
    return this.runQueued(async () => {
      if (!this.clipboard.length) return;
      const copies = await Promise.all(this.clipboard.map((object) => object.clone(CUSTOM_PROPS)));
      this.assertAlive(); this.pasteOffset += 24;
      const renew = (object: StudioObject): void => { object.id = newId(); if (object instanceof Group) object.getObjects().forEach((child) => renew(child as StudioObject)); };
      copies.forEach((object) => { renew(object as StudioObject); object.set({ left: object.left + this.pasteOffset, top: object.top + this.pasteOffset }); });
      this.canvas.discardActiveObject(); this.canvas.add(...copies);
      this.canvas.setActiveObject(copies.length === 1 ? copies[0] : new ActiveSelection(copies, { canvas: this.canvas }));
      this.commit();
    });
  }

  async cut(): Promise<void> { await this.copy(); this.remove(); }

  distribute(direction: 'horizontal' | 'vertical'): void {
    if (this.destroyed || this.restoring) return;
    const objects = this.canvas.getActiveObjects().filter((object) => !(object as StudioObject).visroLocked);
    if (objects.length < 3) return;
    this.canvas.discardActiveObject();
    const horizontal = direction === 'horizontal';
    const sorted = objects.map((object) => ({ object, bounds: object.getBoundingRect() })).sort((a, b) => horizontal ? a.bounds.left - b.bounds.left : a.bounds.top - b.bounds.top);
    const first = sorted[0].bounds, last = sorted[sorted.length - 1].bounds;
    const start = horizontal ? first.left : first.top, end = horizontal ? last.left + last.width : last.top + last.height;
    const total = sorted.reduce((sum, { bounds }) => sum + (horizontal ? bounds.width : bounds.height), 0);
    const gap = (end - start - total) / (sorted.length - 1);
    let position = start;
    for (const { object, bounds } of sorted) {
      if (horizontal) object.set('left', object.left + position - bounds.left);
      else object.set('top', object.top + position - bounds.top);
      object.setCoords(); position += (horizontal ? bounds.width : bounds.height) + gap;
    }
    this.canvas.setActiveObject(new ActiveSelection(objects, { canvas: this.canvas })); this.commit();
  }

  setSnapping(enabled: boolean): void { this.snapping = enabled; this.snapGuides = {}; this.canvas.requestRenderAll(); }

  setAlignmentGuides(guides: { x: number[]; y: number[] }): void {
    const coordinates = (values: number[], maximum: number): number[] => Array.isArray(values) ? [...new Set(values.filter(value => Number.isFinite(value) && value >= 0 && value <= maximum))].slice(0, 100) : [];
    this.alignmentGuides = { x: coordinates(guides.x, this.width), y: coordinates(guides.y, this.height) };
    this.snapGuides = {};
    this.canvas.requestRenderAll();
  }

  get activePageId():string {return this.document.activePageId;}

  getState(): EditorState {
    const selectedIds = new Set(
      this.canvas
        .getActiveObjects()
        .map((object) => (object as StudioObject).id),
    );
    return {
      name: this.document.name,
      width: this.width,
      height: this.height,
      zoom: this.canvas.getZoom(),
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.snapshots.length - 1,
      pages: this.document.pages.map(({ id, name, metadata }) => ({ id, name, metadata: cloneProject(metadata) })),
      activePageId: this.document.activePageId,
      background: typeof this.canvas.backgroundColor === 'string' ? this.canvas.backgroundColor || '#ffffff' : this.document.pages.find((page) => page.id === this.document.activePageId)?.background ?? '#ffffff',
      layers: this.canvas
        .getObjects()
        .map((raw) => {
          const object = raw as StudioObject;
          return {
            id: object.id!,
            name: objectName(object),
            type: objectType(object),
            visible: object.visible,
            locked: Boolean(object.visroLocked),
            selected: selectedIds.has(object.id),
          };
        })
        .reverse(),
      dirty: this.dirty,
      brand: cloneProject(this.document.brand),
      revision: this.revision,
      pageMetadata: cloneProject(this.document.pages.find((page) => page.id === this.document.activePageId)?.metadata ?? {}),
      backgroundGradient: cloneProject(this.document.pages.find((page) => page.id === this.document.activePageId)?.backgroundGradient),
      kind: this.document.kind ?? 'design',
    };
  }

  getSelected(): SelectedObject | null {
    const object = this.canvas.getActiveObject() as StudioObject | undefined;
    if (!object) return null;
    const base=getShapeEffectBase(object) as StudioObject,text = isText(base) ? base : undefined,lineStyle=getLineStyle(object),fillGradient=selectedGradient(base.fill),strokeGradient=selectedGradient(base.stroke),targets=this.canvas.getActiveObjects(),first=targets[0];
    return {
      id: object.id ?? "",
      type: objectType(object),
      name: objectName(object),
      text: text?.text,
      fill: lineStyle?(typeof object.stroke==='string'?object.stroke:'#292620'):typeof base.fill === "string" ? base.fill : fillGradient?.colors[0]??"#292620",
      fontSize: text?.fontSize ?? 32,
      fontFamily: text?.fontFamily ?? "Arial",
      fontWeight:text?.fontWeight??'normal',
      fontStyle: text?.fontStyle ?? "normal",
      align: text?.textAlign ?? "left",
      lineHeight: text?.lineHeight ?? 1.16,
      letterSpacing: text?.charSpacing ?? 0,
      opacity: object.opacity,
      left: object.left,
      top: object.top,
      width: object.getScaledWidth(),
      height: object.getScaledHeight(),
      angle: object.angle,
      locked: this.objectLocked(object),
      visible: object.visible,
      count: this.canvas.getActiveObjects().length,
      isImage: object instanceof FabricImage,
      underline: text?.underline ?? false,
      linethrough: text?.linethrough ?? false,
      stroke: typeof base.stroke === 'string' ? base.stroke : strokeGradient?.colors[0]??'',
      strokeWidth: base.strokeWidth,
      strokeDashArray:base.strokeDashArray?[...base.strokeDashArray]:null,
      strokeLineCap:base.strokeLineCap,
      cornerRadius:base instanceof Rect?base.rx*Math.abs(base.getObjectScaling().x):object instanceof FabricImage&&object.clipPath instanceof Rect?object.clipPath.rx*Math.abs(object.clipPath.scaleX*object.scaleX):0,
      frameId:object.visroFrame,
      emptyFrame:object.visroEmptyFrame,
      shapeType:base.visroShapeType??object.visroShapeType,
      strokeOnly: !!lineStyle||Boolean(base.stroke) && (!base.fill || base.fill === 'transparent' || base.fill === 'none'),
      ...(lineStyle?{lineStyle}:{}),
      shapeEffect:first&&isShapeEffectObject(first)?getShapeEffect(first):undefined,
      canShapeEffect:targets.length>0&&targets.every(target=>!this.objectLocked(target)&&!isEditableLine(target)&&supportsShapeEffect(target)),
      fillGradient,strokeGradient,
      textEffect: object.visroTextEffect ?? 'none',
      gradient: cloneProject(Array.isArray(base.visroGradient?.colors)?base.visroGradient:fillGradient),
      vectorColors:base instanceof Group&&!isEditableLine(object)&&supportsShapeEffect(base)?this.graphicColors(base):undefined,
      metadata: cloneProject(object.visroMetadata),
      ...(text?getTextObjectSelectionStyle(text as unknown as IText):{}),
    };
  }

  serialize(name?: string): VisroProject {
    this.syncPage();
    const result = cloneProject(this.document);
    if (name?.trim()) result.name = name.trim();
    return result;
  }

  async whenIdle(): Promise<void> {
    let queue: Promise<unknown>;
    do {
      queue = this.asyncQueue;
      await queue;
      this.assertAlive();
    } while (queue !== this.asyncQueue);
  }

  markSaved(revision = this.revision): void {
    if (revision !== this.revision || this.destroyed) return;
    this.lastSaved = this.serialize();
    this.dirty = false;
    this.emit();
  }

  setName(name: string): void {
    this.document.name = name.trim() || "Untitled design";
    this.commit();
  }

  setBrand(colors: string[], fonts: string[]): void {
    this.document.brand = {
      colors: colors.slice(0, 32),
      fonts: fonts.slice(0, 32),
    };
    this.commit();
  }

  private async loadProjectInternal(project: VisroProject): Promise<void> {
    const valid = validateProject(project);
    await this.restore(valid);
    this.fit();
    this.revision += 1;
    this.resetHistory();
    this.markSaved();
  }

  private async loadTemplateInternal(id: string): Promise<void> {
    const template = getTemplate(id);
    if (!template) throw new Error("This template could not be found.");
    await this.insertDesignInternal(template, false);
    this.document.brand.colors = [...template.palette];
    this.document.brand.fonts = ["Arial", "Georgia"];
    this.resetHistory();
    this.revision += 1;
    this.dirty = true;
    this.emit();
  }

  private async insertDesignInternal(spec: DesignSpec, preserveHistory = true): Promise<void> {
    if (!spec || !Array.isArray(spec.elements) || spec.elements.length > 2000)
      throw new Error("The design has invalid elements.");
    const width = bounded(Math.round(spec.width), 16, MAX_DESIGN_SIZE);
    const height = bounded(Math.round(spec.height), 16, MAX_DESIGN_SIZE);
    // Enliven image assets before touching the current document, so a failed image cannot erase it.
    const objects = await Promise.all(
      spec.elements.map((element) => this.makeElement(element)),
    );
    this.assertAlive();
    this.restoring = true;
    try {
      this.canvas.discardActiveObject();
      this.canvas.clear();
      if (preserveHistory) {
        this.document.width = width;
        this.document.height = height;
        const page = this.document.pages.find(
          (candidate) => candidate.id === this.document.activePageId,
        );
        if (page) page.name = spec.name || page.name;
      } else
        this.document = createProject(
          spec.name || "Untitled design",
          width,
          height,
          spec.background || "#ffffff",
        );
      this.canvas.backgroundColor = spec.background || "#ffffff";
      this.canvas.add(...objects);
      this.updateClip();
      this.syncPage();
    } finally {
      this.restoring = false;
    }
    this.fit();
    if (preserveHistory) this.commit();
    this.selectionChanged();
  }

  addText(role: TextRole = "body", placement?: {center?:{x:number;y:number};pageId?:string}): void {
    if (this.destroyed || this.restoring) return;
    if (placement?.pageId && placement.pageId !== this.document.activePageId) throw new Error('The page changed. Add the text again.');
    const size = role === "heading" ? 96 : role === "subheading" ? 54 : 32;
    const content =
      role === "heading"
        ? "Add a heading"
        : role === "subheading"
          ? "Add a subheading"
          : "Add your text";
    const object = label(
      new Textbox(content, {
        originX: "left",
        originY: "top",
        width: Math.min(this.width * 0.7, 700),
        left: this.width * 0.15,
        top: this.height * 0.42,
        fontFamily: "Arial",
        fontSize: size,
        fontWeight: role === "heading" ? 700 : 400,
        fill: "#292620",
        lineHeight: 1.12,
      }),
      content,
    );
    if (placement?.center) object.setPositionByOrigin(new Point(placement.center.x,placement.center.y),'center','center');
    this.addAndSelect(object);
  }

  /** A font combination stays one native group, with separately editable text. */
  addTextCombination(id:string,placement?:{center?:{x:number;y:number};pageId?:string}):void {
    if(this.destroyed||this.restoring||!this.documentMutationAllowed())return;
    if(placement?.pageId&&placement.pageId!==this.document.activePageId)throw new Error('The page changed. Choose the font combination again.');
    if(placement?.center&&(!Number.isFinite(placement.center.x)||!Number.isFinite(placement.center.y)))throw new Error('Choose a position on the page.');
    const combination=getTextCombination(id);if(!combination)throw new Error('Choose a font combination from the Text library.');
    const objects=combination.parts.map((part,index)=>{
      const object=part.kind==='text'?new Textbox(part.text,{originX:'left',originY:'top',left:part.x,top:part.y,width:part.width,fontFamily:part.fontFamily,fontSize:part.fontSize,fontWeight:part.fontWeight??400,fill:part.fill,textAlign:part.align??'center',lineHeight:part.lineHeight??1.06,charSpacing:part.spacing??0,angle:part.angle??0,stroke:part.stroke??null,strokeWidth:part.strokeWidth??0}):part.kind==='rect'?new Rect({originX:'left',originY:'top',left:part.x,top:part.y,width:part.width,height:part.height,fill:part.fill,rx:part.rx??0,ry:part.rx??0,angle:part.angle??0,strokeWidth:0}):new Path(part.path,{fill:part.fill==='none'?null:part.fill,stroke:part.stroke??null,strokeWidth:part.strokeWidth??0,strokeLineCap:'round',strokeLineJoin:'round'});
      return label(object,part.kind==='text'?part.text:`${combination.name} decoration ${index+1}`);
    });
    const group=label(new Group(objects,{subTargetCheck:true,interactive:true}),combination.name);
    const scale=Math.floor(Math.min(this.width*.65/Math.max(1,group.width),this.height*.5/Math.max(1,group.height),1.5)*10000)/10000;group.set({scaleX:scale,scaleY:scale});
    const center=placement?.center??{x:this.width/2,y:this.height/2};group.setPositionByOrigin(new Point(center.x,center.y),'center','center');
    this.addAndSelect(group);
  }

  addShape(type: ShapeType = "rect", placement?: {center?:{x:number;y:number};pageId?:string}): void {
    if (this.destroyed || this.restoring) return;
    if (placement?.pageId && placement.pageId !== this.document.activePageId) throw new Error('The page changed. Choose the shape again.');
    const definition = getShapeGeometry(type);
    const size = Math.min(this.width, this.height) * 0.24;
    const width = size * (definition.category === 'Lines' ? 1.5 : 1), height = width / definition.aspectRatio;
    const common = {originX:'left' as const,originY:'top' as const,fill:'#F26B3A',strokeWidth:0};
    let object: FabricObject;
    if (type === 'circle') object = new Circle({...common,radius:size/2});
    else if (type === 'ellipse') object = new Ellipse({...common,rx:width/2,ry:height/2});
    else if (type === 'triangle') object = new Triangle({...common,width,height});
    else if (type === 'rect') object = new Rect({...common,width,height});
    else {
      const style = {...common,fill:definition.filled?'#F26B3A':'transparent',stroke:definition.filled?null:'#292620',strokeWidth:definition.strokeWidth,strokeDashArray:definition.dash?[...definition.dash]:null,strokeLineCap:definition.lineCap??'round' as const,strokeLineJoin:'round' as const,scaleX:width/100,scaleY:height/100};
      if (definition.kind === 'polygon') object = new Polygon(definition.points,style);
      else if (definition.kind === 'line') object = new Line([0,0,width,0],{...style,scaleX:1,scaleY:1,strokeDashArray:definition.dash?[...definition.dash]:null});
      else object = new Path(definition.path,style);
    }
    const center=placement?.center??{x:this.width/2,y:this.height/2};
    object.setPositionByOrigin(new Point(center.x,center.y),'center','center');
    const named=label(object,definition.name);named.visroShapeType=type;
    this.addAndSelect(convertCatalogLineObject(named,type) as StudioObject);
  }

  replaceShape(type:ShapeType):void|Promise<void> {
    if(this.destroyed||this.restoring)return;
    const previous=this.canvas.getActiveObject() as StudioObject|undefined;
    if(previous&&isShapeEffectObject(previous)){
      const origin=this.document,pageId=this.document.activePageId,id=previous.id;
      return this.runQueued(async()=>{
        const current=id?this.findObject(id):undefined;this.assertOriginPage(pageId);
        if(!current||origin!==this.document||!this.documentMutationAllowed()||this.objectLocked(current)||!isShapeEffectObject(current)||getShapeEffectBase(current) instanceof Group)throw new Error('Select an unlocked individual vector shape first.');
        const revision=this.revision,state=getShapeEffect(current),plain=await createShapeEffectObject(current,{type:'none'},{signal:this.lifecycle.signal});
        let replacement=this.makeReplacementShape(plain as StudioObject,type);plain.dispose();
        if(!isEditableLine(replacement)){
          const {preset,...parameters}=state;const wrapped=await createShapeEffectObject(replacement,parameters,{signal:this.lifecycle.signal}) as StudioObject;wrapped.visroShapeEffect!.preset=preset;replacement.dispose();replacement=wrapped;
        }
        try{this.assertOriginPage(pageId);if(origin!==this.document||!this.documentMutationAllowed()||revision!==this.revision||this.findObject(id!)!==current||this.objectLocked(current))throw new Error('The shape changed while its replacement was preparing.');}catch(error){replacement.dispose();throw error;}
        this.replaceShapeEffectTarget(current,replacement);installLineControls(replacement);this.canvas.setActiveObject(replacement);this.commit();
      });
    }
    if(!previous||previous instanceof FabricImage||isText(previous)||previous instanceof Group&&!isEditableLine(previous)||this.objectLocked(previous))throw new Error('Select an unlocked vector shape first.');
    const object=this.makeReplacementShape(previous,type),parent=previous.group instanceof Group&&!(previous.group instanceof ActiveSelection)?previous.group:undefined,index=(parent?parent.getObjects():this.canvas.getObjects()).indexOf(previous);
    this.canvas.discardActiveObject();
    if(parent){parent.remove(previous);parent.insertAt(index,object);parent.set('dirty',true);}
    else{this.canvas.remove(previous);this.canvas.insertAt(index,object);}
    object.setCoords();installLineControls(object);this.canvas.setActiveObject(object);this.commit();
  }
  private makeReplacementShape(previous:StudioObject,type:ShapeType):StudioObject {
    const definition=getShapeGeometry(type),common={originX:previous.originX,originY:previous.originY,strokeWidth:0};
    let replacement:FabricObject;
    if(definition.kind==='polygon')replacement=new Polygon(definition.points,common);
    else if(definition.kind==='line')replacement=new Line(definition.points,common);
    else replacement=new Path(definition.path,common);
    let object=replacement as StudioObject;const oldFilled=Boolean(previous.fill&&previous.fill!=='none'&&previous.fill!=='transparent');
    object.set({...INTERACTION_STYLE,originX:previous.originX,originY:previous.originY,opacity:previous.opacity,visible:previous.visible,shadow:previous.shadow,strokeUniform:previous.strokeUniform,strokeLineCap:definition.lineCap??previous.strokeLineCap,strokeLineJoin:previous.strokeLineJoin,strokeDashArray:definition.dash?[...definition.dash]:previous.strokeDashArray,strokeWidth:definition.filled?previous.strokeWidth:Math.max(1,previous.strokeWidth||definition.strokeWidth),fill:definition.filled?(oldFilled?previous.fill:previous.stroke||'#292620'):'transparent',stroke:definition.filled?previous.stroke:(oldFilled?previous.fill:previous.stroke)||'#292620'});
    const identity=previous as StudioObject;object.id=identity.id;object.visroName=definition.name;object.visroShapeType=type;object.visroMetadata=cloneProject(identity.visroMetadata);object.visroGradient=cloneProject(identity.visroGradient);
    if(definition.filled&&previous.fill instanceof Gradient){object.set('fill',resizedNativeGradient(previous.fill,object.width,object.height,previous.width,previous.height));const info=selectedGradient(previous.fill)!;object.visroGradient={colors:info.colors,angle:info.angle};}
    if(previous.stroke instanceof Gradient)object.set('stroke',resizedNativeGradient(previous.stroke,object.width,object.height,previous.width,previous.height));
    object=convertCatalogLineObject(object,type) as StudioObject;
    const matrix=util.multiplyTransformMatrices(previous.calcTransformMatrix(),[object.width>0?Math.max(previous.width,previous.strokeWidth||1)/object.width:1,0,0,object.height>0?Math.max(previous.height,previous.strokeWidth||1)/object.height:1,0,0]);
    util.applyTransformToObject(object,matrix);
    if(object.flipX!==previous.flipX){const center=object.getCenterPoint();object.set({flipX:!object.flipX,flipY:!object.flipY,angle:object.angle+180});object.setPositionByOrigin(center,'center','center');}
    syncLineSubtree(object);object.setCoords();return object;
  }

  addTable(options: TableOptions): void {
    if (this.destroyed || this.restoring) return;
    const rows = Math.round(bounded(options.rows, 1, 20));
    const columns = Math.round(bounded(options.columns, 1, 10));
    const width = Math.min(this.width * .82, 900);
    const cellWidth = width / columns, cellHeight = Math.min(72, this.height * .75 / rows);
    const fontSize = Math.max(12, Math.min(24, cellHeight * .34));
    const objects: FabricObject[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const header = options.header !== false && row === 0;
        objects.push(label(new Rect({ originX: 'left', originY: 'top', left: column * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight, fill: header ? '#292620' : row % 2 ? '#FAF5EC' : '#ffffff', stroke: '#d8d5ce', strokeWidth: 1 }), `Cell ${row + 1}, ${column + 1}`));
        objects.push(label(new Textbox(options.data?.[row]?.[column] ?? (header ? `Column ${column + 1}` : 'Your text'), { originX: 'left', originY: 'top', left: column * cellWidth + 12, top: row * cellHeight + (cellHeight - fontSize * 1.15) / 2, width: Math.max(12, cellWidth - 24), fontSize, fontFamily: 'Arial', fontWeight: header ? 'bold' : 'normal', fill: header ? '#ffffff' : '#292620', lineHeight: 1.05 }), `Cell text ${row + 1}, ${column + 1}`));
      }
    }
    this.addCenteredGroup(objects, `${rows} × ${columns} table`);
  }

  addChart(options: ChartOptions): void {
    if (this.destroyed || this.restoring) return;
    const values = options.values.slice(0, 20).map((value) => Number.isFinite(value) ? value : 0);
    if (!values.length) throw new Error('Add at least one chart value.');
    const colors = options.colors?.length ? options.colors : ['#F26B3A', '#F6BED0', '#D38874', '#BBCDB7', '#334A88', '#ECC374'];
    const labels = values.map((_, index) => options.labels[index] || `Item ${index + 1}`);
    const objects: FabricObject[] = [];
    const width = Math.min(760, this.width * .78), height = Math.min(440, this.height * .5);
    if (options.type === 'pie' || options.type === 'donut') {
      if (values.some((value) => value < 0) || values.every((value) => value === 0)) throw new Error('Pie and donut charts need positive values.');
      const total = values.reduce((sum, value) => sum + value, 0);
      const radius = Math.min(height * .45, width * .3), cx = radius, cy = radius;
      let angle = -Math.PI / 2;
      values.forEach((value, index) => {
        const sweep = value / total * Math.PI * 2;
        const color = colors[index % colors.length];
        if (sweep >= Math.PI * 2 - .00001) {
          objects.push(label(new Circle({ originX: 'left', originY: 'top', left: 0, top: 0, radius: options.type === 'donut' ? radius * .75 : radius, fill: options.type === 'donut' ? 'transparent' : color, stroke: options.type === 'donut' ? color : undefined, strokeWidth: options.type === 'donut' ? radius * .5 : 0 }), labels[index]));
        } else if (sweep > 0) {
          const end = angle + sweep, large = sweep > Math.PI ? 1 : 0;
          const startX = cx + Math.cos(angle) * radius, startY = cy + Math.sin(angle) * radius;
          const endX = cx + Math.cos(end) * radius, endY = cy + Math.sin(end) * radius;
          let data = `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${large} 1 ${endX} ${endY} Z`;
          if (options.type === 'donut') {
            const inner = radius * .55;
            data = `M ${startX} ${startY} A ${radius} ${radius} 0 ${large} 1 ${endX} ${endY} L ${cx + Math.cos(end) * inner} ${cy + Math.sin(end) * inner} A ${inner} ${inner} 0 ${large} 0 ${cx + Math.cos(angle) * inner} ${cy + Math.sin(angle) * inner} Z`;
          }
          const path = new Path(data, { fill: color, strokeWidth: 0 });
          // Path coordinates retain their own bounds when grouped together.
          path.set({ originX: 'left', originY: 'top', left: path.pathOffset.x - path.width / 2, top: path.pathOffset.y - path.height / 2 });
          objects.push(label(path, `${labels[index]}: ${value}`));
        }
        angle += sweep;
        objects.push(label(new Circle({ originX: 'left', originY: 'top', left: radius * 2 + 34, top: index * 35 + 10, radius: 7, fill: color }), `Legend ${index + 1}`));
        objects.push(label(new Textbox(`${labels[index]}  ${value}`, { originX: 'left', originY: 'top', left: radius * 2 + 60, top: index * 35 + 7, width: Math.max(100, width - radius * 2 - 70), fontFamily: 'Arial', fontSize: 20, fill: '#292620' }), labels[index]));
      });
    } else {
      const min = Math.min(0, ...values), max = Math.max(1, ...values);
      const span = Math.max(1, max - min), plotHeight = height - 64;
      const baseline = plotHeight * max / span;
      for (let tick = 0; tick <= 4; tick += 1) {
        const y = plotHeight * tick / 4;
        objects.push(label(new Line([44, y, width, y], { stroke: '#e2ded5', strokeWidth: 1 }), 'Chart grid'));
        objects.push(label(new Textbox(String(Math.round((max - span * tick / 4) * 100) / 100), { originX: 'left', originY: 'top', left: 0, top: y - 9, width: 38, fontSize: 14, fontFamily: 'Arial', textAlign: 'right', fill: '#79756d' }), 'Value label'));
      }
      const step = (width - 55) / Math.max(values.length, 1), barWidth = step * .58;
      const points = values.map((value, index) => ({ x: 55 + step * (index + .5), y: plotHeight * (max - value) / span }));
      values.forEach((value, index) => {
        const color = colors[index % colors.length], point = points[index];
        if (options.type === 'bar') objects.push(label(new Rect({ originX: 'left', originY: 'top', left: point.x - barWidth / 2, top: Math.min(baseline, point.y), width: barWidth, height: Math.max(1, Math.abs(baseline - point.y)), rx: 3, ry: 3, fill: color, strokeWidth: 0 }), `${labels[index]}: ${value}`));
        else {
          if (index) objects.push(label(new Line([points[index - 1].x, points[index - 1].y, point.x, point.y], { stroke: colors[0], strokeWidth: 4 }), 'Chart line'));
          objects.push(label(new Circle({ originX: 'center', originY: 'center', left: point.x, top: point.y, radius: 6, fill: colors[0], stroke: '#ffffff', strokeWidth: 2 }), `${labels[index]}: ${value}`));
        }
        objects.push(label(new Textbox(labels[index], { originX: 'left', originY: 'top', left: point.x - step / 2, top: plotHeight + 18, width: step, fontSize: Math.min(18, step / 4), fontFamily: 'Arial', textAlign: 'center', fill: '#292620' }), labels[index]));
      });
    }
    this.addCenteredGroup(objects, `${options.type[0].toUpperCase() + options.type.slice(1)} chart`);
  }

  /** Apply a catalog mask to the selected image without replacing its pixels. */
  setSelectedImageFrame(id:FrameShape):void {
    const image=this.canvas.getActiveObject() as StudioObject|undefined;
    if(!isStudioImage(image)||this.objectLocked(image))throw new Error('Select an unlocked image to add a frame.');
    const definition=getFrameDefinition(id);if(!definition)throw new Error('Choose a frame from Elements.');
    image.set('clipPath',this.createFrameMask(definition,image.width,image.height));
    image.visroFrame=id;image.set('dirty',true);this.commit();
  }
  addFrame(shape:FrameShape):void {
    if(!['circle','rounded','arch','diamond'].includes(shape)){this.setSelectedImageFrame(shape);return;}
    const image=this.canvas.getActiveObject();if(!(image instanceof FabricImage)||this.objectLocked(image))throw new Error('Select an unlocked image to add a frame.');
    const width=image.width,height=image.height;let mask:FabricObject;
    if(shape==='circle'){const radius=Math.min(image.getScaledWidth(),image.getScaledHeight())/2;mask=new Ellipse({originX:'center',originY:'center',rx:radius/Math.abs(image.scaleX),ry:radius/Math.abs(image.scaleY)});}
    else if(shape==='diamond')mask=new Polygon([{x:0,y:-height/2},{x:width/2,y:0},{x:0,y:height/2},{x:-width/2,y:0}],{originX:'center',originY:'center'});
    else if(shape==='arch'){const radius=Math.min(width/2,height*.5);mask=new Path(`M ${-width/2} ${height/2} L ${-width/2} ${-height/2+radius} Q ${-width/2} ${-height/2} 0 ${-height/2} Q ${width/2} ${-height/2} ${width/2} ${-height/2+radius} L ${width/2} ${height/2} Z`,{originX:'center',originY:'center'});}
    else mask=new Rect({originX:'center',originY:'center',width,height,rx:Math.min(width,height)*.15,ry:Math.min(width,height)*.15});
    mask.set({left:0,top:0,fill:'#000000',strokeWidth:0});image.set('clipPath',mask);(image as StudioObject).visroFrame=shape;this.commit();
  }

  setCornerRadius(radius:number):void {
    const selected=this.canvas.getActiveObject() as StudioObject|undefined,object=selected?getShapeEffectBase(selected) as StudioObject:undefined;
    if(this.destroyed||this.restoring||!selected||!object||this.objectLocked(selected)||!(object instanceof Rect||object instanceof FabricImage))return;
    if(!Number.isFinite(radius)||radius<0)throw new Error('Use a nonnegative corner radius.');
    const scaling=isShapeEffectObject(selected)?object.getObjectScaling():new Point(object.scaleX,object.scaleY),value=Math.min(radius,Math.min(object.width*Math.abs(scaling.x),object.height*Math.abs(scaling.y))/2),rx=value/Math.max(.000001,Math.abs(scaling.x)),ry=value/Math.max(.000001,Math.abs(scaling.y));
    if(object instanceof Rect)object.set({rx,ry});
    else if(value===0){if(object.clipPath instanceof Rect){object.set('clipPath',undefined);delete (object as StudioObject).visroFrame;}else return;}
    else{object.set('clipPath',new Rect({originX:'center',originY:'center',left:0,top:0,width:object.width,height:object.height,rx,ry,fill:'#000000',strokeWidth:0}));(object as StudioObject).visroFrame='rounded';}
    if(isShapeEffectObject(selected)){selected.getObjects().forEach(child=>{if(child instanceof Rect)child.set({rx,ry});});refreshShapeEffect(selected);}
    object.set('dirty',true);this.commit();
  }

  /** Hit-test a visible frame using scene/document coordinates, including nested grid slots. */
  frameAt(point:{x:number;y:number}):string|null {
    if(this.destroyed||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
    const viewport=new Point(point.x,point.y).transform(this.canvas.viewportTransform);
    const visit=(objects:FabricObject[]):string|null=>{
      for(const raw of [...objects].reverse()){
        const object=raw as StudioObject;if(!object.visible||this.objectLocked(object))continue;
        if(object instanceof Group){const child=visit(object.getObjects());if(child)return child;}
        if(isStudioImage(object)&&object.visroFrame&&object.id&&object.containsPoint(new Point(point.x,point.y))&&!this.canvas.isTargetTransparent(object,viewport.x,viewport.y))return object.id;
      }
      return null;
    };
    return visit(this.canvas.getObjects());
  }

  removeFrame(): void {
    const image = this.canvas.getActiveObject() as StudioObject | undefined;
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked) return;
    image.set('clipPath', undefined);
    delete (image as StudioObject).visroFrame;
    delete (image as StudioObject).visroEmptyFrame;
    this.commit();
  }

  addSVG(svg: string): Promise<void> {
    return this.runQueued(async () => {
      if (svg.length > 2_000_000 || !/<svg[\s>]/i.test(svg)) throw new Error('Choose an SVG smaller than 2 MB.');
      const parsed = await loadSVGFromString(svg, undefined, { signal: this.lifecycle.signal, crossOrigin: 'anonymous' });
      this.assertAlive();
      const objects = parsed.objects.filter((object): object is FabricObject => object !== null);
      if (!objects.length) throw new Error('This SVG has no supported editable shapes.');
      objects.forEach((object, index) => label(object, `Vector ${index + 1}`));
      const group = label(util.groupSVGElements(objects, parsed.options), 'SVG graphic');
      const scale = Math.min(this.width * .65 / group.width, this.height * .65 / group.height, 1);
      group.set({ scaleX: scale, scaleY: scale });
      group.setPositionByOrigin(new Point(this.width / 2, this.height / 2), 'center', 'center');
      this.addAndSelect(group);
    });
  }

  /** Bundled graphics remain paths; a single insertion is a single history step. */
  addGraphic(id: string, placement?: {center?:{x:number;y:number};pageId?:string}): void {
    if (this.destroyed || this.restoring) return;
    if (placement?.pageId && placement.pageId !== this.document.activePageId) throw new Error('The page changed. Choose the graphic again.');
    const graphic = getGraphic(id);
    if (!graphic) throw new Error('Choose a graphic from the Elements library.');
    const objects = graphic.parts.map((part, index) => label(new Path(part.path, {
      fill: part.fill === 'none' ? null : part.fill, stroke: part.stroke === 'none' ? null : part.stroke, strokeWidth: part.strokeWidth ?? 0,
      strokeLineCap: part.strokeLineCap ?? 'round', strokeLineJoin: part.strokeLineJoin ?? 'round',
      opacity: part.opacity ?? 1,
    }), part.name || `${graphic.name} ${index + 1}`));
    const group = label(new Group(objects), graphic.name);
    group.visroGraphicId = graphic.id;
    const scale = Math.min(this.width * .3 / graphic.width, this.height * .3 / graphic.height, 2);
    group.set({scaleX:scale,scaleY:scale});
    const center = placement?.center ?? {x:this.width/2,y:this.height/2};
    group.setPositionByOrigin(new Point(center.x,center.y),'center','center');
    this.addAndSelect(group);
  }

  private graphicColors(object: StudioObject): string[] {
    const colors = new Set<string>();
    const visit = (part: FabricObject): void => {
      if (part instanceof Group) part.getObjects().forEach(visit);
      else for (const key of ['fill','stroke'] as const) {
        const value = part[key];
        if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) colors.add(value.toLowerCase());
      }
    };
    visit(object);
    return [...colors];
  }

  setGraphicColor(from: string, to: string): void {
    const object = this.canvas.getActiveObject() as StudioObject | undefined;
    const base=object?getShapeEffectBase(object):undefined;
    if(!object||!(base instanceof Group)||isEditableLine(object)||!supportsShapeEffect(base)||this.objectLocked(object)||!/^#[0-9a-f]{6}$/i.test(from)||!/^#[0-9a-f]{6}$/i.test(to)||this.destroyed||this.restoring)return;
    const visit = (part: FabricObject): void => {
      if (part instanceof Group) { part.getObjects().forEach(visit); part.set('dirty', true); }
      else for (const key of ['fill','stroke'] as const) {
        const value = part[key];
        if (typeof value === 'string' && value.toLowerCase() === from.toLowerCase()) part.set(key, to);
      }
    };
    visit(base);refreshShapeEffect(object);
    this.commit(`graphic-color:${object.id}`);
  }

  setGradient(colors: string[], angle = 0): void {
    if (this.destroyed || this.restoring) return;
    if (colors.length < 2) throw new Error('A gradient needs at least two colors.');
    const palette = colors.slice(0, 8), normalizedAngle = Number.isFinite(angle) ? angle : 0;
    const objects = this.canvas.getActiveObjects() as StudioObject[];
    if (objects.length) {
      for (const object of objects) {
        if (object.visroLocked || object instanceof FabricImage) continue;
        const base=getShapeEffectBase(object) as StudioObject;if(base instanceof Group&&(!supportsShapeEffect(base)||isEditableLine(object)))continue;
        const apply=(part:FabricObject)=>{if(part instanceof Group){part.getObjects().forEach(apply);part.set('dirty',true);}const target=part as StudioObject,fill=this.makeGradient(palette,normalizedAngle,part.width,part.height);if(!(part instanceof Group)&&(!part.fill||['none','transparent'].includes(String(part.fill)))&&part.stroke)part.set('stroke',fill);else part.set('fill',fill);target.visroGradient={colors:[...palette],angle:normalizedAngle};};apply(base);refreshShapeEffect(object);
      }
    } else {
      const page = this.document.pages.find((candidate) => candidate.id === this.document.activePageId);
      if (page) page.backgroundGradient = { colors: [...palette], angle: normalizedAngle };
      this.canvas.backgroundColor = this.makeGradient(palette, normalizedAngle, this.width, this.height);
    }
    this.commit();
  }

  setTextEffect(effect: TextEffect, color = '#292620', intensity = 1): void {
    if (this.destroyed || this.restoring) return;
    const strength = bounded(intensity, .1, 5);
    for (const object of this.canvas.getActiveObjects() as StudioObject[]) {
      if (!isText(object) || (object as StudioObject).visroLocked) continue;
      const studio = object as StudioObject;
      if (studio.visroTextEffect === 'hollow' && studio.visroTextBaseFill) object.set('fill', studio.visroTextBaseFill);
      if (typeof object.fill === 'string' && object.fill !== 'transparent') studio.visroTextBaseFill = object.fill;
      studio.visroTextEffect = effect;
      object.set({ shadow: null, stroke: null, strokeWidth: 0, paintFirst: 'fill' });
      if (effect === 'shadow' || effect === 'lift') object.set('shadow', new Shadow({ color, blur: effect === 'lift' ? 16 * strength : 8 * strength, offsetX: effect === 'lift' ? 0 : 5 * strength, offsetY: 5 * strength }));
      else if (effect === 'neon') object.set('shadow', new Shadow({ color, blur: 22 * strength, offsetX: 0, offsetY: 0 }));
      else if (effect === 'outline') object.set({ stroke: color, strokeWidth: 2 * strength, paintFirst: 'stroke' });
      else if (effect === 'hollow') object.set({ stroke: color, strokeWidth: 2 * strength, fill: 'transparent' });
      else if (effect === 'splice') object.set({ stroke: color, strokeWidth: 1.5 * strength, paintFirst: 'stroke', shadow: new Shadow({ color, blur: 0, offsetX: 5 * strength, offsetY: 5 * strength }) });
    }
    this.commit();
  }

  setPageMetadata(metadata: PageMetadata): void {
    const page = this.document.pages.find((candidate) => candidate.id === this.document.activePageId);
    if (!page || this.destroyed) return;
    page.metadata = { ...page.metadata, ...metadata };
    if (metadata.duration !== undefined) page.metadata.duration = bounded(metadata.duration, .1, 3600);
    if (metadata.notes !== undefined) page.metadata.notes = metadata.notes.slice(0, 20000);
    this.commit();
  }

  setProjectMetadata(metadata: { kind?: VisroProject['kind']; content?: unknown }): void {
    if (this.destroyed) return;
    if (metadata.kind !== undefined) this.document.kind = metadata.kind;
    if (Object.hasOwn(metadata, 'content')) this.document.content = cloneProject(metadata.content);
    this.commit('project-content');
  }

  private async addImageInternal(url:string,name='Image',placement?:ImagePlacement,target?:StudioObject):Promise<void> {
    const pageId=placement?.pageId??this.document.activePageId;
    this.assertOriginPage(pageId);placement?.signal?.throwIfAborted();
    if(placement?.targetFrameId){
      if(!isStudioImage(target)||!target.visroFrame)throw new Error('This frame is no longer available.');
      await this.replaceImageInternal(target,url,pageId,'fill',placement.source,placement.signal,name);return;
    }
    const signal=placement?.signal?AbortSignal.any([this.lifecycle.signal,placement.signal]):this.lifecycle.signal;
    const image=await FabricImage.fromURL(url,{crossOrigin:'anonymous',signal});
    this.assertOriginPage(pageId);placement?.signal?.throwIfAborted();
    const scale=Math.min(this.width*.72/image.width,this.height*.72/image.height,1);
    image.set({originX:'left',originY:'top',scaleX:scale,scaleY:scale,left:(this.width-image.width*scale)/2,top:(this.height-image.height*scale)/2});
    if(placement?.center)image.set({left:placement.center.x-image.width*scale/2,top:placement.center.y-image.height*scale/2});
    const object=label(image,name);if(placement?.source)object.visroMetadata=sanitizeElementMetadata({source:placement.source,altText:name});
    this.addAndSelect(object);
  }

  private assertOriginPage(pageId:string):void {
    this.assertAlive();if(pageId!==this.document.activePageId||!this.document.pages.some(page=>page.id===pageId))throw new Error('The page changed while this image was loading. Choose it again.');
  }
  private findObject(id:string):StudioObject|undefined {
    const visit=(objects:FabricObject[]):StudioObject|undefined=>{for(const object of objects){if((object as StudioObject).id===id)return object as StudioObject;if(object instanceof Group){const nested=visit(object.getObjects());if(nested)return nested;}}return undefined;};
    return visit(this.canvas.getObjects());
  }
  private objectLocked(object:FabricObject):boolean {
    let current:FabricObject|undefined=object;while(current){if((current as StudioObject).visroLocked)return true;current=current.group;}return false;
  }
  private createFrameMask(definition:FrameDefinition,width:number,height:number):Path {
    const mask=new Path(definition.path,{originX:'center',originY:'center',fill:'#000000',strokeWidth:0,fillRule:definition.fillRule});
    mask.set({left:(mask.pathOffset.x-50)*width/100,top:(mask.pathOffset.y-50)*height/100,scaleX:width/100,scaleY:height/100});
    return mask;
  }
  private async insertFrameInternal(id:string,placement:ElementPlacement):Promise<void> {
    const item=getFrameLibraryItem(id);if(!item)throw new Error('Choose a frame or grid from Elements.');
    const pageId=placement.pageId??this.document.activePageId;this.assertOriginPage(pageId);placement.signal?.throwIfAborted();
    const signal=placement.signal?AbortSignal.any([this.lifecycle.signal,placement.signal]):this.lifecycle.signal;
    const width=item.kind==='grid'?Math.min(this.width*.8,this.height*.8*item.aspectRatio):Math.min(this.width*.72,Math.min(this.width,this.height)*.46*Math.sqrt(item.aspectRatio));
    const height=width/item.aspectRatio,center=placement.center??{x:this.width/2,y:this.height/2};
    const create=async(frameId:string,w:number,h:number,x:number,y:number):Promise<StudioObject>=>{
      const image=await FabricImage.fromURL(framePlaceholderData(),{signal});
      const ratio=w/h,cropWidth=Math.min(image.width,image.height*ratio),cropHeight=cropWidth/ratio;
      image.set({originX:'center',originY:'center',left:x,top:y,width:cropWidth,height:cropHeight,cropX:(1000-cropWidth)/2,cropY:(1000-cropHeight)/2,scaleX:w/cropWidth,scaleY:h/cropHeight,strokeWidth:0});
      const definition=getFrameDefinition(frameId)!;image.set('clipPath',this.createFrameMask(definition,cropWidth,cropHeight));
      const object=label(image,`${definition.name} frame`);object.visroFrame=frameId;object.visroEmptyFrame=true;return object;
    };
    let object:StudioObject;
    if(item.kind==='frame')object=await create(item.id,width,height,center.x,center.y);
    else{
      const slots=resolveGridSlots(item,width,height,Math.min(12,Math.min(width,height)*.025));
      const images=await Promise.all(slots.map(slot=>create('square',slot.width,slot.height,slot.x+slot.width/2,slot.y+slot.height/2)));
      object=label(new Group(images,{originX:'center',originY:'center',left:center.x,top:center.y,subTargetCheck:true,interactive:true}),item.name);object.visroGridId=item.id;
    }
    try{this.assertOriginPage(pageId);placement.signal?.throwIfAborted();}catch(error){object.dispose();throw error;}
    this.addAndSelect(object);
  }

  /** Render an isolated page thumbnail without disturbing the live canvas or history. */
  async previewPage(id:string,scale=.5,signal?:AbortSignal):Promise<string> {
    this.assertAlive();signal?.throwIfAborted();if(this.restoring)throw new Error('The page is changing. Retry its preview.');this.syncPage();
    const page=this.document.pages.find(page=>page.id===id);if(!page)throw new Error('This page is no longer available.');
    const content=cloneProject(page.canvas);delete content.clipPath;
    const width=this.width,height=this.height,factor=Math.min(bounded(scale,.01,2),Math.sqrt(1_000_000/(width*height))),previewWidth=Math.max(1,Math.floor(width*factor)),previewHeight=Math.max(1,Math.floor(height*factor));
    const background=page.background,gradient=cloneProject(page.backgroundGradient),surface=new StaticCanvas(util.createCanvasElement(),{width:previewWidth,height:previewHeight,enableRetinaScaling:false,renderOnAddRemove:false});
    try{
      await surface.loadFromJSON(content,undefined,{signal:signal?AbortSignal.any([this.lifecycle.signal,signal]):this.lifecycle.signal});
      this.assertAlive();signal?.throwIfAborted();
      surface.backgroundColor=gradient?this.makeGradient(gradient.colors,gradient.angle,width,height):background;
      surface.setViewportTransform([previewWidth/width,0,0,previewHeight/height,0,0]);surface.renderAll();
      return surface.toDataURL({format:'png',multiplier:1});
    }finally{await surface.dispose();}
  }

  getSelectedImageDataURL(): string | null {
    const object = this.canvas.getActiveObject();
    if (!(object instanceof FabricImage)) return null;
    const source = object._originalElement as HTMLImageElement;
    const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
    const scale = Math.min(1, 4096 / Math.max(width, height), Math.sqrt(16_000_000 / Math.max(1, width * height)));
    if (scale === 1 && object.getSrc().startsWith('data:image/')) return object.getSrc();
    const output = util.createCanvasElement();
    output.width = Math.max(1, Math.round(width * scale)); output.height = Math.max(1, Math.round(height * scale));
    output.getContext('2d')!.drawImage(source, 0, 0, output.width, output.height);
    return output.toDataURL('image/png');
  }

  async getImageMaskSources(): Promise<{ original: string; current: string }> {
    const image = this.canvas.getActiveObject() as StudioObject | undefined;
    if (!(image instanceof FabricImage)) throw new Error('Select an image to refine its mask.');
    return { original: (image as StudioObject).visroOriginalSrc ?? image.getSrc(), current: image.getSrc() };
  }

  getImageCropSource(): { src: string; width: number; height: number; rect: ImageCropRect } | null {
    const image = this.canvas.getActiveObject();
    if (!(image instanceof FabricImage)) return null;
    const source = image.getOriginalSize();
    return { src: image.getSrc(), width: source.width, height: source.height, rect: { left: image.cropX, top: image.cropY, width: image.width, height: image.height } };
  }

  getSelectedImageDataUrl(): string | null {
    return this.getSelectedImageDataURL();
  }

  async selectedImageDataURL(): Promise<string> {
    const data = this.getSelectedImageDataURL();
    if (!data) throw new Error("Select an image first.");
    return data;
  }

  private async replaceImageInternal(previous:StudioObject|undefined,url:string,pageId:string,mode:'mask'|'replace'|'fill',source?:ElementMetadata['source'],signal?:AbortSignal,name?:string):Promise<void> {
    this.assertOriginPage(pageId);signal?.throwIfAborted();
    if(!isStudioImage(previous)||!previous.id||this.findObject(previous.id)!==previous||this.objectLocked(previous))throw new Error('The image is no longer available or is locked.');
    const decoded=await FabricImage.fromURL(url,{crossOrigin:'anonymous',signal:signal?AbortSignal.any([this.lifecycle.signal,signal]):this.lifecycle.signal});
    this.assertOriginPage(pageId);signal?.throwIfAborted();
    if(this.findObject(previous.id)!==previous||this.objectLocked(previous))throw new Error('The image was removed or locked while its replacement was loading.');
    const oldWidth=previous.width,oldHeight=previous.height,original=previous.getOriginalSize(),oldSource=previous.getSrc();
    let width:number,height:number,cropX:number,cropY:number;
    if(mode==='mask'){
      const rx=decoded.width/original.width,ry=decoded.height/original.height;
      width=oldWidth*rx;height=oldHeight*ry;cropX=previous.cropX*rx;cropY=previous.cropY*ry;
    }else{
      const ratio=oldWidth/oldHeight;
      width=Math.min(decoded.width,decoded.height*ratio);height=width/ratio;
      cropX=(decoded.width-width)/2;cropY=(decoded.height-height)/2;
    }
    const rx=width/oldWidth,ry=height/oldHeight,oldElement=previous._originalElement;
    // Work on the existing image, so nested-group transforms, IDs and z-order stay exact.
    try{previous.setElement(decoded.getElement(),{width,height});}catch(error){previous.setElement(oldElement,{width:oldWidth,height:oldHeight});throw error;}
    previous.set({cropX,cropY,width,height,scaleX:previous.scaleX/rx,scaleY:previous.scaleY/ry});
    if(previous.clipPath&&!previous.clipPath.absolutePositioned){
      const matrix=util.multiplyTransformMatrices([rx,0,0,ry,0,0],previous.clipPath.calcOwnMatrix());
      util.applyTransformToObject(previous.clipPath,matrix);previous.clipPath.setCoords();
    }
    previous.visroEmptyFrame=false;
    if(mode==='mask')previous.visroOriginalSrc??=oldSource;
    else{delete previous.visroOriginalSrc;previous.visroMetadata=sanitizeElementMetadata({...previous.visroMetadata,source,altText:name??previous.visroMetadata?.altText});}
    if(name)previous.visroName=name;
    previous.setCoords();let parent=previous.group;while(parent){parent.set('dirty',true);parent=parent.group;}
    this.canvas.setActiveObject(previous);this.commit();
  }

  formatSelectedText(action:TextFormatAction):boolean {
    const object=this.canvas.getActiveObject();if(this.destroyed||this.restoring||!object||!isText(object)||this.objectLocked(object))return false;
    if(typeof (object as unknown as IText).insertChars!=='function'){const result=formatTextSelection(object.text,{start:0,end:object.text.length},action);if(result.text===object.text)return false;this.updateSelected({text:result.text});return true;}
    const changed=formatTextObject(object as unknown as IText,action);if(changed)this.commit();return changed;
  }
  updateSelectedTextStyle(changes:SelectionUpdate):boolean {
    const object=this.canvas.getActiveObject();if(this.destroyed||this.restoring||!object||!isText(object)||this.objectLocked(object))return false;
    if(typeof (object as unknown as IText).insertChars!=='function'){this.updateSelected(changes);return true;}
    const changed=applyTextObjectStyle(object as unknown as IText,changes);if(changed)this.commit();return changed;
  }
  continueSelectedTextList():boolean {
    const object=this.canvas.getActiveObject();if(this.destroyed||this.restoring||!object||!isText(object)||this.objectLocked(object))return false;
    if(typeof (object as unknown as IText).insertChars!=='function')return false;
    const changed=continueTextObjectList(object as unknown as IText);if(changed)this.commit();return changed;
  }
  indentSelectedTextList(direction:1|-1):boolean {
    const object=this.canvas.getActiveObject();if(this.destroyed||this.restoring||!object||!isText(object)||this.objectLocked(object))return false;
    if(typeof (object as unknown as IText).insertChars!=='function')return false;
    const handled=indentTextObjectList(object as unknown as IText,direction);if(handled)this.commit();return handled;
  }

  updateSelected(update: SelectionUpdate): void {
    if (this.destroyed || this.restoring) return;
    const objects = this.canvas.getActiveObjects() as StudioObject[];
    if (!objects.length) return;
    const selection = this.canvas.getActiveObject();
    const multiple = selection instanceof ActiveSelection;
    const resizedScale = (object: FabricObject, axis:'x'|'y', target:number): number => {
      const current = axis === 'x' ? object.getScaledWidth() : object.getScaledHeight();
      const stroke = object.strokeUniform ? object.strokeWidth : 0;
      const scale = axis === 'x' ? object.scaleX : object.scaleY;
      if (current-stroke < .000001) return scale;
      return scale * Math.max(1,target-stroke) / (current-stroke);
    };
    if (multiple && !objects.some((object) => object.visroLocked)) {
      const transform: Record<string, unknown> = {};
      for (const key of ["left", "top", "angle"] as const) {
        if (update[key] !== undefined) transform[key] = update[key];
      }
      if (update.width !== undefined)
        transform.scaleX =
          resizedScale(selection,'x',update.width);
      if (update.height !== undefined)
        transform.scaleY =
          resizedScale(selection,'y',update.height);
      selection.set(transform);
      selection.setCoords();
    }
    for (const object of objects) {
      if (object.visroLocked) continue;
      const lineAppearance=isEditableLine(object)&&['fill','stroke','strokeWidth','strokeDashArray','strokeLineCap','width','height'].some(key=>Object.hasOwn(update,key)),lineCenter=object instanceof Line&&lineAppearance&&!['left','top','width','height','angle'].some(key=>Object.hasOwn(update,key))?object.getRelativeCenterPoint():undefined;
      const values: Record<string, unknown> = {};
      for (const key of ["fill", "stroke", "strokeWidth", "opacity"] as const) {
        if (update[key] !== undefined) values[key] = update[key];
      }
      if (!multiple) {
        for (const key of ["left", "top", "angle"] as const) {
          if (update[key] !== undefined) values[key] = update[key];
        }
      }
      if(update.strokeDashArray!==undefined){
        if(update.strokeDashArray!==null&&(!Array.isArray(update.strokeDashArray)||update.strokeDashArray.length>8||update.strokeDashArray.some(value=>!Number.isFinite(value)||value<0||value>1000)))throw new Error('Choose up to eight nonnegative finite dash lengths.');
        values.strokeDashArray=update.strokeDashArray?.length?[...update.strokeDashArray]:null;
      }
      if(update.strokeLineCap!==undefined){if(!['butt','round','square'].includes(update.strokeLineCap))throw new Error('Choose a supported line cap.');values.strokeLineCap=update.strokeLineCap;}
      if (update.opacity !== undefined)
        values.opacity = bounded(update.opacity, 0, 1);
      if (update.name !== undefined) object.visroName = update.name;
      if (update.fill !== undefined) delete object.visroGradient;
      if(isEditableLine(object)&&update.fill!==undefined){if(update.stroke===undefined)values.stroke=update.fill;values.fill=null;}
      if (isText(object)) {
        for (const key of [
          "text",
          "fontSize",
          "fontFamily",
          "fontWeight",
          "fontStyle",
          "lineHeight",
          'underline',
          'linethrough',
        ] as const) {
          if (update[key] !== undefined) values[key] = update[key];
        }
        if (update.align !== undefined) values.textAlign = update.align;
        if (update.letterSpacing !== undefined)
          values.charSpacing = update.letterSpacing;
        if (update.charSpacing !== undefined) values.charSpacing = update.charSpacing;
        if (update.width !== undefined && !multiple)
          values.width = Math.max(1, (update.width - (object.strokeUniform ? object.strokeWidth : 0)) / object.scaleX - (object.strokeUniform ? 0 : object.strokeWidth));
      } else if (update.width !== undefined && !multiple)
        values.scaleX = resizedScale(object,'x',update.width);
      if (update.height !== undefined && !multiple)
        values.scaleY = resizedScale(object,'y',update.height);
      if(isShapeEffectObject(object)){
        const appearance=Object.fromEntries(Object.entries(values).filter(([key])=>['fill','stroke','strokeWidth','strokeDashArray','strokeLineCap'].includes(key)));
        if(update.fill!==undefined)delete (getShapeEffectBase(object) as StudioObject).visroGradient;
        updateShapeEffectBase(object,appearance);for(const key of Object.keys(appearance))delete values[key];
      }else if(object instanceof Group&&!isEditableLine(object)&&supportsShapeEffect(object)){
        const appearance=Object.fromEntries(Object.entries(values).filter(([key])=>['fill','stroke','strokeWidth','strokeDashArray','strokeLineCap'].includes(key)));updateVectorBasePaint(object,appearance);for(const key of Object.keys(appearance))delete values[key];
      }
      object.set(values);
      if(lineCenter)object.setPositionByOrigin(lineCenter,'center','center');
      if(lineAppearance)this.syncResizedLine(object,!multiple?update.width:undefined,!multiple?update.height:undefined);
      else if(!multiple&&object instanceof Group&&(update.width!==undefined||update.height!==undefined))this.syncResizedLine(object,update.width,update.height);
      object.setCoords();
    }
    if(multiple&&(update.width!==undefined||update.height!==undefined))this.syncResizedLine(selection!,update.width,update.height);
    this.commit(`selection:${objects.map((object) => object.id).join(',')}:${Object.keys(update).sort().join(',')}`);
  }

  private syncResizedLine(object:FabricObject,width?:number,height?:number):void {
    if(!syncLineSubtree(object)||!(object instanceof Group))return;
    // Markers retain their painted weight when a line length changes. Their
    // fixed-size caps therefore need a small correction to the requested box.
    for(let pass=0;pass<4;pass++){
      const values:Record<string,number>={},stroke=object.strokeUniform?object.strokeWidth:0;
      for(const [target,axis,current,scale]of[[width,'scaleX',object.getScaledWidth(),object.scaleX],[height,'scaleY',object.getScaledHeight(),object.scaleY]] as const)if(target!==undefined&&Number.isFinite(target)&&Math.abs(target-current)>.005&&current-stroke>.000001)values[axis]=scale*Math.max(.001,target-stroke)/(current-stroke);
      if(!Object.keys(values).length)break;object.set(values);syncLineSubtree(object);
    }
  }

  updateLineStyle(patch:Partial<LineStyle>):void {
    if(this.destroyed||this.restoring)return;const object=this.canvas.getActiveObject() as StudioObject|undefined;
    if(!object||!isEditableLine(object)||this.objectLocked(object))return;
    const before=getLineStyle(object)!;
    if(Object.entries(patch).every(([key,value])=>before[key as keyof LineStyle]===value))return;
    this.flushPendingChanges();this.replaceLineTarget(object,updateLineObject(object,patch));this.commit();
  }

  swapSelectedLineEnds():void {
    if(this.destroyed||this.restoring)return;const object=this.canvas.getActiveObject() as StudioObject|undefined;
    if(!object||!isEditableLine(object)||this.objectLocked(object))return;const style=getLineStyle(object)!;if(style.startMarker===style.endMarker)return;
    this.flushPendingChanges();this.replaceLineTarget(object,swapLineObjectEnds(object));this.commit();
  }

  private replaceLineTarget(previous:StudioObject,result:FabricObject):void {
    if(previous===result){installLineControls(result);return;}
    const parent=previous.group instanceof Group&&!(previous.group instanceof ActiveSelection)?previous.group:undefined,index=(parent?parent.getObjects():this.canvas.getObjects()).indexOf(previous);
    this.canvas.discardActiveObject();
    if(parent){parent.insertAt(index,result);parent.remove(previous);parent.set('dirty',true);}else{this.canvas.insertAt(index,result);this.canvas.remove(previous);}
    result.setCoords();installLineControls(result);this.canvas.setActiveObject(result);
  }

  /** Move immediately; one undo snapshot and UI update per animation frame. */
  nudge(dx: number, dy: number): void {
    if (this.destroyed || this.restoring || this.isTextEditing() || !Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return;
    const selection = this.canvas.getActiveObject();
    const objects = this.canvas.getActiveObjects() as StudioObject[];
    const movable = objects.filter((object) => !object.visroLocked);
    if (!selection || !movable.length) return;
    const key = `nudge:${movable.map((object) => object.id).join(',')}`;
    if (this.pendingTransformKey && this.pendingTransformKey !== key) this.flushPendingChanges();
    if (selection instanceof ActiveSelection && movable.length === objects.length) {
      selection.set({ left: selection.left + dx, top: selection.top + dy });
      selection.setCoords();
    } else {
      for (const object of movable) {
        // ActiveSelection children use local coordinates. Transform a scene
        // displacement into that plane when a manually selected layer is locked.
        const parent = object.group;
        const delta = parent ? new Point(dx, dy).transform(util.invertTransform(parent.calcTransformMatrix()), true) : new Point(dx, dy);
        object.set({ left: object.left + delta.x, top: object.top + delta.y });
        object.setCoords();
      }
      if (selection instanceof ActiveSelection) { selection.triggerLayout(); selection.setCoords(); }
    }
    this.hoverTarget = undefined;
    this.queueTransform(key);
  }

  /** Step through editable top-level layers without changing the document. */
  cycleSelection(direction: 1 | -1 = 1): SelectedObject | null {
    if (this.destroyed || this.restoring || this.isTextEditing() || this.panMode || this.canvas.isDrawingMode) return this.getSelected();
    this.flushPendingChanges();
    const objects = this.canvas.getObjects().filter(object => object.visible && !(object as StudioObject).visroLocked && object.selectable);
    if (!objects.length) { this.deselect(); return null; }
    const active = new Set(this.canvas.getActiveObjects());
    const indices = objects.map((object, index) => active.has(object) ? index : -1).filter(index => index >= 0);
    const anchor = indices.length ? direction === 1 ? Math.max(...indices) : Math.min(...indices) : direction === 1 ? -1 : objects.length;
    const object = objects[(anchor + direction + objects.length) % objects.length];
    this.canvas.setActiveObject(object);
    this.hoverTarget = undefined;
    this.canvas.requestRenderAll();
    return this.getSelected();
  }

  /** Rotate a selection about its center, preserving every child transform. */
  rotateSelection(deltaDegrees: number): void {
    if (!Number.isFinite(deltaDegrees) || !deltaDegrees || this.destroyed || this.restoring || this.isTextEditing()) return;
    const selection = this.canvas.getActiveObject();
    const objects = this.canvas.getActiveObjects() as StudioObject[];
    if (!selection || !objects.length || objects.some(object => object.visroLocked)) return;
    const key = `rotate:${objects.map(object => object.id).join(',')}`;
    if (this.pendingTransformKey && this.pendingTransformKey !== key) this.flushPendingChanges();
    const center = selection.getRelativeCenterPoint();
    selection.rotate(((selection.angle + deltaDegrees % 360) % 360 + 360) % 360);
    selection.setPositionByOrigin(center, 'center', 'center');
    selection.setCoords();
    this.hoverTarget = undefined;
    this.queueTransform(key);
  }

  /** Resize along the selection's own axes, in document pixels. */
  resizeSelection(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy) || this.destroyed || this.restoring || this.isTextEditing()) return;
    const selection = this.canvas.getActiveObject();
    const objects = this.canvas.getActiveObjects() as StudioObject[];
    if (!selection || !objects.length || objects.some(object => object.visroLocked)) return;
    const key = `resize:${dx ? 'x' : ''}${dy ? 'y' : ''}:${objects.map(object => object.id).join(',')}`;
    if (this.pendingTransformKey && this.pendingTransformKey !== key) this.flushPendingChanges();
    const stroke = selection.strokeUniform ? selection.strokeWidth : 0;
    const width = selection.getScaledWidth(), height = selection.getScaledHeight();
    const targetWidth = bounded(width + dx, stroke + 1, MAX_DESIGN_SIZE * 4);
    const targetHeight = bounded(height + dy, stroke + 1, MAX_DESIGN_SIZE * 4);
    if (dx) selection.set('scaleX', selection.scaleX * (targetWidth - stroke) / Math.max(.000001, width - stroke));
    if (dy) selection.set('scaleY', selection.scaleY * (targetHeight - stroke) / Math.max(.000001, height - stroke));
    if(selection instanceof Group)this.syncResizedLine(selection,dx?targetWidth:undefined,dy?targetHeight:undefined);
    selection.setCoords();
    this.hoverTarget = undefined;
    this.queueTransform(key);
  }

  private queueTransform(key: string): void {
    this.pendingTransformKey = key;
    this.canvas.requestRenderAll();
    this.transformFrame ??= util.requestAnimFrame(() => this.flushPendingChanges());
  }

  flushPendingChanges(): void {
    if (!this.pendingTransformKey) return;
    const key = this.pendingTransformKey;
    this.pendingTransformKey = '';
    if (this.transformFrame !== undefined) util.cancelAnimFrame(this.transformFrame);
    this.transformFrame = undefined;
    this.commit(key);
  }

  isTextEditing(): boolean {
    const object = this.canvas.getActiveObject();
    return Boolean(object && isText(object) && object.isEditing);
  }

  editSelectedText(): boolean {
    const object = this.canvas.getActiveObject();
    if (!object || !isText(object) || (object as StudioObject).visroLocked || typeof object.enterEditing!=='function' || typeof object.selectAll!=='function') return false;
    this.flushPendingChanges();
    object.enterEditing(); object.selectAll(); object.hiddenTextarea?.focus();
    this.hoverTarget = undefined; this.canvas.requestRenderAll();
    return true;
  }

  /** Viewport pixels relative to the canvas, including zoom and pan. */
  getSelectionBounds(): { left: number; top: number; width: number; height: number } | null {
    const object = this.canvas.getActiveObject();
    if (!object) return null;
    const points = object.getCoords().map((point) => point.transform(this.canvas.viewportTransform));
    const left = Math.min(...points.map(({ x }) => x)), top = Math.min(...points.map(({ y }) => y));
    return { left, top, width: Math.max(...points.map(({ x }) => x)) - left, height: Math.max(...points.map(({ y }) => y)) - top };
  }

  /** Select the foremost visible, unlocked layer under a context-menu pointer. */
  selectAt(point: { x: number; y: number; includeLocked?: boolean }): SelectedObject | null {
    if (this.destroyed || this.panMode || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return this.getSelected();
    this.flushPendingChanges();
    const viewport = new Point(point.x, point.y);
    const scene = viewport.transform(util.invertTransform(this.canvas.viewportTransform));
    const object = [...this.canvas.getObjects()].reverse().find((candidate) => candidate.visible && (point.includeLocked || !(candidate as StudioObject).visroLocked) && candidate.containsPoint(scene) && !this.canvas.isTargetTransparent(candidate, point.x, point.y));
    if (object && this.canvas.getActiveObject() instanceof ActiveSelection && this.canvas.getActiveObjects().includes(object)) return this.getSelected();
    if (object) this.canvas.setActiveObject(object);
    else this.canvas.discardActiveObject();
    this.hoverTarget = undefined;
    this.canvas.requestRenderAll();
    return this.getSelected();
  }

  /** Cycle through visible pixels in an overlapping stack, front to back. */
  cycleAt(point: { x: number; y: number }): SelectedObject | null {
    if (this.destroyed || this.restoring || this.panMode || this.canvas.isDrawingMode || this.isTextEditing() || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return this.getSelected();
    this.flushPendingChanges();
    const scene = new Point(point.x, point.y).transform(util.invertTransform(this.canvas.viewportTransform));
    const candidates = [...this.canvas.getObjects()].reverse().filter(object => object.visible && object.selectable && !(object as StudioObject).visroLocked && object.containsPoint(scene) && !this.canvas.isTargetTransparent(object, point.x, point.y));
    const active = new Set(this.canvas.getActiveObjects());
    const current = candidates.findIndex(object => active.has(object));
    const next = candidates.length ? candidates[(current + 1) % candidates.length] : undefined;
    if (next) this.canvas.setActiveObject(next);
    else this.canvas.discardActiveObject();
    this.hoverTarget = undefined;
    this.canvas.requestRenderAll();
    return this.getSelected();
  }

  copyStyle(): boolean {
    const object = this.canvas.getActiveObjects()[0] as StudioObject | undefined;
    if (!object) return false;
    const base=getShapeEffectBase(object) as StudioObject;
    const style: Record<string, unknown> = {};
    for (const key of ['fill', 'stroke', 'strokeWidth', 'opacity', 'paintFirst'] as const) {
      const value = key==='opacity'?object.opacity:base[key];
      if (typeof value !== 'object' || value === null) style[key] = value;
    }
    for(const key of ['fill','stroke'] as const)if(base[key] instanceof Gradient)style[`${key}NativeGradient`]={value:resizedNativeGradient(base[key],base.width,base.height,base.width,base.height),width:base.width,height:base.height};
    if (base.visroGradient) style.visroGradient = cloneProject(base.visroGradient);
    if(isShapeEffectObject(object))style.shadow=cloneProject(object.visroShapeEffectBase?.shadow??null);
    else if (object.shadow) style.shadow = object.shadow.toObject();
    else style.shadow = null;
    if (isText(object)) {
      for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'textAlign', 'lineHeight', 'charSpacing'] as const) style[key] = object[key];
      style.visroTextEffect = (object as StudioObject).visroTextEffect ?? 'none';
      style.visroTextBaseFill = (object as StudioObject).visroTextBaseFill;
    }
    this.styleClipboard = style;
    return true;
  }

  pasteStyle(): void {
    if (!this.styleClipboard || this.destroyed || this.restoring) return;
    const style = this.styleClipboard;
    for (const object of this.canvas.getActiveObjects() as StudioObject[]) {
      if (object.visroLocked) continue;
      const base=getShapeEffectBase(object) as StudioObject;
      const values: Record<string, unknown> = {};
      for (const key of ['fill', 'stroke', 'strokeWidth', 'opacity', 'paintFirst']) if (Object.hasOwn(style, key)) values[key] = style[key];
      values.shadow = style.shadow ? new Shadow(style.shadow as ConstructorParameters<typeof Shadow>[0]) : null;
      const gradient = style.visroGradient as StudioObject['visroGradient'];
      if (gradient) { base.visroGradient = cloneProject(gradient); values.fill = this.makeGradient(gradient.colors, gradient.angle, base.width, base.height); }
      else delete base.visroGradient;
      for(const key of ['fill','stroke'] as const){const native=style[`${key}NativeGradient`] as {value:FabricObject['fill'];width:number;height:number}|undefined;if(native?.value instanceof Gradient)values[key]=resizedNativeGradient(native.value,base.width,base.height,native.width,native.height);}
      if (isText(object)) {
        for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'textAlign', 'lineHeight', 'charSpacing']) if (Object.hasOwn(style, key)) values[key] = style[key];
        (object as StudioObject).visroTextEffect = style.visroTextEffect as TextEffect | undefined;
        (object as StudioObject).visroTextBaseFill = style.visroTextBaseFill as string | undefined;
      }
      const lineCenter=object instanceof Line?object.getRelativeCenterPoint():undefined;
      if(isShapeEffectObject(object)){
        object.set('opacity',values.opacity??object.opacity);delete values.opacity;
        object.visroShapeEffectBase={...object.visroShapeEffectBase,shadow:style.shadow?cloneProject(style.shadow) as NonNullable<StudioObject['visroShapeEffectBase']>['shadow']:null};base.set(values);refreshShapeEffect(object);
      }else object.set(values);
      if(lineCenter)object.setPositionByOrigin(lineCenter,'center','center');syncLineAppearance(object);object.setCoords();
    }
    this.commit();
  }

  setElementMetadata(metadata: ElementMetadata): void {
    for (const object of this.canvas.getActiveObjects() as StudioObject[]) {
      if (!object.visroLocked) object.visroMetadata = sanitizeElementMetadata({ ...object.visroMetadata, ...metadata });
    }
    this.commit();
  }

  exportSelectedObjects(): Promise<Record<string, unknown>[]> {
    return this.runQueued(async () => {
      const selected = new Set(this.canvas.getActiveObjects().map((object) => (object as StudioObject).id));
      const content = this.canvas.toObject(CUSTOM_PROPS) as { objects: Record<string, unknown>[] };
      return cloneProject(content.objects.filter((object) => selected.has(object.id as string)));
    });
  }

  insertObjects(objects: Record<string, unknown>[]): Promise<void> {
    return this.runQueued(async () => {
      if (!Array.isArray(objects) || !objects.length || objects.length > 100) throw new Error('A component must contain between 1 and 100 layers.');
      let count = 0;
      const check = (object: Record<string, unknown>, depth = 0): void => {
        if (!object || typeof object !== 'object' || typeof object.type !== 'string' || ++count > 2000 || depth > 20) throw new Error('This component has too many nested layers.');
        if (object.src !== undefined && (typeof object.src !== 'string' || !/^(data:image\/|https?:\/\/|blob:)/i.test(object.src))) throw new Error('The component contains an unsupported image source.');
        if (Array.isArray(object.objects)) object.objects.forEach((child) => check(child as Record<string, unknown>, depth + 1));
      };
      objects.forEach((object) => check(object));
      if (JSON.stringify(objects).length > 20 * 1024 * 1024) throw new Error('This component is too large (20 MB maximum).');
      const project = createProject('Component', this.width, this.height);
      project.pages[0].canvas.objects = objects;
      const valid = validateProject(project).pages[0].canvas.objects as Record<string, unknown>[];
      const revived = await util.enlivenObjects<StudioObject>(valid, { signal: this.lifecycle.signal });
      this.assertAlive();
      const renew = (object: StudioObject): void => {
        object.id = newId(); object.set(INTERACTION_STYLE);
        if (object instanceof Group) object.getObjects().forEach((child) => renew(child as StudioObject));
      };
      revived.forEach(renew);
      this.canvas.discardActiveObject(); this.canvas.add(...revived);
      const selection = revived.length === 1 ? revived[0] : new ActiveSelection(revived, { canvas: this.canvas });
      selection.setPositionByOrigin(new Point(this.width / 2, this.height / 2), 'center', 'center'); selection.setCoords();
      this.canvas.setActiveObject(selection); this.commit();
    });
  }

  remove():void {
    const targets=this.canvas.getActiveObjects().filter(object=>!this.objectLocked(object)).map(object=>({object,parent:object.group instanceof Group&&!(object.group instanceof ActiveSelection)?object.group:undefined}));
    this.canvas.discardActiveObject();
    for(const {object,parent} of targets){if(parent){parent.remove(object);parent.set('dirty',true);if(!parent.getObjects().length){if(parent.group)parent.group.remove(parent);else this.canvas.remove(parent);}}else this.canvas.remove(object);}
    this.commit();
  }

  private async duplicateInternal(): Promise<void> {
    const originals = this.canvas.getActiveObjects();
    if (!originals.length) return;
    this.canvas.discardActiveObject();
    const clones = await Promise.all(
      originals.map(async (object) => {
        const copy = (await object.clone(CUSTOM_PROPS)) as StudioObject;
        const renewIds = (item: StudioObject): void => {
          item.id = newId();
          if (item instanceof Group)
            item
              .getObjects()
              .forEach((child) => renewIds(child as StudioObject));
        };
        renewIds(copy);
        copy.set({ left: object.left + 24, top: object.top + 24 });
        return copy;
      }),
    );
    this.canvas.add(...clones);
    this.canvas.setActiveObject(
      clones.length === 1
        ? clones[0]
        : new ActiveSelection(clones, { canvas: this.canvas }),
    );
    this.commit();
  }

  private beginOptionDrag(target: FabricObject): void {
    if (this.optionDrag || this.destroyed || this.restoring || this.suppressEvents || this.panMode || this.canvas.isDrawingMode || this.isTextEditing()) return;
    const originals = (target instanceof ActiveSelection ? target.getObjects() : [target]) as StudioObject[];
    if (originals.some(object => object.visroLocked)) return;
    const originalIds = new Map<StudioObject, string | undefined>();
    const remember = (object: StudioObject): void => {
      originalIds.set(object, object.id);
      if (object instanceof Group) object.getObjects().forEach(child => remember(child as StudioObject));
    };
    originals.forEach(remember);
    const transforms = originals.map(object => object.calcTransformMatrix());
    const needsSceneTransform = originals.map(object => Boolean(object.group));
    let finish!: () => void;
    const settled = new Promise<void>(resolve => { finish = resolve; });
    const drag: OptionDrag = { target, originals, originalIds, moved: false, ended: false, failed: false, finish };
    this.optionDrag = drag;
    // Image decoding can finish after pointer release. Undo, page changes and
    // exports must wait for the complete gesture, rather than a half-copy.
    this.asyncQueue = Promise.all([this.asyncQueue, settled]).then(() => undefined);
    void Promise.all(originals.map(object => object.clone(CUSTOM_PROPS))).then(copies => {
      if (this.destroyed) { copies.forEach(copy => copy.dispose()); drag.finish(); return; }
      drag.copies = copies as StudioObject[];
      copies.forEach((copy, index) => {
        copy.set(INTERACTION_STYLE);
        if (needsSceneTransform[index]) util.applyTransformToObject(copy, transforms[index]);
        copy.setCoords();
      });
      this.insertOptionDragCopies(drag);
      this.finishOptionDrag(drag);
    }).catch(() => {
      // Keep a normal move if the source image cannot be decoded again.
      drag.failed = true;
      for (const [object, id] of drag.originalIds) object.id = id;
      this.finishOptionDrag(drag);
    });
  }

  private insertOptionDragCopies(drag: OptionDrag): void {
    if (!drag.moved || !drag.copies || this.destroyed) return;
    drag.copies.forEach((copy, index) => {
      if (this.canvas.contains(copy)) return;
      // The untouched copy keeps the source IDs and stacking position. Fabric
      // continues moving the live objects, with fresh IDs, without waiting.
      this.canvas.insertAt(Math.max(0, this.canvas.getObjects().indexOf(drag.originals[index])), copy);
    });
    this.canvas.requestRenderAll();
  }

  private finishOptionDrag(drag: OptionDrag): void {
    if (!drag.ended || (!drag.copies && !drag.failed)) return;
    if (this.optionDrag === drag) this.optionDrag = undefined;
    if (!drag.moved) drag.copies?.forEach(copy => copy.dispose());
    else this.commit();
    drag.finish();
  }

  group(): void {
    const objects = this.canvas.getActiveObjects();
    if (
      objects.length < 2 ||
      objects.some((object) => (object as StudioObject).visroLocked)
    )
      return;
    this.canvas.discardActiveObject();
    const position = Math.min(
      ...objects.map((object) => this.canvas.getObjects().indexOf(object)),
    );
    this.canvas.remove(...objects);
    const group = label(new Group(objects), "Group");
    this.canvas.insertAt(position, group);
    this.canvas.setActiveObject(group);
    this.commit();
  }

  ungroup(): void {
    const group = this.canvas.getActiveObject();
    if (
      !(group instanceof Group) ||
      group instanceof ActiveSelection ||
      isEditableLine(group) ||
      isShapeEffectObject(group) ||
      (group as StudioObject).visroLocked
    )
      return;
    const index = this.canvas.getObjects().indexOf(group);
    const objects = group.getObjects();
    const transforms = objects.map((object) => object.calcTransformMatrix());
    this.canvas.discardActiveObject();
    this.canvas.remove(group);
    group.removeAll();
    objects.forEach((object, i) => {
      util.applyTransformToObject(object, transforms[i]);
      object.setCoords();
    });
    this.canvas.insertAt(index, ...objects);
    this.canvas.setActiveObject(
      new ActiveSelection(objects, { canvas: this.canvas }),
    );
    this.commit();
  }

  arrange(direction: ArrangeDirection): void {
    const objects = this.canvas
      .getActiveObjects()
      .filter((object) => !(object as StudioObject).visroLocked);
    if (direction === "back" || direction === "up") objects.reverse();
    objects.forEach((object) => {
      if (direction === "front") this.canvas.bringObjectToFront(object);
      else if (direction === "back") this.canvas.sendObjectToBack(object);
      else if (direction === "up") this.canvas.bringObjectForward(object);
      else this.canvas.sendObjectBackwards(object);
    });
    this.commit();
  }

  align(alignment: Alignment): void {
    const active = this.canvas.getActiveObject() as StudioObject | undefined;
    if (!active || active.visroLocked) return;
    const bounds = active.getBoundingRect();
    let dx = 0,
      dy = 0;
    if (alignment === "left") dx = -bounds.left;
    if (alignment === "center")
      dx = (this.width - bounds.width) / 2 - bounds.left;
    if (alignment === "right") dx = this.width - bounds.width - bounds.left;
    if (alignment === "top") dy = -bounds.top;
    if (alignment === "middle")
      dy = (this.height - bounds.height) / 2 - bounds.top;
    if (alignment === "bottom") dy = this.height - bounds.height - bounds.top;
    active.set({ left: active.left + dx, top: active.top + dy });
    active.setCoords();
    this.commit();
  }

  flip(axis: "x" | "y" | "horizontal" | "vertical"): void {
    for (const object of this.canvas.getActiveObjects() as StudioObject[]) {
      if (object.visroLocked) continue;
      if (axis === "x" || axis === "horizontal")
        object.set("flipX", !object.flipX);
      else object.set("flipY", !object.flipY);
    }
    this.commit();
  }

  setBackground(color: string): void {
    if (this.destroyed || this.restoring) return;
    this.canvas.backgroundColor = color;
    const page = this.document.pages.find((candidate) => candidate.id === this.document.activePageId);
    if (page) delete page.backgroundGradient;
    this.commit();
  }

  resizeDesign(width: number, height: number, options: { scaleContent?: boolean } = {}): Promise<void> {
    const origin=this.document,pageId=this.document.activePageId;
    return this.runQueued(async()=>{
      const guard=()=>{this.assertOriginPage(pageId);if(origin!==this.document||!this.documentMutationAllowed())throw new Error('This design is no longer editable.');};guard();
      this.syncPage();
      const targetWidth=bounded(Math.round(width),16,MAX_DESIGN_SIZE),targetHeight=bounded(Math.round(height),16,MAX_DESIGN_SIZE),revision=this.revision;
      const matrix:[number,number,number,number,number,number]=[targetWidth/this.width,0,0,targetHeight/this.height,0,0];
      const prepared=new Map<string,Record<string,unknown>[]>();
      if(options.scaleContent)for(const page of this.document.pages){
        if(page.id!==pageId)prepared.set(page.id,await resizeSerializedObjects((page.canvas.objects??[]) as Record<string,unknown>[],matrix,{signal:this.lifecycle.signal}));
      }
      guard();if(revision!==this.revision)throw new Error('The design changed while its resized geometry was preparing. Resize it again.');
      this.document.width=targetWidth;this.document.height=targetHeight;
      if(options.scaleContent){
        this.canvas.discardActiveObject();
        for(const object of this.canvas.getObjects()){
          util.applyTransformToObject(object,util.multiplyTransformMatrices(matrix,object.calcTransformMatrix()));syncLineSubtree(object);object.setCoords();
        }
        for(const page of this.document.pages){const objects=prepared.get(page.id);if(objects)page.canvas={...page.canvas,objects};}
      }
      this.rebuildBackgroundGradient();this.updateClip();this.fit();this.commit();
    });
  }

  resizeViewport(width: number, height: number): void {
    if (this.destroyed) return;
    this.viewportWidth = Math.max(100, Math.round(width));
    this.viewportHeight = Math.max(100, Math.round(height));
    this.canvas.setDimensions({
      width: this.viewportWidth,
      height: this.viewportHeight,
    });
    this.fit();
  }

  fit(): void {
    const zoom = Math.min(
      (this.viewportWidth - 80) / this.width,
      (this.viewportHeight - 80) / this.height,
      1,
    );
    this.setZoom(Math.max(0.02, zoom));
  }

  fitViewport(): void {
    this.fit();
  }

  setZoom(zoom: number): void {
    const value = bounded(zoom, 0.02, 8);
    this.canvas.setViewportTransform([
      value,
      0,
      0,
      value,
      (this.viewportWidth - this.width * value) / 2,
      (this.viewportHeight - this.height * value) / 2,
    ]);
    this.canvas.requestRenderAll();
    this.emit();
  }

  pan(dx: number, dy: number): void {
    if (this.destroyed || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.canvas.relativePan(new Point(dx, dy));
    this.canvas.requestRenderAll();
  }

  zoomAt(zoom: number, point: { x: number; y: number }): void {
    if (this.destroyed || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.canvas.zoomToPoint(new Point(point.x, point.y), bounded(zoom, 0.02, 8));
    this.canvas.requestRenderAll();
    this.emit();
  }

  setPanMode(enabled: boolean): void {
    if (this.destroyed || enabled === this.panMode || (enabled && this.isTextEditing())) return;
    this.panMode = enabled;
    this.panPoint = undefined;
    this.hoverTarget = undefined;
    if (enabled) {
      if (this.canvas._currentTransform) this.canvas.endCurrentTransform();
      this.drawingBeforePan = this.canvas.isDrawingMode; this.canvas.isDrawingMode = false;
    }
    else this.canvas.isDrawingMode = this.drawingBeforePan;
    this.canvas.skipTargetFind = enabled;
    this.canvas.selection = !enabled;
    this.canvas.defaultCursor = enabled ? 'grab' : 'default';
    this.canvas.hoverCursor = enabled ? 'grab' : 'move';
    this.canvas.setCursor(this.canvas.defaultCursor);
    this.canvas.requestRenderAll();
  }

  private async addPageInternal(afterId?:string): Promise<void> {
    if (this.document.pages.length >= 100)
      throw new Error("A project can contain up to 100 pages.");
    this.syncPage();
    const after=afterId?this.document.pages.find(page=>page.id===afterId):undefined;if(afterId&&!after)throw new Error('This page is no longer available.');
    const blank = createProject(
      "Page",
      this.width,
      this.height,
      after?.background??(typeof this.canvas.backgroundColor==='string'?this.canvas.backgroundColor:'#ffffff'),
    ).pages[0];
    blank.name = `Page ${this.document.pages.length + 1}`;
    if(after)this.document.pages.splice(this.document.pages.indexOf(after)+1,0,blank);else this.document.pages.push(blank);
    await this.activatePage(blank.id);
    this.commit();
  }

  private async duplicatePageInternal(id = this.document.activePageId): Promise<void> {
    if (this.document.pages.length >= 100)
      throw new Error("A project can contain up to 100 pages.");
    this.syncPage();
    const source = this.document.pages.find((page) => page.id === id);
    if (!source) return;
    const copy = cloneProject(source);
    copy.id = newId("page");
    copy.name = `${source.name} copy`;
    this.document.pages.splice(
      this.document.pages.indexOf(source) + 1,
      0,
      copy,
    );
    await this.activatePage(copy.id);
    this.commit();
  }

  private async deletePageInternal(id = this.document.activePageId): Promise<void> {
    if (this.document.pages.length === 1) return;
    this.syncPage();
    const index = this.document.pages.findIndex((page) => page.id === id);
    if (index < 0) return;
    this.document.pages.splice(index, 1);
    if (this.document.activePageId === id)
      await this.activatePage(
        this.document.pages[Math.min(index, this.document.pages.length - 1)].id,
      );
    this.commit();
  }

  private async setPageInternal(id: string): Promise<void> {
    if (id === this.document.activePageId) return;
    this.syncPage();
    await this.activatePage(id);
    this.commit();
  }

  renamePage(id: string, name: string): void {
    const page = this.document.pages.find((candidate) => candidate.id === id);
    if (page) {
      page.name = name.trim() || "Page";
      this.commit();
    }
  }

  private async restoreHistory(index:number):Promise<void> {
    const viewport=[...this.canvas.viewportTransform] as [number,number,number,number,number,number],width=this.width,height=this.height,pageId=this.document.activePageId,selected=this.canvas.getActiveObjects().map(object=>(object as StudioObject).id).filter((id):id is string=>!!id);
    await this.restore(this.snapshots[index]);this.historyIndex=index;
    if(this.width===width&&this.height===height&&this.document.activePageId===pageId)this.canvas.setViewportTransform(viewport);else this.fit();
    const candidates=selected.map(id=>this.findObject(id)).filter((object):object is StudioObject=>!!object&&object.visible);
    // Undoing Ungroup puts formerly selected children back inside their group.
    // A native ActiveSelection would pull them out again and change the restored
    // geometry. Select their containing canvas objects when restoring a multi-selection.
    const surviving=candidates.length>1?[...new Set(candidates.map(candidate=>{let object=candidate;while(object.group instanceof Group&&!(object.group instanceof ActiveSelection))object=object.group as StudioObject;return object;}))]:candidates;
    if(surviving.length)this.canvas.setActiveObject(surviving.length===1?surviving[0]:new ActiveSelection(surviving,{canvas:this.canvas}));
    this.dirty=!projectsEqual(this.snapshots[index],this.lastSaved);this.revision+=1;this.lastHistoryKey='';this.canvas.requestRenderAll();this.emit();
  }
  private async undoInternal():Promise<void> {
    if(this.historyIndex<=0||this.restoring)return;await this.restoreHistory(this.historyIndex-1);
  }
  private async redoInternal():Promise<void> {
    if(this.historyIndex>=this.snapshots.length-1||this.restoring)return;await this.restoreHistory(this.historyIndex+1);
  }

  private async exportImageInternal(options: ExportOptions = {}): Promise<string> {
    const format = options.format ?? "png";
    const scale = bounded(options.scale ?? 1, 0.1, 4);
    if (this.width * this.height * scale * scale > 64_000_000)
      throw new Error(
        "This export exceeds 64 megapixels. Choose a smaller scale.",
      );
    const dimensions = { width: this.canvas.width, height: this.canvas.height };
    const viewport = this.canvas.viewportTransform;
    const background = this.canvas.backgroundColor;
    this.exporting = true;
    try {
      if (options.transparent && format !== "jpeg")
        this.canvas.backgroundColor = "";
      if (format === 'svg') {
        // SVG background gradients use the canvas dimensions and viewport.
        // Set only the export geometry; never resize the live DOM canvas.
        this.canvas.width = this.width; this.canvas.height = this.height;
        this.canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        return this.canvas.toSVG({
            suppressPreamble: false,
            width: String(this.width),
            height: String(this.height),
            viewBox: { x: 0, y: 0, width: this.width, height: this.height },
          });
      }
      const zoom = this.canvas.getZoom();
      // Fabric paints this crop onto a separate canvas. A thumbnail must not
      // touch DOM dimensions, flex layout or Fabric's cached pointer offset.
      return this.canvas.toDataURL({
            format,
            left: viewport[4], top: viewport[5],
            width: this.width * zoom, height: this.height * zoom,
            multiplier: scale / zoom,
            quality: bounded(options.quality ?? 0.95, 0.1, 1),
            enableRetinaScaling: false,
          });
    } finally {
      this.canvas.backgroundColor = background;
      this.canvas.width = dimensions.width; this.canvas.height = dimensions.height;
      this.canvas.viewportTransform = viewport;
      this.canvas.calcViewportBoundaries();
      this.exporting = false;
    }
  }

  private async exportPagesInternal(
    scale = 1,
  ): Promise<
    {
      id: string;
      name: string;
      dataURL: string;
      width: number;
      height: number;
    }[]
  > {
    const selectedIds = new Set(this.canvas.getActiveObjects().map(object => (object as StudioObject).id));
    const viewport = [...this.canvas.viewportTransform] as [number,number,number,number,number,number];
    this.syncPage();
    const activePageId = this.document.activePageId;
    const result = [];
    try {
      for (const page of this.document.pages) {
        await this.activatePage(page.id);
        result.push({
          id: page.id,
          name: page.name,
          dataURL: await this.exportImageInternal({ format: "png", scale }),
          width: this.width,
          height: this.height,
        });
      }
    } finally {
      await this.activatePage(activePageId);
      const selected = this.canvas.getObjects().filter(object => selectedIds.has((object as StudioObject).id));
      if (selected.length === 1) this.canvas.setActiveObject(selected[0]);
      else if (selected.length > 1) this.canvas.setActiveObject(new ActiveSelection(selected, {canvas:this.canvas}));
      this.canvas.setViewportTransform(viewport);
      this.canvas.requestRenderAll();
    }
    return result;
  }

  applyEffects(effects: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    grayscale?: boolean;
    blur?: number;
  }): void {
    const image = this.canvas.getActiveObject();
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked)
      return;
    // Keep unmentioned filters, so changing brightness does not silently reset contrast.
    const updates: { type: string; value: unknown }[] = [];
    if (effects.brightness !== undefined)
      updates.push({
        type: "Brightness",
        value: new filters.Brightness({
          brightness: bounded(effects.brightness, -1, 1),
        }),
      });
    if (effects.contrast !== undefined)
      updates.push({
        type: "Contrast",
        value: new filters.Contrast({
          contrast: bounded(effects.contrast, -1, 1),
        }),
      });
    if (effects.saturation !== undefined)
      updates.push({
        type: "Saturation",
        value: new filters.Saturation({
          saturation: bounded(effects.saturation, -1, 1),
        }),
      });
    if (effects.blur !== undefined)
      updates.push({
        type: "Blur",
        value: new filters.Blur({ blur: bounded(effects.blur, 0, 1) }),
      });
    if (effects.grayscale !== undefined)
      updates.push({
        type: "Grayscale",
        value: effects.grayscale ? new filters.Grayscale() : null,
      });
    for (const update of updates) {
      image.filters = image.filters.filter(
        (filter) => filter.type !== update.type,
      );
      if (update.value)
        image.filters.push(update.value as (typeof image.filters)[number]);
    }
    image.applyFilters();
    this.commit();
  }

  getImageEffects(): ImageEffects {
    const image = this.canvas.getActiveObject();
    const result: ImageEffects = { brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false };
    if (!(image instanceof FabricImage)) return result;
    for (const filter of image.filters) {
      if (filter instanceof filters.Brightness) result.brightness = filter.brightness;
      else if (filter instanceof filters.Contrast) result.contrast = filter.contrast;
      else if (filter instanceof filters.Saturation) result.saturation = filter.saturation;
      else if (filter instanceof filters.Blur) result.blur = filter.blur;
      else if (filter instanceof filters.Grayscale) result.grayscale = true;
    }
    return result;
  }

  /** Crop original source pixels while preserving the placed image's display box. */
  cropSelectedImage(rect: ImageCropRect): void {
    const image = this.canvas.getActiveObject();
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked || this.destroyed || this.restoring) return;
    if ([rect.left, rect.top, rect.width, rect.height].some((value) => !Number.isFinite(value))) throw new Error('Choose a finite crop rectangle.');
    const source = image.getOriginalSize();
    const left = bounded(rect.left, 0, source.width - 1), top = bounded(rect.top, 0, source.height - 1);
    const width = bounded(rect.width, 1, source.width - left), height = bounded(rect.height, 1, source.height - top);
    const oldWidth = image.width, oldHeight = image.height;
    if (image.clipPath && !image.clipPath.absolutePositioned) {
      util.applyTransformToObject(image.clipPath,util.multiplyTransformMatrices([width/oldWidth,0,0,height/oldHeight,0,0],image.clipPath.calcOwnMatrix()));
      image.clipPath.setCoords();
    }
    image.set({ cropX: left, cropY: top, width, height, scaleX: image.scaleX * oldWidth / width, scaleY: image.scaleY * oldHeight / height });
    image.setCoords(); this.commit();
  }

  cropImage(ratio: number): void {
    const image = this.canvas.getActiveObject();
    if (
      !(image instanceof FabricImage) ||
      (image as StudioObject).visroLocked ||
      !Number.isFinite(ratio) ||
      ratio <= 0
    )
      return;
    const source = image.getOriginalSize();
    const center = image.getCenterPoint();
    const width = Math.min(source.width, source.height * ratio);
    const height = width / ratio;
    image.set({
      cropX: (source.width - width) / 2,
      cropY: (source.height - height) / 2,
      width,
      height,
    });
    image.setPositionByOrigin(center, "center", "center");
    image.setCoords();
    this.commit();
  }

  setSelectedImageAsBackground(): void {
    const image = this.canvas.getActiveObject() as StudioObject | undefined;
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked || this.destroyed || this.restoring) return;
    const source = image.getOriginalSize(), ratio = this.width / this.height;
    const width = Math.min(source.width, source.height * ratio), height = width / ratio;
    image.set({
      originX:'left',originY:'top',left:0,top:0,angle:0,skewX:0,skewY:0,
      cropX:(source.width-width)/2,cropY:(source.height-height)/2,width,height,
      scaleX:this.width/width,scaleY:this.height/height,clipPath:undefined,strokeWidth:0,
    });
    delete (image as StudioObject).visroFrame;
    image.setCoords();
    this.canvas.sendObjectToBack(image);
    this.commit();
  }

  resetImageEffects(): void {
    const image = this.canvas.getActiveObject();
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked)
      return;
    image.filters = [];
    image.applyFilters();
    this.commit();
  }

  setDrawing(enabled: boolean, color = "#292620", width = 8): void {
    this.canvas.isDrawingMode = enabled;
    if (enabled) {
      const brush = new PencilBrush(this.canvas);
      brush.color = color;
      brush.width = bounded(width, 1, 200);
      this.canvas.freeDrawingBrush = brush;
      this.canvas.discardActiveObject();
    }
    this.canvas.requestRenderAll();
  }

  selectLayer(id: string): void {
    let object=this.findObject(id);while(object?.group&&isShapeEffectObject(object.group))object=object.group as StudioObject;
    if (object?.visible) {
      this.canvas.setActiveObject(object);
      this.canvas.requestRenderAll();
      this.selectionChanged();
    }
  }

  setLayerVisibility(id: string, visible: boolean): void {
    const object = this.canvas
      .getObjects()
      .find((candidate) => (candidate as StudioObject).id === id);
    if (!object) return;
    if (!visible && this.canvas.getActiveObjects().includes(object))
      this.canvas.discardActiveObject();
    object.set("visible", visible);
    this.commit();
  }

  setLayerLocked(id: string, locked: boolean): void {
    const objects = id ? this.canvas
      .getObjects()
      .filter((candidate) => (candidate as StudioObject).id === id) : this.canvas.getActiveObjects();
    if (!objects.length) return;
    for (const candidate of objects) {
    const object = candidate as StudioObject;
    object.visroLocked = locked;
    object.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
      editable: !locked,
      evented: !locked,
      selectable: !locked,
    });
    }
    const active = this.canvas.getActiveObject() as StudioObject | undefined;
    if (active instanceof ActiveSelection) {
      const anyLocked = active.getObjects().some(object => (object as StudioObject).visroLocked);
      (active as StudioObject).visroLocked = active.getObjects().every(object => (object as StudioObject).visroLocked);
      // Fabric transforms an ActiveSelection as one object. Child locks do not
      // constrain that parent transform, so keep a locked child from drifting.
      active.set({ lockMovementX: anyLocked, lockMovementY: anyLocked, lockScalingX: anyLocked, lockScalingY: anyLocked, lockRotation: anyLocked, hasControls: !anyLocked });
    }
    this.commit();
  }

  reorderLayer(id: string, index: number | string): void {
    const object = this.canvas
      .getObjects()
      .find((candidate) => (candidate as StudioObject).id === id);
    if (object) {
      const destination = typeof index === 'string' ? this.canvas.getObjects().findIndex((candidate) => (candidate as StudioObject).id === index) : index;
      if (destination < 0 || !Number.isFinite(destination)) return;
      this.canvas.moveObjectTo(
        object,
        bounded(destination, 0, this.canvas.getObjects().length - 1),
      );
      this.commit();
    }
  }

  moveLayer(id: string, targetId: string): void { this.reorderLayer(id, targetId); }

  selectAll(): void {
    const objects = this.canvas
      .getObjects()
      .filter(
        (object) => object.visible && !(object as StudioObject).visroLocked,
      );
    this.canvas.discardActiveObject();
    if (objects.length)
      this.canvas.setActiveObject(
        objects.length === 1
          ? objects[0]
          : new ActiveSelection(objects, { canvas: this.canvas }),
      );
    this.canvas.requestRenderAll();
    this.selectionChanged();
  }

  deselect(): void {
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeLayerPicker?.(); this.removeLayerPicker = undefined;
    this.optionDrag?.finish(); this.optionDrag = undefined;
    if (this.transformFrame !== undefined) util.cancelAnimFrame(this.transformFrame);
    this.transformFrame = undefined; this.pendingTransformKey = '';
    this.lifecycle.abort();
    this.canvas.off();
    // Settle synchronously before React can reuse the same DOM canvas. Fabric
    // otherwise defers teardown to a pending frame and can destroy its successor.
    this.canvas.cancelRequestedRender();
    void this.canvas.dispose().catch(() => undefined);
  }

  private async makeElement(element: DesignElement): Promise<StudioObject> {
    const common = {
      originX: "left" as const,
      originY: "top" as const,
      left: Number.isFinite(element.x) ? element.x : 0,
      top: Number.isFinite(element.y) ? element.y : 0,
      fill: element.fill ?? "#292620",
      opacity: element.opacity ?? 1,
      angle: element.rotation ?? 0,
      stroke: element.stroke ?? null,
      strokeWidth: element.strokeWidth ?? 0,
    };
    const width = Math.max(1, element.width ?? 200);
    const height = Math.max(1, element.height ?? width);
    let object: FabricObject;
    if (element.type === "text") {
      object = new Textbox(element.text ?? "", {
        ...common,
        width,
        fontSize: element.fontSize ?? 32,
        fontFamily: element.fontFamily ?? "Arial",
        fontWeight: element.fontWeight ?? 400,
        fontStyle:
          element.fontStyle === "italic" || element.fontStyle === "oblique"
            ? element.fontStyle
            : "normal",
        textAlign: element.align ?? "left",
        lineHeight: element.lineHeight ?? 1.16,
        charSpacing: element.letterSpacing ?? 0,
      });
    } else if (element.type === "circle")
      object = new Circle({
        ...common,
        radius: element.radius ?? width / 2,
        scaleY: height / width,
      });
    else if (element.type === "triangle")
      object = new Triangle({ ...common, width, height });
    else if (element.type === "line")
      object = new Line([0, 0, width, height === width ? 0 : height], {
        ...common,
        stroke: element.stroke ?? element.fill ?? "#292620",
        strokeWidth: element.strokeWidth ?? 3,
      });
    else if (element.type === "star")
      object = new Polygon(starPoints(width), {
        ...common,
        scaleY: height / width,
      });
    else if (element.type === "image" && element.src) {
      const image = await FabricImage.fromURL(await inlineBundledImage(element.src), {
        crossOrigin: "anonymous",
      });
      if(element.imageFit==='cover'){
        const scale=Math.max(width/image.width,height/image.height),sourceWidth=width/scale,sourceHeight=height/scale;
        image.set({...common,cropX:(image.width-sourceWidth)/2,cropY:(image.height-sourceHeight)/2,width:sourceWidth,height:sourceHeight,scaleX:scale,scaleY:scale});
      }else if(element.imageFit==='contain'){
        const scale=Math.min(width/image.width,height/image.height);
        image.set({...common,left:common.left+(width-image.width*scale)/2,top:common.top+(height-image.height*scale)/2,scaleX:scale,scaleY:scale});
      }else image.set({...common,scaleX:width/image.width,scaleY:height/image.height});
      object = image;
    } else
      object = new Rect({
        ...common,
        width,
        height,
        rx: element.rx ?? 0,
        ry: element.ry ?? 0,
      });
    const named=label(object,element.name ?? (element.text ? element.text.slice(0,36) : element.type));
    if(element.source)named.visroMetadata=sanitizeElementMetadata({source:element.source,altText:element.name});
    return named;
  }

  private addAndSelect(object: StudioObject): void {
    if (this.destroyed || this.restoring) return;
    this.canvas.isDrawingMode = false;
    installLineControls(object);
    installInteractionControls(object);
    this.canvas.add(object);
    this.canvas.setActiveObject(object);
    this.commit();
  }

  private syncPage(): void {
    const page = this.document.pages.find(
      (candidate) => candidate.id === this.document.activePageId,
    );
    if (!page) return;
    if (typeof this.canvas.backgroundColor === 'string') page.background = this.canvas.backgroundColor;
    // Fabric Canvas.toObject already realizes ActiveSelection transforms without
    // firing events. Mutating selection here caused autosave/render feedback.
    page.canvas = this.canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
    // The artboard mask is derived viewport state, never document content.
    delete page.canvas.clipPath;
  }

  private async activatePage(id: string): Promise<void> {
    const page = this.document.pages.find((candidate) => candidate.id === id);
    if (!page) throw new Error("This page could not be found.");
    this.restoring = true;
    try {
      this.canvas.discardActiveObject();
      const content = cloneProject(page.canvas);
      delete content.clipPath;
      await this.canvas.loadFromJSON(content, undefined, { signal: this.lifecycle.signal });
      this.assertAlive();
      this.document.activePageId = id;
      if (!page.backgroundGradient) this.canvas.backgroundColor = page.background;
      this.rebuildBackgroundGradient();
      this.normalizeObjects();
      this.updateClip();
      this.canvas.requestRenderAll();
    } finally {
      this.restoring = false;
    }
    this.selectionChanged();
  }

  private async restore(project: VisroProject): Promise<void> {
    const previous = this.document;
    this.document = cloneProject(project);
    try {
      await this.activatePage(this.document.activePageId);
    } catch (error) {
      this.document = previous;
      throw error;
    }
    this.updateClip();
    this.emit();
  }

  private normalizeObjects():void {
    const visit=(raw:FabricObject):void=>{const object=raw as StudioObject;object.id??=newId();object.visroName??=objectName(object);object.set({...INTERACTION_STYLE,evented:!object.visroLocked,selectable:!object.visroLocked});if(object instanceof Group)object.getObjects().forEach(visit);if(isEditableLine(object)){installLineControls(object);if(object instanceof Group){object.set({subTargetCheck:false,interactive:false});object.getObjects().forEach(child=>child.set({evented:false,selectable:false}));}}installInteractionControls(object);this.normalizeShapeEffectInteraction(object);};
    this.canvas.getObjects().forEach(visit);
  }

  private updateClip(): void {
    this.canvas.clipPath = new Rect({
      originX: "left",
      originY: "top",
      left: 0,
      top: 0,
      width: this.width,
      height: this.height,
      strokeWidth: 0,
      fill: "#000000",
      absolutePositioned: true,
    });
  }

  private makeGradient(colors: string[], angle: number, width: number, height: number): Gradient<'linear'> {
    const radians = angle * Math.PI / 180;
    const extent = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
    const dx = Math.cos(radians) * extent / 2, dy = Math.sin(radians) * extent / 2;
    return new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: width / 2 - dx, y1: height / 2 - dy, x2: width / 2 + dx, y2: height / 2 + dy }, colorStops: colors.map((color, index) => ({ offset: index / (colors.length - 1), color })) });
  }

  private rebuildBackgroundGradient(): void {
    const gradient = this.document.pages.find((page) => page.id === this.document.activePageId)?.backgroundGradient;
    if (gradient) this.canvas.backgroundColor = this.makeGradient(gradient.colors, gradient.angle, this.width, this.height);
  }

  private addCenteredGroup(objects: FabricObject[], name: string): void {
    const group = label(new Group(objects), name);
    group.setPositionByOrigin(new Point(this.width / 2, this.height / 2), 'center', 'center');
    this.addAndSelect(group);
  }

  private resetHistory(): void {
    const snapshot = this.serialize();
    this.snapshots = [snapshot];
    this.historyIndex = 0;
    this.lastSaved = snapshot;
    this.dirty = false;
    this.emit();
  }

  private commit(historyKey = ''): void {
    if (this.restoring || this.destroyed) return;
    if (this.pendingTransformKey) {
      historyKey ||= this.pendingTransformKey;
      this.pendingTransformKey = '';
      if (this.transformFrame !== undefined) util.cancelAnimFrame(this.transformFrame);
      this.transformFrame = undefined;
    }
    const snapshot = this.serialize();
    if (!projectsEqual(this.snapshots[this.historyIndex], snapshot)) {
      const now = performance.now();
      const coalesce = historyKey && historyKey === this.lastHistoryKey && now - this.lastHistoryAt < 650 && this.historyIndex > 0 && this.historyIndex === this.snapshots.length - 1;
      this.snapshots = this.snapshots.slice(0, this.historyIndex + 1);
      if (coalesce) this.snapshots[this.historyIndex] = snapshot;
      else this.snapshots.push(snapshot);
      if (this.snapshots.length > 100) this.snapshots.shift();
      this.historyIndex = this.snapshots.length - 1;
      this.dirty = !projectsEqual(snapshot, this.lastSaved);
      this.revision += 1;
      this.lastHistoryKey = historyKey;
      this.lastHistoryAt = now;
    }
    this.canvas.requestRenderAll();
    this.selectionChanged();
  }

  private selectionChanged(): void {
    if (this.destroyed || this.suppressEvents || this.restoring) return;
    if (this.pendingTransformKey) { this.flushPendingChanges(); return; }
    const active = this.canvas.getActiveObject();
    if (active instanceof ActiveSelection) active.set(INTERACTION_STYLE);
    else if(active)installLineControls(active);
    if(active)installInteractionControls(active);
    this.options.onSelection?.(this.getSelected());
    this.emit();
  }

  private emit(): void {
    if (!this.destroyed && !this.suppressEvents && !this.restoring) this.options.onChange?.(this.getState());
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('This editor has been closed.');
    this.lifecycle.signal.throwIfAborted();
  }

  private runQueued<T>(operation: () => Promise<T>): Promise<T> {
    this.flushPendingChanges();
    const next = this.asyncQueue.then(async () => {
      this.assertAlive();
      this.suppressEvents += 1;
      try {
        const result = await operation();
        this.assertAlive();
        return result;
      } finally {
        this.suppressEvents -= 1;
        this.selectionChanged();
      }
    });
    this.asyncQueue = next.catch(() => undefined);
    return next.catch((error) => {
      if (this.destroyed) return undefined as T;
      throw error;
    });
  }
}
