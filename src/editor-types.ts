export type {ShapeId} from './shapes';
export type ShapeType = import('./shapes').ShapeId;
export type TextEffect = 'none' | 'shadow' | 'outline' | 'neon' | 'lift' | 'hollow' | 'splice';
export type FrameShape = import('./frames').FrameDefinition['id'];
export interface ElementPlacement {center?:{x:number;y:number};pageId?:string;signal?:AbortSignal}
export interface ImagePlacement extends ElementPlacement {source?:ElementMetadata['source'];targetFrameId?:string}
export interface PageMetadata { notes?: string; duration?: number; animation?: string; guides?: {x:number[];y:number[]} }
export interface ElementMetadata { link?: string; altText?: string; duration?: number; source?: {id:string;title:string;artist:string;license:string;licenseUrl:string;sourceUrl:string} }
export interface ImageEffects { brightness: number; contrast: number; saturation: number; blur: number; grayscale: boolean }
export interface ImageCropRect { left: number; top: number; width: number; height: number }
export interface TableOptions { rows: number; columns: number; data?: string[][]; header?: boolean }
export interface ChartOptions { type: 'bar' | 'line' | 'pie' | 'donut'; labels: string[]; values: number[]; colors?: string[] }
export type TextRole = "heading" | "subheading" | "body";
export type ArrangeDirection = "front" | "back" | "up" | "down";
export type Alignment =
  "left" | "center" | "right" | "top" | "middle" | "bottom";

export interface DesignElement {
  type: "text" | "rect" | "circle" | "triangle" | "line" | "star" | "image";
  name?: string;
  text?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  align?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
  rotation?: number;
  radius?: number;
  rx?: number;
  ry?: number;
  src?: string;
  imageFit?: 'cover'|'contain';
  source?: ElementMetadata['source'];
}

export interface DesignSpec {
  name: string;
  width: number;
  height: number;
  background: string;
  elements: DesignElement[];
}

export interface DesignTemplate extends DesignSpec {
  id: string;
  category: string;
  palette: string[];
  description: string;
}

export interface ProjectPage {
  id: string;
  name: string;
  background: string;
  canvas: Record<string, unknown>;
  metadata?: PageMetadata;
  backgroundGradient?: { colors: string[]; angle: number };
}

export interface VisroProject {
  version: 1;
  name: string;
  width: number;
  height: number;
  pages: ProjectPage[];
  activePageId: string;
  brand: { colors: string[]; fonts: string[] };
  kind?: 'design' | 'document' | 'sheet' | 'whiteboard' | 'website' | 'video';
  content?: unknown;
}

export interface LayerInfo {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

export interface SelectedObject {
  id: string;
  type: string;
  name: string;
  text?: string;
  fill: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  fontStyle: string;
  align: string;
  lineHeight: number;
  letterSpacing: number;
  opacity: number;
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  locked: boolean;
  visible: boolean;
  count: number;
  isImage: boolean;
  underline: boolean;
  linethrough: boolean;
  stroke: string;
  strokeWidth: number;
  strokeDashArray?:number[]|null;
  strokeLineCap?:'butt'|'round'|'square';
  cornerRadius?:number;
  strokeOnly?: boolean;
  lineStyle?: import('./line-geometry').LineStyle;
  shapeEffect?: import('./shape-effects').ShapeEffect;
  canShapeEffect?: boolean;
  fillGradient?: {type?:'linear'|'radial';colors:string[];angle:number};
  strokeGradient?: {type?:'linear'|'radial';colors:string[];angle:number};
  frameId?: string;
  emptyFrame?: boolean;
  shapeType?: ShapeType;
  textEffect: TextEffect;
  gradient?: { colors: string[]; angle: number };
  vectorColors?: string[];
  metadata?: ElementMetadata;
}

export type SelectionState = SelectedObject;

export interface SelectionUpdate {
  name?: string;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDashArray?:number[]|null;
  strokeLineCap?:'butt'|'round'|'square';
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  fontStyle?: string;
  align?: string;
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  angle?: number;
  underline?: boolean;
  linethrough?: boolean;
  charSpacing?: number;
}

export interface EditorState {
  name: string;
  width: number;
  height: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  pages: { id: string; name: string; metadata?: PageMetadata }[];
  activePageId: string;
  background: string;
  layers: LayerInfo[];
  dirty: boolean;
  brand: { colors: string[]; fonts: string[] };
  revision: number;
  pageMetadata?: PageMetadata;
  backgroundGradient?: { colors: string[]; angle: number };
  kind?: VisroProject['kind'];
}

export interface EditorOptions {
  width?: number;
  height?: number;
  onChange?: (state: EditorState) => void;
  onSelection?: (selection: SelectedObject | null) => void;
}

export interface ExportOptions {
  format?: "png" | "jpeg" | "svg";
  scale?: number;
  transparent?: boolean;
  quality?: number;
}
