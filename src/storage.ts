let connection: Promise<IDBDatabase> | undefined;
const MEDIA_FORMAT = 'visro-media-v1';
const MEDIA_THRESHOLD = 32 * 1024;
const CACHE_LIMIT = 32 * 1024 * 1024;
const knownMedia = new Set<string>();
const mediaCache = new Map<string, string>();
const mediaKeys = new Map<string, Promise<string>>();
let cachedCharacters = 0;
const designWrites = new Map<string, Promise<unknown>>();
let summaryMigration: Promise<void> | undefined;

const database = () => connection ??= new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('visro-studio', 3);
  request.onupgradeneeded = () => {
    const db = request.result;
    for (const name of ['projects', 'assets', 'versions', 'folders', 'media', 'summaries'])
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    const assets = request.transaction!.objectStore('assets');
    if (!assets.indexNames.contains('kind')) assets.createIndex('kind', 'kind', { unique: false });
  };
  request.onsuccess = () => {
    request.result.onversionchange = () => { request.result.close(); connection = undefined; knownMedia.clear(); summaryMigration = undefined; };
    resolve(request.result);
  };
  request.onerror = () => { connection = undefined; reject(request.error); };
});

async function put(store: string, record: unknown): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite'); transaction.objectStore(store).put(record);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}
async function rows<T>(store: string): Promise<T[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function get<T>(store: string, id: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function keys(store: string): Promise<string[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAllKeys(); request.onsuccess = () => resolve(request.result as string[]); request.onerror = () => reject(request.error);
  });
}
function queueDesign<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const task = (designWrites.get(id) ?? Promise.resolve()).catch(() => undefined).then(operation);
  designWrites.set(id, task);
  void task.finally(() => { if (designWrites.get(id) === task) designWrites.delete(id); }).catch(() => undefined);
  return task;
}

export interface SavedDesign { id: string; name: string; updated: number; project: unknown; thumbnail?: string; folder?: string; starred?: boolean; deleted?: number; }
export interface LibraryAsset { id: string; name: string; data: string; kind: 'image' | 'font' | 'logo' | 'component'; updated: number; source?: {id:string;title:string;artist:string;license:string;licenseUrl:string;sourceUrl:string}; }
export interface ProjectVersion { id: string; designId: string; label: string; updated: number; project: unknown; }
export interface Folder { id: string; name: string; }
interface StoredMedia { id: string; data: string | Blob; }
interface MediaReference { __visroMedia: typeof MEDIA_FORMAT; id: string }

function rememberMedia(id: string, data: string): void {
  if (mediaCache.has(id)) return;
  mediaCache.set(id, data); cachedCharacters += data.length;
  while (cachedCharacters > CACHE_LIMIT && mediaCache.size > 1) {
    const first = mediaCache.entries().next().value as [string, string];
    mediaCache.delete(first[0]); mediaKeys.delete(first[1]); cachedCharacters -= first[1].length;
  }
}
async function mediaKey(data: string): Promise<string> {
  const existing = mediaKeys.get(data);
  if (existing) return existing;
  const task = (async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    const id = 'image-' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    rememberMedia(id, data);
    return id;
  })();
  mediaKeys.set(data, task);
  try { return await task; } catch (error) { mediaKeys.delete(data); throw error; }
}
function isMediaReference(value: unknown): value is MediaReference {
  return Boolean(value && typeof value === 'object' && (value as MediaReference).__visroMedia === MEDIA_FORMAT && typeof (value as MediaReference).id === 'string' && Object.keys(value).length === 2);
}
function inlineMedia(project: unknown): Set<string> {
  const sources = new Set<string>();
  const find = (value: unknown): void => {
    if (typeof value === 'string') { if (value.length >= MEDIA_THRESHOLD && value.startsWith('data:image/')) sources.add(value); return; }
    if (Array.isArray(value)) value.forEach(find);
    else if (value && typeof value === 'object') Object.values(value).forEach(find);
  };
  find(project);
  return sources;
}

/** Only local persistence uses references; every public project read hydrates them. */
async function normalizeProject(project: unknown): Promise<{ project: unknown; media: Map<string, string> }> {
  const sources = inlineMedia(project);
  if (!sources.size) return { project, media: new Map() };
  const references = new Map<string, string>();
  // Hash one new photo at a time so a many-photo import can yield between buffers.
  for (const source of sources) references.set(source, await mediaKey(source));
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string' && references.has(value)) return { __visroMedia: MEDIA_FORMAT, id: references.get(value)! } satisfies MediaReference;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  return { project: replace(project), media: new Map([...references].map(([data, id]) => [id, data])) };
}
async function hydrateProject(project: unknown): Promise<unknown> {
  const ids = new Set<string>();
  const find = (value: unknown): void => {
    if (isMediaReference(value)) { ids.add(value.id); return; }
    if (Array.isArray(value)) value.forEach(find);
    else if (value && typeof value === 'object') Object.values(value).forEach(find);
  };
  find(project);
  if (!ids.size) return project;
  const loaded = new Map<string, string>();
  await Promise.all([...ids].map(async (id) => {
    const cached = mediaCache.get(id);
    const stored = cached === undefined ? await get<StoredMedia>('media', id) : undefined;
    const source = cached ?? (stored?.data instanceof Blob ? await stored.data.text() : stored?.data);
    if (!source) throw new Error('A saved image is missing. Restore this design from its project file.');
    loaded.set(id, source); knownMedia.add(id); rememberMedia(id, source);
    if (!mediaKeys.has(source)) mediaKeys.set(source, Promise.resolve(id));
  }));
  const replace = (value: unknown): unknown => {
    if (isMediaReference(value)) return loaded.get(value.id)!;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  return replace(project);
}
function summarize(record: SavedDesign): SavedDesign {
  const project = record.project as { width?: number; height?: number; kind?: string; pages?: { background?: string }[] } | null;
  return { ...record, project: { width: project?.width, height: project?.height, kind: project?.kind, pages: [{ background: project?.pages?.[0]?.background ?? '#ffffff' }] } };
}
async function persistDesign(record: SavedDesign): Promise<void> {
  const normalized = await normalizeProject(record.project);
  const stored = { ...record, project: normalized.project };
  const db = await database();
  const newMedia = [...normalized.media].filter(([id]) => !knownMedia.has(id));
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['projects', 'summaries', 'media'], 'readwrite');
    for (const [id, data] of newMedia) transaction.objectStore('media').put({ id, data: new Blob([data], { type: 'text/plain;charset=utf-8' }) });
    transaction.objectStore('projects').put(stored); transaction.objectStore('summaries').put(summarize(record));
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
  newMedia.forEach(([id]) => knownMedia.add(id));
}

export async function storeDesign(record: SavedDesign): Promise<void> {
  await queueDesign(record.id, async () => {
    const old = await get<SavedDesign>('summaries', record.id);
    // The old summary contains folder/star/trash metadata without cloning its photos.
    await persistDesign({ ...old, ...record });
  });
}
export async function getDesign(id: string): Promise<SavedDesign | undefined> {
  const record = await get<SavedDesign>('projects', id);
  if (!record) return undefined;
  const result = { ...record, project: await hydrateProject(record.project) };
  if (inlineMedia(record.project).size) {
    // Convert a legacy project while opening it, before the first interactive edit.
    await queueDesign(id, async () => {
      const latest = await get<SavedDesign>('projects', id);
      if (latest) await persistDesign(latest);
    });
  } else if (!await get<SavedDesign>('summaries', id)) await put('summaries', summarize(record));
  return result;
}
export async function listDesigns(includeTrash = false): Promise<SavedDesign[]> {
  const records = (await rows<SavedDesign>('projects')).filter((record) => includeTrash || !record.deleted).sort((a, b) => b.updated - a.updated);
  return Promise.all(records.map(async (record) => ({ ...record, project: await hydrateProject(record.project) })));
}
async function migrateSummaries(): Promise<void> {
  summaryMigration ??= (async () => {
    const [projectIds, summaryIds] = await Promise.all([keys('projects'), keys('summaries')]);
    const existing = new Set(summaryIds);
    for (const id of projectIds) {
      if (existing.has(id)) continue;
      const record = await get<SavedDesign>('projects', id);
      if (record) await put('summaries', summarize(record));
      // A one-time migration yields between legacy designs instead of one getAll.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  })().catch((error) => { summaryMigration = undefined; throw error; });
  return summaryMigration;
}
export async function listDesignSummaries(includeTrash = false): Promise<SavedDesign[]> {
  await migrateSummaries();
  return (await rows<SavedDesign>('summaries')).filter((record) => includeTrash || !record.deleted).sort((a, b) => b.updated - a.updated);
}
export async function updateDesign(id: string, changes: Partial<SavedDesign>): Promise<void> {
  await queueDesign(id, async () => {
    const record = await get<SavedDesign>('projects', id);
    if (record) await persistDesign({ ...record, ...changes });
  });
}
export async function deleteDesign(id: string): Promise<void> { await updateDesign(id, { deleted: Date.now() }); }
export async function restoreDesign(id: string): Promise<void> { await updateDesign(id, { deleted: undefined }); }
export async function storeAsset(asset: LibraryAsset): Promise<void> { await put('assets', asset); }
export async function listAssets(kinds?: LibraryAsset['kind'][]): Promise<LibraryAsset[]> {
  if (!kinds) return (await rows<LibraryAsset>('assets')).sort((a, b) => b.updated - a.updated);
  const db = await database();
  const batches = await Promise.all([...new Set(kinds)].map((kind) => new Promise<LibraryAsset[]>((resolve, reject) => {
    const request = db.transaction('assets').objectStore('assets').index('kind').getAll(kind);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  })));
  return batches.flat().sort((a, b) => b.updated - a.updated);
}
export async function getAsset(id: string): Promise<LibraryAsset | undefined> { return get<LibraryAsset>('assets', id); }
export async function listFolders(): Promise<Folder[]> { return rows<Folder>('folders'); }
export async function storeFolder(folder: Folder): Promise<void> { await put('folders', folder); }
export async function storeVersion(version: ProjectVersion): Promise<void> {
  const normalized = await normalizeProject(version.project);
  const db = await database(); const newMedia = [...normalized.media].filter(([id]) => !knownMedia.has(id));
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['versions', 'media'], 'readwrite');
    for (const [id, data] of newMedia) transaction.objectStore('media').put({ id, data: new Blob([data], { type: 'text/plain;charset=utf-8' }) });
    transaction.objectStore('versions').put({ ...version, project: normalized.project });
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
  newMedia.forEach(([id]) => knownMedia.add(id));
}
export async function listVersions(designId: string): Promise<ProjectVersion[]> {
  const versions = (await rows<ProjectVersion>('versions')).filter((record) => record.designId === designId).sort((a, b) => b.updated - a.updated);
  return Promise.all(versions.map(async (record) => ({ ...record, project: await hydrateProject(record.project) })));
}
