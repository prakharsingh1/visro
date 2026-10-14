import type { ElementMetadata, VisroProject } from "./editor-types";

export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 40 * 1024 * 1024;
export const MAX_DESIGN_SIZE = 8192;

export function newId(prefix = "object"): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
}

export function cloneProject<T>(value: T): T {
  // Immutable strings (including image data URLs) can be shared. JSON cloning
  // copied every embedded image on every keystroke and inflated undo memory.
  if (Array.isArray(value)) return value.map((item) => cloneProject(item)) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') copy[key] = cloneProject(item);
    }
    return copy as T;
  }
  return value;
}

export function projectsEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => projectsEqual(item, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>).filter((key) => (left as Record<string, unknown>)[key] !== undefined);
  const rightKeys = Object.keys(right as Record<string, unknown>).filter((key) => (right as Record<string, unknown>)[key] !== undefined);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && projectsEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
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

export function sanitizeElementMetadata(value: unknown): ElementMetadata {
  if (!isRecord(value)) return {};
  const result: ElementMetadata = {};
  if (typeof value.link === 'string') {
    const link = value.link.trim().slice(0, 2048);
    if (/^(https?:\/\/|mailto:|#[a-z0-9_-])/i.test(link)) result.link = link;
  }
  if (typeof value.altText === 'string') result.altText = value.altText.slice(0, 2000);
  if (typeof value.duration === 'number' && Number.isFinite(value.duration)) result.duration = Math.max(0.1, Math.min(3600, value.duration));
  return result;
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
  const sanitizeLayers = (objects: unknown[], depth = 0): void => {
    if (depth > 32) throw new Error('A group is nested too deeply.');
    for (const object of objects) {
      if (!isRecord(object)) continue;
      if (object.visroMetadata !== undefined) object.visroMetadata = sanitizeElementMetadata(object.visroMetadata);
      if (Array.isArray(object.objects)) sanitizeLayers(object.objects, depth + 1);
    }
  };
  result.pages.forEach((page) => sanitizeLayers(page.canvas.objects as unknown[]));
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
