export interface Settings {
  hasKey: boolean;
  textModel: string;
  imageModel: string;
  voiceModel: string;
  videoModel: string;
  encryptionAvailable?: boolean;
}
export interface AIRequest {
  kind: "design" | "copy" | "image" | "edit" | "translate" | "rewrite" | "summarize" | "remix" | "resize" | "voice" | "video";
  prompt: string;
  width?: number;
  height?: number;
  image?: string;
  text?: string;
  language?: string;
  tone?: string;
  design?: AIResult['design'];
  voiceName?: string;
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: 4 | 6 | 8;
  requestId?: string;
}
export interface AIResult {
  text?: string;
  image?: string;
  media?: MediaAsset;
  design?: {
    name: string;
    width: number;
    height: number;
    background: string;
    elements: Record<string, unknown>[];
  };
}
export interface MediaAsset {
  id: string;
  name: string;
  kind: 'video' | 'audio';
  src: string;
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  thumbnail?: string;
  importedAt: number;
  size: number;
}
export interface MediaCapabilities {
  available: boolean;
  videoExport: boolean;
  formats: Array<'mp4' | 'webm' | 'gif'>;
  engine: 'ffmpeg' | null;
  bundled: boolean;
  version?: string;
}
export interface TimelineClip {
  id?: string;
  kind: 'video' | 'image';
  mediaId?: string;
  image?: string;
  backgroundImage?: string;
  duration: number;
  trimStart?: number;
  volume?: number;
  fit?: 'contain' | 'cover';
  transition?: 'none' | 'fade';
  overlay?: { x: number; y: number; width: number; height: number };
}
export interface TimelineAudio {
  mediaId: string;
  start?: number;
  trimStart?: number;
  duration?: number;
  volume?: number;
}
export interface CaptionCue { id: string; start: number; end: number; text: string }
export interface CaptionStyle {
  fontFamily: 'Arial' | 'Helvetica Neue' | 'Georgia' | 'Courier New';
  fontSize: number;
  color: string;
  background: string;
  box: boolean;
  backgroundOpacity: number;
  position: 'top' | 'middle' | 'bottom';
  align: 'left' | 'center' | 'right';
  margin: number;
}
export interface TimelineExport {
  name: string;
  width: number;
  height: number;
  fps?: number;
  format: 'mp4' | 'webm' | 'gif';
  clips: TimelineClip[];
  audio?: TimelineAudio[];
  captions?: CaptionCue[];
  captionStyle?: CaptionStyle;
}
export interface MediaProgress {
  jobId: string;
  phase: 'import' | 'render' | 'mix' | 'captions' | 'encode' | 'complete' | 'cancelled';
  percent: number;
  message: string;
}
export interface AIProgress {
  requestId: string;
  kind: 'voice' | 'video';
  phase: 'generate' | 'poll' | 'download' | 'import' | 'complete' | 'cancelled';
  percent: number;
  message: string;
}
export interface PublicImage {
  id: string; title: string; name: string; description: string; artist: string;
  width: number; height: number; license: 'CC0'|'Public domain'; licenseUrl: string; sourceUrl: string; restrictions: string;
}
export interface PublicImageResult extends PublicImage { data: string; mime: string; bytes: number; imageWidth: number; imageHeight: number }
export interface PublicImageSearchResult { provider: 'wikimedia-commons'; query: string; items: PublicImage[]; nextOffset: number|null }
export interface DesktopAPI {
  searchPublicImages(input: {query: string; offset?: number; limit?: number; license?: 'all'|'public-domain'|'cc0'}): Promise<PublicImageSearchResult>;
  getPublicImage(input: {id: string; size?: 'thumbnail'|'image'}): Promise<PublicImageResult>;
  writeCanvasClipboard(input: { objects: Record<string, unknown>[]; plainText?: string }): Promise<boolean>;
  readCanvasClipboard(): Promise<{ kind: 'objects'; objects: Record<string, unknown>[] } | { kind: 'image'; data: string } | { kind: 'text'; text: string } | null>;
  getLocalTypeface(): Promise<{ name: string; data: string } | null>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: {
    apiKey?: string;
    textModel?: string;
    imageModel?: string;
    voiceModel?: string;
    videoModel?: string;
    clearKey?: boolean;
  }): Promise<Settings>;
  listModels(): Promise<
    Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>
  >;
  runAI(request: AIRequest): Promise<AIResult>;
  cancelAI(requestId: string): Promise<{ cancelled: boolean }>;
  onAIProgress(callback: (progress: AIProgress) => void): () => void;
  openProject(): Promise<{
    project: unknown;
    filePath: string;
    name: string;
  } | null>;
  saveProject(payload: {
    project: unknown;
    name?: string;
    saveAs?: boolean;
  }): Promise<{ saved: boolean; filePath: string; name: string } | null>;
  exportFile(payload: {
    name: string;
    format: string;
    dataURL?: string;
    svg?: string;
  }): Promise<unknown>;
  printDocument(payload: { html: string; name: string }): Promise<{ saved: boolean; filePath: string; name: string } | null>;
  openExternal(url: string): Promise<void>;
  onMenu(callback: (action: string) => void): () => void;
  getMediaCapabilities(): Promise<MediaCapabilities>;
  importMedia(kind?: 'video' | 'audio' | 'all'): Promise<MediaAsset[]>;
  listMedia(): Promise<MediaAsset[]>;
  removeMedia(id: string): Promise<{ removed: boolean }>;
  openMedia(id: string): Promise<void>;
  exportTimeline(payload: TimelineExport): Promise<{ saved: boolean; filePath: string; name: string; duration: number } | null>;
  cancelMediaExport(): Promise<{ cancelled: boolean }>;
  onMediaProgress(callback: (progress: MediaProgress) => void): () => void;
}
declare global {
  interface Window {
    visro?: DesktopAPI;
  }
}
export const desktop = window.visro;
export const DEFAULT_SETTINGS: Settings = {
  hasKey: false,
  textModel: "gemini-2.5-flash",
  imageModel: "gemini-2.5-flash-image",
  voiceModel: "gemini-3.1-flash-tts-preview",
  videoModel: "veo-3.1-generate-preview",
};
export async function saveExport(name: string, format: string, data: string) {
  if (desktop)
    return desktop.exportFile({
      name,
      format,
      ...(format === "svg" ? { svg: data } : { dataURL: data }),
    });
  const blob =
    format === "svg"
      ? new Blob([data], { type: "image/svg+xml" })
      : await (await fetch(data)).blob();
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `${name}.${format === "jpeg" ? "jpg" : format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function saveProjectFallback(project: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.visro`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
