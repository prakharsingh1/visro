import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'scripts/font-manifest.json'), 'utf8'));
const destination = join(root, 'public/fonts');
const sourceCache = join(root, 'build/font-sources');
const sourceRoot = `https://raw.githubusercontent.com/google/fonts/${manifest.commit}/`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const execute = promisify(execFile);
if (!/^[0-9a-f]{40}$/.test(manifest.commit) || manifest.repository !== 'https://github.com/google/fonts') throw new Error('Review the pinned official font manifest.');

async function validFile(file, expected) {
  try { const bytes = await readFile(file); return sha256(bytes) === expected; } catch { return false; }
}
async function officialBytes(source, expected) {
  if (!/^ofl\/[a-z0-9]+\/[A-Za-z0-9,[\]_.-]+\.(?:ttf|txt)$/.test(source)) throw new Error('Invalid font source path.');
  const cache = join(sourceCache, source.replaceAll('/', '-'));
  if (await validFile(cache, expected)) return readFile(cache);
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(sourceRoot + source.split('/').map(encodeURIComponent).join('/'), { redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!response.ok || Number(response.headers.get('content-length')) > 8 * 1024 * 1024) throw new Error(`Official font download failed (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024 || sha256(bytes) !== expected) throw new Error('Pinned font source SHA-256 mismatch.');
      await writeFile(cache, bytes); return bytes;
    } catch (error) { last = error; }
  }
  throw new Error(`Could not prepare ${source}: ${last.message}`);
}
async function pythonForConversion() {
  const local = join(root, 'build/font-tools-env/bin/python');
  let python = process.env.VISRO_FONT_PYTHON;
  if (!python) { try { await readFile(local); python = local; } catch { python = 'python3'; } }
  try {
    const result = await execute(python, ['-c', 'import fontTools,brotli; print(fontTools.__version__); print(brotli.__version__)']);
    if (result.stdout.trim() !== `${manifest.conversion.fonttools}\n${manifest.conversion.brotli}`) throw new Error('Conversion package versions differ.');
  } catch {
    throw new Error(`To restore missing WOFF2 assets, create build/font-tools-env with python3 -m venv, then install fonttools==${manifest.conversion.fonttools} brotli==${manifest.conversion.brotli}. Bundled verified fonts need no Python or network.`);
  }
  return python;
}
await mkdir(destination, { recursive: true });
await mkdir(sourceCache, { recursive: true });
let python, cached = 0, built = 0;
// Preserve source licensing per family beside the rendered files.
for (const family of manifest.families) {
  const licenseFile = join(destination, family.license.file);
  if (!(await validFile(licenseFile, family.license.sha256))) await writeFile(licenseFile, await officialBytes(family.license.source, family.license.sha256));
}
let next = 0;
const faces = manifest.families.flatMap((family) => family.faces);
async function worker() {
  while (next < faces.length) {
    const face = faces[next++], output = join(destination, face.file);
    if (!/^[a-z-]+\.woff2$/.test(face.file)) throw new Error('Invalid font output path.');
    if (await validFile(output, face.sha256)) { cached++; continue; }
    const bytes = await officialBytes(face.source, face.sourceSha256);
    const source = join(sourceCache, face.source.replaceAll('/', '-'));
    await writeFile(source, bytes);
    python ??= await pythonForConversion();
    const temporary = `${output}.partial-${process.pid}`;
    try {
      await execute(python, [join(root, 'scripts/convert-font.py'), source, temporary], { timeout: 60000 });
      const converted = await readFile(temporary);
      if (converted.toString('ascii', 0, 4) !== 'wOF2' || converted.length !== face.bytes || sha256(converted) !== face.sha256) throw new Error(`WOFF2 checksum mismatch for ${face.file}. Use the pinned converter versions.`);
      await rename(temporary, output); built++;
    } finally { await rm(temporary, { force: true }); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
const totalBytes = faces.reduce((sum, face) => sum + face.bytes, 0);
if (totalBytes > 12 * 1024 * 1024) throw new Error('The offline font catalog exceeds 12 MB.');
await writeFile(join(destination, 'SOURCE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Offline fonts: ${manifest.families.length} families, ${faces.length} faces, ${(totalBytes / 1024 / 1024).toFixed(2)} MB (${cached} verified cached, ${built} converted).`);
