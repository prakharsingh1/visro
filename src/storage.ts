const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("visro-studio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export interface SavedDesign {
  id: string;
  name: string;
  updated: number;
  project: unknown;
}
export async function storeDesign(record: SavedDesign) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("projects", "readwrite");
    transaction.objectStore("projects").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  localStorage.setItem("visro-active-design", record.id);
}
export async function listDesigns(): Promise<SavedDesign[]> {
  const db = await database();
  const rows = await new Promise<SavedDesign[]>((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows.sort((a, b) => b.updated - a.updated);
}
export async function deleteDesign(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("projects", "readwrite");
    t.objectStore("projects").delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}
