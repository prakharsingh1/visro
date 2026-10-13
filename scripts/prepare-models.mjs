import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = "1.7.0";
const cdn = `https://staticimgly.com/@imgly/background-removal-data/${version}/dist/`;
const metadataSha256 =
  "4e2a359d0436f1e55cb0e4e29a1c943f5d86d639ba4f4b5ea874a699b1f742d3";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "public", "background-removal", version);
const requiredResources = [
  "/models/isnet_fp16",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function download(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not download ${url}: ${lastError?.message}`);
}

await mkdir(destination, { recursive: true });
const sourceMetadataFile = join(destination, "SOURCE_MANIFEST.json");
let metadata;
try {
  const previous = await readFile(sourceMetadataFile);
  if (sha256(previous) === metadataSha256) metadata = previous;
} catch {
  /* First preparation downloads the official manifest. */
}
metadata ??= await download(`${cdn}resources.json`);
if (sha256(metadata) !== metadataSha256) {
  throw new Error(
    "The pinned IMG.LY 1.7.0 asset manifest has changed. Review it before updating its checksum.",
  );
}
const manifest = JSON.parse(metadata.toString("utf8"));
const selectedManifest = {};
const chunks = new Map();
for (const resource of requiredResources) {
  const entry = manifest[resource];
  if (!entry?.chunks?.length)
    throw new Error(`The official asset manifest is missing ${resource}.`);
  selectedManifest[resource] = entry;
  for (const chunk of entry.chunks) {
    if (!/^[0-9a-f]{64}$/.test(chunk.name) || chunk.name !== chunk.hash) {
      throw new Error("Unsafe or unsupported model asset name.");
    }
    chunks.set(chunk.name, {
      hash: chunk.hash,
      size: chunk.offsets[1] - chunk.offsets[0],
    });
  }
}

const tasks = [...chunks.entries()];
const totalBytes = tasks.reduce((sum, [, entry]) => sum + entry.size, 0);
let next = 0;
let complete = 0;
let cached = 0;
async function worker() {
  while (next < tasks.length) {
    const [name, entry] = tasks[next++];
    const file = join(destination, name);
    try {
      const existing = await readFile(file);
      if (existing.length === entry.size && sha256(existing) === entry.hash) {
        cached += 1;
        complete += 1;
        continue;
      }
    } catch {
      /* Missing chunks are downloaded below. */
    }
    const bytes = await download(`${cdn}${name}`);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.hash) {
      throw new Error(`Model asset failed size/SHA-256 verification: ${name}`);
    }
    const temporary = `${file}.partial-${process.pid}`;
    await writeFile(temporary, bytes);
    await rename(temporary, file);
    complete += 1;
    console.log(`Prepared local cutout asset ${complete}/${tasks.length}`);
  }
}

console.log(
  `Preparing ${(totalBytes / 1024 / 1024).toFixed(1)} MiB of local cutout assets (${version}).`,
);
await Promise.all([worker(), worker(), worker()]);
await writeFile(sourceMetadataFile, metadata);
await writeFile(
  join(destination, "resources.json"),
  `${JSON.stringify(selectedManifest, null, 2)}\n`,
);
await writeFile(
  join(destination, "ASSET_INFO.json"),
  `${JSON.stringify(
    {
      version,
      model: "isnet_fp16",
      runtime: "onnxruntime-web@1.21.0",
      bytes: totalBytes,
      files: tasks.length,
      source: cdn,
      manifestSha256: metadataSha256,
      license: "AGPL-3.0-only",
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Local background removal is ready: ${tasks.length} verified files (${cached} already cached).`,
);
