import { createHash } from 'node:crypto';
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'build', 'media-tools');
const version = '9.0.2';
const release = 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2';
const assets = [
  { name: 'ffmpeg', source: `${release}/ffmpeg.zip`, hash: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924', executable: true },
  { name: 'ffprobe', source: `${release}/ffprobe.zip`, hash: 'fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6', executable: true },
  { name: 'FFMPEG-LICENSE.txt', source: 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/COPYING.GPLv3', hash: '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903' },
  { name: 'FFMPEG-CONFIGURATION.txt', source: `${release}/versions.txt`, hash: 'fc92572e752e09b20e7ff28d64fb7096f7bc1a0d589b2e40f17ac91b7fd0ca61' },
];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const runFile = promisify(execFile);
async function download(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch {
    // curl keeps certificate verification and avoids intermittent Node TLS
    // record errors on this Mac. Arguments never pass through a shell.
    const { stdout } = await runFile('/usr/bin/curl', ['--location', '--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '180', url], { encoding: 'buffer', maxBuffer: 192 * 1024 * 1024, timeout: 190000 });
    return stdout;
  }
}

await mkdir(target, { recursive: true });
let previous;
try { previous = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')); } catch { /* First preparation. */ }
const resolvedAssets = await Promise.all(assets.map(async (asset) => {
  const destination = join(target, asset.name);
  const previousAsset = previous?.version === version && previous?.assets?.find(entry => entry.name === asset.name);
  try {
    await access(destination);
    const bytes = await readFile(destination);
    if (sha256(bytes) === (asset.executable ? previousAsset?.binarySha256 : asset.hash)) {
      if (asset.executable) await chmod(destination, 0o755);
      return { name: asset.name, downloadSha256: asset.hash, binarySha256: sha256(bytes) };
    }
  } catch { /* Changed assets are fetched and checked again. */ }
  const downloaded = await download(asset.source);
  if (sha256(downloaded) !== asset.hash) throw new Error(`Media tool checksum failed: ${asset.name}.`);
  let content = downloaded;
  if (asset.executable) {
    const archive = `${destination}.zip`;
    await writeFile(archive, downloaded);
    try { content = (await runFile('/usr/bin/unzip', ['-p', archive, asset.name], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 })).stdout; }
    finally { await rm(archive, { force: true }); }
  }
  const temporary = `${destination}.download`;
  await writeFile(temporary, content, { mode: asset.executable ? 0o755 : 0o644 });
  await rename(temporary, destination);
  if (asset.executable) {
    const configuration = (await runFile(destination, ['-version'])).stdout;
    if (!configuration.includes('ffmpeg version 9.0.2') && !configuration.includes('ffprobe version 9.0.2')) throw new Error('Unexpected media tool version.');
    if (configuration.includes('--enable-nonfree')) throw new Error('Non-redistributable FFmpeg builds are not permitted.');
  }
  console.log(`Prepared verified Apple Silicon ${asset.name}.`);
  return { name: asset.name, downloadSha256: asset.hash, binarySha256: sha256(content) };
}));
await writeFile(join(target, 'FFMPEG-README.txt'), `Visro bundles FFmpeg ${version} as separate local command-line tools.\n\nPublisher: Martin Riedl, https://ffmpeg.martin-riedl.de/\nPinned signed Apple Silicon release: ${release}\nLicense: GNU GPL version 3 or later (full license included).\nFFmpeg source: https://ffmpeg.org/releases/ffmpeg-${version}.tar.xz\nPublisher build scripts and dependency sources: https://git.martin-riedl.de/ffmpeg/build-script\nExact dependency versions and configuration: FFMPEG-CONFIGURATION.txt\nNo nonfree component is enabled. The application invokes these files as subprocesses.\n`);
await writeFile(join(target, 'manifest.json'), JSON.stringify({ version, architecture: 'darwin-arm64', publisher: 'Martin Riedl', release, ffmpegSource: `https://ffmpeg.org/releases/ffmpeg-${version}.tar.xz`, license: 'GPL-3.0-or-later', assets: resolvedAssets }, null, 2));
console.log(`Media tools ready: ${target}`);
