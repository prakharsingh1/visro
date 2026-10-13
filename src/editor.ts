import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricImage,
  FabricObject,
  Group,
  Line,
  PencilBrush,
  Point,
  Polygon,
  Rect,
  Textbox,
  Triangle,
  filters,
  util,
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
} from "./editor-types";
import {
  cloneProject,
  createProject,
  MAX_DESIGN_SIZE,
  newId,
  validateProject,
} from "./project";
import { getTemplate } from "./templates";

export type { EditorState, SelectionState, VisroProject } from "./editor-types";

type StudioObject = FabricObject & {
  id?: string;
  visroName?: string;
  visroLocked?: boolean;
};
const CUSTOM_PROPS = ["id", "visroName", "visroLocked"];
FabricObject.customProperties = [
  ...new Set([...FabricObject.customProperties, ...CUSTOM_PROPS]),
];

function label(object: StudioObject, name: string): StudioObject {
  object.id = newId();
  object.visroName = name;
  object.set({
    cornerColor: "#F26B3A",
    cornerStrokeColor: "#ffffff",
    cornerStyle: "circle",
    transparentCorners: false,
    borderColor: "#F26B3A",
    padding: 3,
  });
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
  private snapshots: string[] = [];
  private historyIndex = -1;
  private restoring = false;
  private viewportWidth = 800;
  private viewportHeight = 700;
  private dirty = false;
  private destroyed = false;
  private lastSaved = "";
  private exporting = false;

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
      selectionColor: "rgba(242,107,58,0.12)",
      selectionBorderColor: "#F26B3A",
      selectionLineWidth: 1,
      controlsAboveOverlay: true,
      uniformScaling: true,
      stopContextMenu: true,
    });
    this.canvas.on("selection:created", () => this.selectionChanged());
    this.canvas.on("selection:updated", () => this.selectionChanged());
    this.canvas.on("selection:cleared", () => this.selectionChanged());
    this.canvas.on("object:modified", () => this.commit());
    this.canvas.on("text:editing:exited", () => this.commit());
    this.canvas.on("path:created", (event) => {
      label(event.path as StudioObject, "Drawing");
      this.commit();
    });
    this.canvas.on("after:render", ({ ctx }) => {
      if (this.exporting) return;
      const viewport = this.canvas.viewportTransform;
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.shadowColor = "rgba(41,38,32,0.13)";
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = String(this.canvas.backgroundColor || "#ffffff");
      ctx.transform(...viewport);
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    });
    this.updateClip();
    this.fit();
    this.resetHistory();
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
      pages: this.document.pages.map(({ id, name }) => ({ id, name })),
      activePageId: this.document.activePageId,
      background: String(this.canvas.backgroundColor || "#ffffff"),
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
      left: Math.round(object.left),
      top: Math.round(object.top),
      width: Math.round(object.getScaledWidth()),
      height: Math.round(object.getScaledHeight()),
      angle: object.angle,
      locked: Boolean(object.visroLocked),
      visible: object.visible,
      count: this.canvas.getActiveObjects().length,
      isImage: object instanceof FabricImage,
    };
  }

  serialize(name?: string): VisroProject {
    this.syncPage();
    const result = cloneProject(this.document);
    if (name?.trim()) result.name = name.trim();
    return result;
  }

  markSaved(): void {
    this.lastSaved = JSON.stringify(this.serialize());
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

  async loadProject(project: VisroProject): Promise<void> {
    const valid = validateProject(project);
    await this.restore(valid);
    this.fit();
    this.resetHistory();
    this.markSaved();
  }

  async loadTemplate(id: string): Promise<void> {
    const template = getTemplate(id);
    if (!template) throw new Error("This template could not be found.");
    await this.insertDesign(template, false);
    this.document.brand.colors = [...template.palette];
    this.document.brand.fonts = ["Arial", "Georgia"];
    this.resetHistory();
    this.dirty = true;
    this.emit();
  }

  async insertDesign(spec: DesignSpec, preserveHistory = true): Promise<void> {
    if (!spec || !Array.isArray(spec.elements) || spec.elements.length > 2000)
      throw new Error("The design has invalid elements.");
    const width = bounded(Math.round(spec.width), 16, MAX_DESIGN_SIZE);
    const height = bounded(Math.round(spec.height), 16, MAX_DESIGN_SIZE);
    // Enliven image assets before touching the current document, so a failed image cannot erase it.
    const objects = await Promise.all(
      spec.elements.map((element) => this.makeElement(element)),
    );
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

  addText(role: TextRole = "body"): void {
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
    this.addAndSelect(object);
  }

  addShape(type: ShapeType = "rect"): void {
    const size = Math.min(this.width, this.height) * 0.24;
    const common = {
      originX: "left" as const,
      originY: "top" as const,
      left: (this.width - size) / 2,
      top: (this.height - size) / 2,
      fill: "#F26B3A",
      strokeWidth: 0,
    };
    let object: FabricObject;
    if (type === "circle") object = new Circle({ ...common, radius: size / 2 });
    else if (type === "triangle")
      object = new Triangle({ ...common, width: size, height: size });
    else if (type === "line")
      object = new Line([0, 0, size * 1.5, 0], {
        ...common,
        stroke: "#292620",
        strokeWidth: 8,
      });
    else if (type === "star") object = new Polygon(starPoints(size), common);
    else
      object = new Rect({
        ...common,
        width: size,
        height: size,
        rx: 16,
        ry: 16,
      });
    this.addAndSelect(
      label(
        object,
        type === "rect"
          ? "Rectangle"
          : type.charAt(0).toUpperCase() + type.slice(1),
      ),
    );
  }

  async addImage(url: string, name = "Image"): Promise<void> {
    const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
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
    this.addAndSelect(label(image, name));
  }

  getSelectedImageDataURL(): string | null {
    const object = this.canvas.getActiveObject();
    return object instanceof FabricImage
      ? object.toDataURL({
          format: "png",
          multiplier: 1,
          withoutTransform: true,
          enableRetinaScaling: false,
        })
      : null;
  }

  getSelectedImageDataUrl(): string | null {
    return this.getSelectedImageDataURL();
  }

  async selectedImageDataURL(): Promise<string> {
    const data = this.getSelectedImageDataURL();
    if (!data) throw new Error("Select an image first.");
    return data;
  }

  async replaceSelectedImage(url: string): Promise<void> {
    const previous = this.canvas.getActiveObject() as StudioObject | undefined;
    if (
      !(previous instanceof FabricImage) ||
      (previous as StudioObject).visroLocked
    )
      throw new Error("Select an unlocked image first.");
    const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const index = this.canvas.getObjects().indexOf(previous);
    if (index < 0)
      throw new Error("The selected image is no longer on this page.");
    image.set({
      left: previous.left,
      top: previous.top,
      angle: previous.angle,
      originX: previous.originX,
      originY: previous.originY,
      scaleX: previous.getScaledWidth() / image.width,
      scaleY: previous.getScaledHeight() / image.height,
      flipX: previous.flipX,
      flipY: previous.flipY,
      opacity: previous.opacity,
    });
    const replacement = label(image, objectName(previous));
    replacement.id = (previous as StudioObject).id;
    this.canvas.discardActiveObject();
    this.canvas.remove(previous);
    this.canvas.insertAt(index, replacement);
    this.canvas.setActiveObject(replacement);
    this.commit();
  }

  updateSelected(update: SelectionUpdate): void {
    const objects = this.canvas.getActiveObjects() as StudioObject[];
    if (!objects.length) return;
    const selection = this.canvas.getActiveObject();
    const multiple = selection instanceof ActiveSelection;
    if (multiple && !objects.some((object) => object.visroLocked)) {
      const transform: Record<string, unknown> = {};
      for (const key of ["left", "top", "angle"] as const) {
        if (update[key] !== undefined) transform[key] = update[key];
      }
      if (update.width !== undefined)
        transform.scaleX =
          Math.max(1, update.width) / Math.max(1, selection.width);
      if (update.height !== undefined)
        transform.scaleY =
          Math.max(1, update.height) / Math.max(1, selection.height);
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
      if (isText(object)) {
        for (const key of [
          "text",
          "fontSize",
          "fontFamily",
          "fontWeight",
          "fontStyle",
          "lineHeight",
        ] as const) {
          if (update[key] !== undefined) values[key] = update[key];
        }
        if (update.align !== undefined) values.textAlign = update.align;
        if (update.letterSpacing !== undefined)
          values.charSpacing = update.letterSpacing;
        if (update.width !== undefined && !multiple)
          values.width = Math.max(1, update.width / object.scaleX);
      } else if (update.width !== undefined && !multiple)
        values.scaleX = Math.max(1, update.width) / Math.max(1, object.width);
      if (update.height !== undefined && !multiple)
        values.scaleY = Math.max(1, update.height) / Math.max(1, object.height);
      object.set(values);
      object.setCoords();
    }
    this.commit();
  }

  remove(): void {
    const objects = this.canvas
      .getActiveObjects()
      .filter((object) => !(object as StudioObject).visroLocked);
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    this.commit();
  }

  async duplicate(): Promise<void> {
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
    this.canvas.backgroundColor = color;
    this.commit();
  }

  resizeDesign(width: number, height: number): void {
    this.document.width = bounded(Math.round(width), 16, MAX_DESIGN_SIZE);
    this.document.height = bounded(Math.round(height), 16, MAX_DESIGN_SIZE);
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
    this.canvas.relativePan(new Point(dx, dy));
    this.canvas.requestRenderAll();
  }

  async addPage(): Promise<void> {
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

  async duplicatePage(id = this.document.activePageId): Promise<void> {
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

  async deletePage(id = this.document.activePageId): Promise<void> {
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

  async setPage(id: string): Promise<void> {
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

  async undo(): Promise<void> {
    if (this.historyIndex <= 0 || this.restoring) return;
    this.historyIndex -= 1;
    await this.restore(
      JSON.parse(this.snapshots[this.historyIndex]) as VisroProject,
    );
    this.dirty = this.snapshots[this.historyIndex] !== this.lastSaved;
    this.emit();
  }

  async redo(): Promise<void> {
    if (this.historyIndex >= this.snapshots.length - 1 || this.restoring)
      return;
    this.historyIndex += 1;
    await this.restore(
      JSON.parse(this.snapshots[this.historyIndex]) as VisroProject,
    );
    this.dirty = this.snapshots[this.historyIndex] !== this.lastSaved;
    this.emit();
  }

  async exportImage(options: ExportOptions = {}): Promise<string> {
    const format = options.format ?? "png";
    const scale = bounded(options.scale ?? 1, 0.1, 4);
    if (this.width * this.height * scale * scale > 64_000_000)
      throw new Error(
        "This export exceeds 64 megapixels. Choose a smaller scale.",
      );
    const dimensions = { width: this.canvas.width, height: this.canvas.height };
    const viewport = [...this.canvas.viewportTransform] as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const background = this.canvas.backgroundColor;
    const active = this.canvas.getActiveObject();
    this.exporting = true;
    this.canvas.discardActiveObject();
    try {
      this.canvas.setDimensions({ width: this.width, height: this.height });
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      if (options.transparent && format !== "jpeg")
        this.canvas.backgroundColor = "";
      this.canvas.renderAll();
      return format === "svg"
        ? this.canvas.toSVG({
            suppressPreamble: false,
            width: String(this.width),
            height: String(this.height),
            viewBox: { x: 0, y: 0, width: this.width, height: this.height },
          })
        : this.canvas.toDataURL({
            format,
            multiplier: scale,
            quality: bounded(options.quality ?? 0.95, 0.1, 1),
            enableRetinaScaling: false,
          });
    } finally {
      this.canvas.backgroundColor = background;
      this.canvas.setDimensions(dimensions);
      this.canvas.setViewportTransform(viewport);
      this.exporting = false;
      if (active) this.canvas.setActiveObject(active);
      this.canvas.requestRenderAll();
    }
  }

  async exportPages(
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
    this.syncPage();
    const activePageId = this.document.activePageId;
    const result = [];
    try {
      for (const page of this.document.pages) {
        await this.activatePage(page.id);
        result.push({
          id: page.id,
          name: page.name,
          dataURL: await this.exportImage({ format: "png", scale }),
          width: this.width,
          height: this.height,
        });
      }
    } finally {
      await this.activatePage(activePageId);
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
    const object = this.canvas
      .getObjects()
      .find((candidate) => (candidate as StudioObject).id === id) as
      StudioObject | undefined;
    if (!object) return;
    object.visroLocked = locked;
    object.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
      editable: !locked,
    });
    this.commit();
  }

  reorderLayer(id: string, index: number): void {
    const object = this.canvas
      .getObjects()
      .find((candidate) => (candidate as StudioObject).id === id);
    if (object) {
      this.canvas.moveObjectTo(
        object,
        bounded(index, 0, this.canvas.getObjects().length - 1),
      );
      this.commit();
    }
  }

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
    this.destroyed = true;
    void this.canvas.dispose();
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
      const image = await FabricImage.fromURL(element.src, {
        crossOrigin: "anonymous",
      });
      image.set({
        ...common,
        scaleX: width / image.width,
        scaleY: height / image.height,
      });
      object = image;
    } else
      object = new Rect({
        ...common,
        width,
        height,
        rx: element.rx ?? 0,
        ry: element.ry ?? 0,
      });
    return label(
      object,
      element.name ?? (element.text ? element.text.slice(0, 36) : element.type),
    );
  }

  private addAndSelect(object: StudioObject): void {
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
    page.background = String(this.canvas.backgroundColor || "");
    // Discarding an ActiveSelection serializes its children in document coordinates.
    const active = this.canvas.getActiveObject();
    const objects =
      active instanceof ActiveSelection
        ? [...this.canvas.getActiveObjects()]
        : null;
    if (objects) this.canvas.discardActiveObject();
    page.canvas = this.canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
    if (objects?.length)
      this.canvas.setActiveObject(
        new ActiveSelection(objects, { canvas: this.canvas }),
      );
  }

  private async activatePage(id: string): Promise<void> {
    const page = this.document.pages.find((candidate) => candidate.id === id);
    if (!page) throw new Error("This page could not be found.");
    this.restoring = true;
    try {
      this.canvas.discardActiveObject();
      await this.canvas.loadFromJSON(cloneProject(page.canvas));
      this.document.activePageId = id;
      this.canvas.backgroundColor = page.background;
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
      object.set({
        cornerColor: "#F26B3A",
        cornerStrokeColor: "#ffffff",
        cornerStyle: "circle",
        transparentCorners: false,
        borderColor: "#F26B3A",
      });
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

  private resetHistory(): void {
    const snapshot = JSON.stringify(this.serialize());
    this.snapshots = [snapshot];
    this.historyIndex = 0;
    this.lastSaved = snapshot;
    this.dirty = false;
    this.emit();
  }

  private commit(): void {
    if (this.restoring || this.destroyed) return;
    const snapshot = JSON.stringify(this.serialize());
    if (this.snapshots[this.historyIndex] !== snapshot) {
      this.snapshots = this.snapshots.slice(0, this.historyIndex + 1);
      this.snapshots.push(snapshot);
      if (this.snapshots.length > 100) this.snapshots.shift();
      this.historyIndex = this.snapshots.length - 1;
      this.dirty = snapshot !== this.lastSaved;
    }
    this.canvas.requestRenderAll();
    this.selectionChanged();
  }

  private selectionChanged(): void {
    if (this.destroyed) return;
    this.options.onSelection?.(this.getSelected());
    this.emit();
  }

  private emit(): void {
    if (!this.destroyed) this.options.onChange?.(this.getState());
  }
}
