export interface Settings {
  hasKey: boolean;
  textModel: string;
  imageModel: string;
  encryptionAvailable?: boolean;
}
export interface AIRequest {
  kind: "design" | "copy" | "image" | "edit";
  prompt: string;
  width?: number;
  height?: number;
  image?: string;
}
export interface AIResult {
  text?: string;
  image?: string;
  design?: {
    name: string;
    width: number;
    height: number;
    background: string;
    elements: Record<string, unknown>[];
  };
}
export interface DesktopAPI {
  getSettings(): Promise<Settings>;
  saveSettings(settings: {
    apiKey?: string;
    textModel?: string;
    imageModel?: string;
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
  openExternal(url: string): Promise<void>;
  onMenu(callback: (action: string) => void): () => void;
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
