import {inlineBundledImage} from './bundled-images';
import {getGraphic} from './graphics-library';
import {getShapeGeometry} from './shapes';
import {
  ActiveSelection,
  Canvas,
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
const CUSTOM_PROPS = ["id", "visroName", "visroLocked", "visroTextEffect", "visroGradient", "visroFrame", "visroTextBaseFill", "visroOriginalSrc", "visroMetadata", "visroGraphicId"];
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
  return object;
}

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
  if (isText(object)) return "text";
  if (object instanceof FabricImage) return "image";
  if (object instanceof Group || object instanceof ActiveSelection)
    return "group";
  return object.type;
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
    this.canvas.on("object:modified", ({ target }) => {
      this.snapGuides = {}; this.hoverTarget = undefined;
      if (this.optionDrag?.moved && this.optionDrag.target === target) return;
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
  addImage(url: string, name = 'Image', placement?: {center?:{x:number;y:number};pageId?:string;source?:ElementMetadata['source'];signal?:AbortSignal}): Promise<void> { return this.runQueued(() => this.addImageInternal(url, name, placement)); }
  replaceSelectedImage(url: string): Promise<void> { return this.runQueued(() => this.replaceSelectedImageInternal(url)); }
  applyImageMask(url: string): Promise<void> { return this.replaceSelectedImage(url); }
  duplicate(): Promise<void> { return this.runQueued(() => this.duplicateInternal()); }
  addPage(): Promise<void> { return this.runQueued(() => this.addPageInternal()); }
  duplicatePage(id?: string): Promise<void> { return this.runQueued(() => this.duplicatePageInternal(id)); }
  deletePage(id?: string): Promise<void> { return this.runQueued(() => this.deletePageInternal(id)); }
  setPage(id: string): Promise<void> { return this.runQueued(() => this.setPageInternal(id)); }
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
    const text = isText(object) ? object : undefined;
    return {
      id: object.id ?? "",
      type: objectType(object),
      name: objectName(object),
      text: text?.text,
      fill: typeof object.fill === "string" ? object.fill : "#292620",
      fontSize: text?.fontSize ?? 32,
      fontFamily: text?.fontFamily ?? "Arial",
      fontWeight:
        typeof text?.fontWeight === "number"
          ? text.fontWeight >= 600
            ? "bold"
            : "normal"
          : (text?.fontWeight ?? "normal"),
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
      locked: Boolean(object.visroLocked),
      visible: object.visible,
      count: this.canvas.getActiveObjects().length,
      isImage: object instanceof FabricImage,
      underline: text?.underline ?? false,
      linethrough: text?.linethrough ?? false,
      stroke: typeof object.stroke === 'string' ? object.stroke : '',
      strokeWidth: object.strokeWidth,
      strokeOnly: Boolean(object.stroke) && (!object.fill || object.fill === 'transparent' || object.fill === 'none'),
      textEffect: object.visroTextEffect ?? 'none',
      gradient: cloneProject(object.visroGradient),
      vectorColors: object.visroGraphicId ? this.graphicColors(object) : undefined,
      metadata: cloneProject(object.visroMetadata),
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
      const style = {...common,fill:definition.filled?'#F26B3A':'transparent',stroke:definition.filled?undefined:'#292620',strokeWidth:definition.strokeWidth,strokeDashArray:definition.dash?[...definition.dash]:undefined,strokeLineCap:definition.lineCap??'round' as const,strokeLineJoin:'round' as const,scaleX:width/100,scaleY:height/100};
      if (definition.kind === 'polygon') object = new Polygon(definition.points,style);
      else if (definition.kind === 'line') object = new Line(definition.points,style);
      else object = new Path(definition.path,style);
    }
    const center=placement?.center??{x:this.width/2,y:this.height/2};
    object.setPositionByOrigin(new Point(center.x,center.y),'center','center');
    this.addAndSelect(
      label(
        object,
        definition.name,
      ),
    );
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

  addFrame(shape: FrameShape): void {
    const image = this.canvas.getActiveObject();
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked) throw new Error('Select an unlocked image to add a frame.');
    const width = image.width, height = image.height;
    let mask: FabricObject;
    if (shape === 'circle') {
      const radius = Math.min(image.getScaledWidth(), image.getScaledHeight()) / 2;
      mask = new Ellipse({ originX: 'center', originY: 'center', rx: radius / Math.abs(image.scaleX), ry: radius / Math.abs(image.scaleY) });
    }
    else if (shape === 'diamond') mask = new Polygon([{x:0,y:-height/2},{x:width/2,y:0},{x:0,y:height/2},{x:-width/2,y:0}], { originX: 'center', originY: 'center' });
    else if (shape === 'arch') {
      const radius = Math.min(width / 2, height * .5);
      mask = new Path(`M ${-width/2} ${height/2} L ${-width/2} ${-height/2+radius} Q ${-width/2} ${-height/2} 0 ${-height/2} Q ${width/2} ${-height/2} ${width/2} ${-height/2+radius} L ${width/2} ${height/2} Z`, { originX: 'center', originY: 'center' });
    } else mask = new Rect({ originX: 'center', originY: 'center', width, height, rx: Math.min(width, height) * .15, ry: Math.min(width, height) * .15 });
    mask.set({ left: 0, top: 0, fill: '#000000', strokeWidth: 0 });
    image.set('clipPath', mask);
    (image as StudioObject).visroFrame = shape;
    this.commit();
  }

  removeFrame(): void {
    const image = this.canvas.getActiveObject() as StudioObject | undefined;
    if (!(image instanceof FabricImage) || (image as StudioObject).visroLocked) return;
    image.set('clipPath', undefined);
    delete (image as StudioObject).visroFrame;
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
    if (!object?.visroGraphicId || object.visroLocked || !/^#[0-9a-f]{6}$/i.test(from) || !/^#[0-9a-f]{6}$/i.test(to) || this.destroyed || this.restoring) return;
    const visit = (part: FabricObject): void => {
      if (part instanceof Group) { part.getObjects().forEach(visit); part.set('dirty', true); }
      else for (const key of ['fill','stroke'] as const) {
        const value = part[key];
        if (typeof value === 'string' && value.toLowerCase() === from.toLowerCase()) part.set(key, to);
      }
    };
    visit(object);
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
        object.set('fill', this.makeGradient(palette, normalizedAngle, object.width, object.height));
        object.visroGradient = { colors: [...palette], angle: normalizedAngle };
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

  private async addImageInternal(url: string, name = "Image", placement?: {center?:{x:number;y:number};pageId?:string;source?:ElementMetadata['source'];signal?:AbortSignal}): Promise<void> {
    if(placement?.pageId&&placement.pageId!==this.document.activePageId)throw new Error("The page changed while this photo was loading. It is saved in Uploads.");
    placement?.signal?.throwIfAborted();
    const signal=placement?.signal?AbortSignal.any([this.lifecycle.signal,placement.signal]):this.lifecycle.signal;
    const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous", signal });
    placement?.signal?.throwIfAborted();
    this.assertAlive();
    const scale = Math.min(
      (this.width * 0.72) / image.width,
      (this.height * 0.72) / image.height,
      1,
    );
    image.set({
      originX: "left",
      originY: "top",
      scaleX: scale,
      scaleY: scale,
      left: (this.width - image.width * scale) / 2,
      top: (this.height - image.height * scale) / 2,
    });
    if(placement?.pageId&&placement.pageId!==this.document.activePageId)throw new Error("The page changed while this photo was loading. It is saved in Uploads.");
    if(placement?.center)image.set({left:placement.center.x-image.width*scale/2,top:placement.center.y-image.height*scale/2});
    const object = label(image, name);
    if(placement?.source)object.visroMetadata=sanitizeElementMetadata({source:placement.source,altText:name});
    this.addAndSelect(object);
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

  private async replaceSelectedImageInternal(url: string): Promise<void> {
    const previous = this.canvas.getActiveObject() as StudioObject | undefined;
    if (
      !(previous instanceof FabricImage) ||
      (previous as StudioObject).visroLocked
    )
      throw new Error("Select an unlocked image first.");
    const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous", signal: this.lifecycle.signal });
    this.assertAlive();
    const index = this.canvas.getObjects().indexOf(previous);
    if (index < 0)
      throw new Error("The selected image is no longer on this page.");
    const source = previous._originalElement as HTMLImageElement;
    const sourceWidth = source.naturalWidth || source.width, sourceHeight = source.naturalHeight || source.height;
    const ratioX = image.width / sourceWidth, ratioY = image.height / sourceHeight;
    const clipWidth = previous.width * ratioX, clipHeight = previous.height * ratioY;
    image.set({
      left: previous.left,
      top: previous.top,
      angle: previous.angle,
      originX: previous.originX,
      originY: previous.originY,
      width: clipWidth, height: clipHeight,
      cropX: previous.cropX * ratioX, cropY: previous.cropY * ratioY,
      scaleX: previous.scaleX / ratioX,
      scaleY: previous.scaleY / ratioY,
      flipX: previous.flipX,
      flipY: previous.flipY,
      opacity: previous.opacity,
    });
    image.filters = [...previous.filters];
    image.applyFilters();
    if (previous.clipPath) {
      const mask = await previous.clipPath.clone();
      this.assertAlive();
      mask.set({ scaleX: mask.scaleX * image.width / previous.width, scaleY: mask.scaleY * image.height / previous.height });
      image.set('clipPath', mask);
    }
    const replacement = label(image, objectName(previous));
    replacement.id = (previous as StudioObject).id;
    replacement.visroFrame = (previous as StudioObject).visroFrame;
    replacement.visroOriginalSrc = (previous as StudioObject).visroOriginalSrc ?? previous.getSrc();
    replacement.visroMetadata = cloneProject((previous as StudioObject).visroMetadata);
    this.canvas.discardActiveObject();
    this.canvas.remove(previous);
    this.canvas.insertAt(index, replacement);
    this.canvas.setActiveObject(replacement);
    this.commit();
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
      const values: Record<string, unknown> = {};
      for (const key of ["fill", "stroke", "strokeWidth", "opacity"] as const) {
        if (update[key] !== undefined) values[key] = update[key];
      }
      if (!multiple) {
        for (const key of ["left", "top", "angle"] as const) {
          if (update[key] !== undefined) values[key] = update[key];
        }
      }
      if (update.opacity !== undefined)
        values.opacity = bounded(update.opacity, 0, 1);
      if (update.name !== undefined) object.visroName = update.name;
      if (update.fill !== undefined) delete object.visroGradient;
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
      object.set(values);
      object.setCoords();
    }
    this.commit(`selection:${objects.map((object) => object.id).join(',')}:${Object.keys(update).sort().join(',')}`);
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
    if (!object || !isText(object) || (object as StudioObject).visroLocked) return false;
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
    const style: Record<string, unknown> = {};
    for (const key of ['fill', 'stroke', 'strokeWidth', 'opacity', 'paintFirst'] as const) {
      const value = object[key];
      if (typeof value !== 'object' || value === null) style[key] = value;
    }
    if (object.visroGradient) style.visroGradient = cloneProject(object.visroGradient);
    if (object.shadow) style.shadow = object.shadow.toObject();
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
      const values: Record<string, unknown> = {};
      for (const key of ['fill', 'stroke', 'strokeWidth', 'opacity', 'paintFirst']) if (Object.hasOwn(style, key)) values[key] = style[key];
      values.shadow = style.shadow ? new Shadow(style.shadow as ConstructorParameters<typeof Shadow>[0]) : null;
      const gradient = style.visroGradient as StudioObject['visroGradient'];
      if (gradient) { object.visroGradient = cloneProject(gradient); values.fill = this.makeGradient(gradient.colors, gradient.angle, object.width, object.height); }
      else delete object.visroGradient;
      if (isText(object)) {
        for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'textAlign', 'lineHeight', 'charSpacing']) if (Object.hasOwn(style, key)) values[key] = style[key];
        (object as StudioObject).visroTextEffect = style.visroTextEffect as TextEffect | undefined;
        (object as StudioObject).visroTextBaseFill = style.visroTextBaseFill as string | undefined;
      }
      object.set(values); object.setCoords();
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

  remove(): void {
    const objects = this.canvas
      .getActiveObjects()
      .filter((object) => !(object as StudioObject).visroLocked);
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
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

  resizeDesign(width: number, height: number, options: { scaleContent?: boolean } = {}): void {
    if (this.destroyed || this.restoring) return;
    this.syncPage();
    const oldWidth = this.width, oldHeight = this.height;
    this.document.width = bounded(Math.round(width), 16, MAX_DESIGN_SIZE);
    this.document.height = bounded(Math.round(height), 16, MAX_DESIGN_SIZE);
    if (options.scaleContent) {
      const sx = this.width / oldWidth, sy = this.height / oldHeight;
      this.canvas.discardActiveObject();
      for (const object of this.canvas.getObjects()) {
        object.set({ left: object.left * sx, top: object.top * sy, scaleX: object.scaleX * sx, scaleY: object.scaleY * sy });
        object.setCoords();
      }
      this.syncPage();
      for (const page of this.document.pages) {
        if (page.id === this.document.activePageId) continue;
        const objects = page.canvas.objects as Record<string, unknown>[];
        for (const object of objects) {
          object.left = Number(object.left ?? 0) * sx; object.top = Number(object.top ?? 0) * sy;
          object.scaleX = Number(object.scaleX ?? 1) * sx; object.scaleY = Number(object.scaleY ?? 1) * sy;
        }
      }
    }
    this.rebuildBackgroundGradient();
    this.updateClip();
    this.fit();
    this.commit();
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

  private async addPageInternal(): Promise<void> {
    if (this.document.pages.length >= 100)
      throw new Error("A project can contain up to 100 pages.");
    this.syncPage();
    const blank = createProject(
      "Page",
      this.width,
      this.height,
      String(this.canvas.backgroundColor || "#ffffff"),
    ).pages[0];
    blank.name = `Page ${this.document.pages.length + 1}`;
    this.document.pages.push(blank);
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

  private async undoInternal(): Promise<void> {
    if (this.historyIndex <= 0 || this.restoring) return;
    this.historyIndex -= 1;
    await this.restore(
      this.snapshots[this.historyIndex],
    );
    this.dirty = !projectsEqual(this.snapshots[this.historyIndex], this.lastSaved);
    this.revision += 1;
    this.lastHistoryKey = "";
    this.fit();
    this.emit();
  }

  private async redoInternal(): Promise<void> {
    if (this.historyIndex >= this.snapshots.length - 1 || this.restoring)
      return;
    this.historyIndex += 1;
    await this.restore(
      this.snapshots[this.historyIndex],
    );
    this.dirty = !projectsEqual(this.snapshots[this.historyIndex], this.lastSaved);
    this.revision += 1;
    this.lastHistoryKey = "";
    this.fit();
    this.emit();
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
      image.clipPath.set({ scaleX: image.clipPath.scaleX * width / oldWidth, scaleY: image.clipPath.scaleY * height / oldHeight });
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
    const object = this.canvas
      .getObjects()
      .find((candidate) => (candidate as StudioObject).id === id);
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
      stroke: element.stroke,
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

  private normalizeObjects(): void {
    for (const raw of this.canvas.getObjects()) {
      const object = raw as StudioObject;
      object.id ??= newId();
      object.visroName ??= objectName(object);
      object.set({ ...INTERACTION_STYLE, evented: !object.visroLocked, selectable: !object.visroLocked });
    }
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
