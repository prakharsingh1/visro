import type { VisroProject } from "./editor-types";

export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 40 * 1024 * 1024;
export const MAX_DESIGN_SIZE = 8192;

export function newId(prefix = "object"): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

export function cloneProject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createProject(
  name = "Untitled design",
  width = 1080,
  height = 1080,
  background = "#ffffff",
): VisroProject {
  const id = newId("page");
  return {
    version: 1,
    name,
    width,
    height,
    pages: [
      {
        id,
        name: "Page 1",
        background,
        canvas: { version: "7.4.0", objects: [], background },
      },
    ],
    activePageId: id,
    brand: {
      colors: ["#F26B3A", "#292620", "#FAF5EC", "#F6BED0"],
      fonts: ["Arial", "Georgia"],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProject(value: unknown): VisroProject {
  if (!isRecord(value)) throw new Error("This file is not a Visro project.");
  if (value.version !== PROJECT_VERSION)
    throw new Error("This project uses an unsupported file version.");
  for (const key of ["width", "height"] as const) {
    const dimension = value[key];
    if (
      typeof dimension !== "number" ||
      !Number.isFinite(dimension) ||
      dimension < 16 ||
      dimension > MAX_DESIGN_SIZE
    ) {
      throw new Error(
        `Project ${key} must be between 16 and ${MAX_DESIGN_SIZE} pixels.`,
      );
    }
  }
  if (typeof value.name !== "string" || !value.name.trim())
    throw new Error("The project is missing a name.");
  if (
    !Array.isArray(value.pages) ||
    value.pages.length === 0 ||
    value.pages.length > 100
  ) {
    throw new Error("A project must contain between 1 and 100 pages.");
  }
  const ids = new Set<string>();
  for (const page of value.pages) {
    if (
      !isRecord(page) ||
      typeof page.id !== "string" ||
      !page.id ||
      ids.has(page.id)
    ) {
      throw new Error("Each page must have a unique ID.");
    }
    ids.add(page.id);
    if (
      typeof page.name !== "string" ||
      typeof page.background !== "string" ||
      !isRecord(page.canvas)
    ) {
      throw new Error("A page has invalid content.");
    }
    if (
      !Array.isArray(page.canvas.objects) ||
      page.canvas.objects.length > 2000
    ) {
      throw new Error(
        "A page must contain an objects list with at most 2,000 layers.",
      );
    }
    for (const object of page.canvas.objects) {
      if (!isRecord(object) || typeof object.type !== "string")
        throw new Error("A page contains an invalid layer.");
    }
  }
  if (typeof value.activePageId !== "string" || !ids.has(value.activePageId)) {
    throw new Error("The active page could not be found.");
  }
  const result = cloneProject(value) as unknown as VisroProject;
  if (!isRecord(result.brand)) result.brand = { colors: [], fonts: [] };
  result.brand.colors = Array.isArray(result.brand.colors)
    ? result.brand.colors
        .filter((item) => typeof item === "string")
        .slice(0, 32)
    : [];
  result.brand.fonts = Array.isArray(result.brand.fonts)
    ? result.brand.fonts.filter((item) => typeof item === "string").slice(0, 32)
    : [];
  return result;
}

export function parseProject(json: string): VisroProject {
  if (new TextEncoder().encode(json).length > MAX_PROJECT_BYTES)
    throw new Error("This project is too large to open (40 MB maximum).");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("This file contains invalid JSON.");
  }
  return validateProject(value);
}

export function stringifyProject(project: VisroProject): string {
  return JSON.stringify(validateProject(project), null, 2);
}
