export type ShapeType = "rect" | "circle" | "triangle" | "line" | "star";
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
}

export interface VisroProject {
  version: 1;
  name: string;
  width: number;
  height: number;
  pages: ProjectPage[];
  activePageId: string;
  brand: { colors: string[]; fonts: string[] };
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
}

export type SelectionState = SelectedObject;

export interface SelectionUpdate {
  name?: string;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
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
}

export interface EditorState {
  name: string;
  width: number;
  height: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  pages: { id: string; name: string }[];
  activePageId: string;
  background: string;
  layers: LayerInfo[];
  dirty: boolean;
  brand: { colors: string[]; fonts: string[] };
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
