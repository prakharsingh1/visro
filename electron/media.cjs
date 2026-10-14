'use strict';

const fs = require('node:fs/promises');
const { createReadStream, constants } = require('node:fs');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { decodeImage } = require('./gemini.cjs');
const { safeName } = require('./files.cjs');

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEDIA_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus']);
const DEMUXERS = 'mov,matroska,webm,avi,mp3,wav,m4a,ogg,flac,aac,m4v,mpeg,mpegvideo,gif,image2,png_pipe,jpeg_pipe,webp_pipe';
const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;

function mediaId(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('Choose an image, video, or audio item from your media library.');
  return value;
}
function number(value, fallback, min, max, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function validateTimeline(input) {
  if (!input || typeof input !== 'object' || !['mp4', 'webm', 'gif'].includes(input.format)) throw new Error('Choose MP4, WebM, or GIF export.');
  const width = Math.round(number(input.width, 1080, 16, 3840, 'Video width') / 2) * 2;
  const height = Math.round(number(input.height, 1080, 16, 3840, 'Video height') / 2) * 2;
  const fps = Math.round(number(input.fps, 30, 1, 60, 'Frame rate'));
  if (!Array.isArray(input.clips) || !input.clips.length || input.clips.length > 100) throw new Error('Add between 1 and 100 scenes to your timeline.');
  let imageBytes = 0;
  function image(value) { const decoded = decodeImage(value); imageBytes += Buffer.byteLength(decoded.data, 'base64'); return decoded; }
  const clips = input.clips.map((clip) => {
    if (!clip || !['video', 'image'].includes(clip.kind)) throw new Error('A scene must contain a video or image.');
    const item = { kind: clip.kind, duration: number(clip.duration, 5, 0.1, 600, 'Scene duration'), trimStart: number(clip.trimStart, 0, 0, 3600, 'Video trim start'), volume: number(clip.volume, 1, 0, 2, 'Volume'), fit: clip.fit === 'cover' ? 'cover' : 'contain', transition: clip.transition === 'fade' ? 'fade' : 'none' };
    if (item.kind === 'image') item.image = image(clip.image);
    else item.mediaId = mediaId(clip.mediaId);
    if (clip.backgroundImage) item.backgroundImage = image(clip.backgroundImage);
    if (clip.overlay) item.overlay = { x: number(clip.overlay.x, 0, 0, width, 'Video X'), y: number(clip.overlay.y, 0, 0, height, 'Video Y'), width: Math.round(number(clip.overlay.width, width, 2, width, 'Overlay width') / 2) * 2, height: Math.round(number(clip.overlay.height, height, 2, height, 'Overlay height') / 2) * 2 };
    return item;
  });
  if (imageBytes > 80 * 1024 * 1024) throw new Error('Timeline scene images must total less than 80 MB.');
  const duration = clips.reduce((sum, clip) => sum + clip.duration, 0);
  if (duration > (input.format === 'gif' ? 120 : 3600)) throw new Error(input.format === 'gif' ? 'GIF timelines can be up to 2 minutes long.' : 'Video timelines can be up to 1 hour long.');
  if (input.audio && (!Array.isArray(input.audio) || input.audio.length > 16)) throw new Error('Add up to 16 audio tracks.');
  const audio = (input.audio || []).map((track) => ({ mediaId: mediaId(track.mediaId), start: number(track.start, 0, 0, duration, 'Audio position'), trimStart: number(track.trimStart, 0, 0, 3600, 'Audio trim start'), duration: number(track.duration, duration, 0.1, 3600, 'Audio duration'), volume: number(track.volume, 1, 0, 2, 'Audio volume') }));
  return { name: safeName(input.name, 'Visro film'), width, height, fps, format: input.format, clips, audio, duration };
}

function createMediaService({ directory, toolsDirectory, developmentToolsDirectory, allowSystemFallback = false, onProgress = () => {} }) {
  const catalogPath = path.join(directory, 'catalog.json');
  let mutations = Promise.resolve();
  let activeExport;
  let cachedTools;
  const enqueue = (task) => { const result = mutations.then(task); mutations = result.catch(() => {}); return result; };

  async function tools() {
    if (cachedTools) return cachedTools;
    const locations = [toolsDirectory, developmentToolsDirectory, ...(allowSystemFallback ? ['/opt/homebrew/bin', '/usr/local/bin'] : [])].filter(Boolean);
    for (const folder of locations) {
      try {
        await Promise.all(['ffmpeg', 'ffprobe'].map((name) => fs.access(path.join(folder, name), constants.X_OK)));
        cachedTools = { ffmpeg: path.join(folder, 'ffmpeg'), ffprobe: path.join(folder, 'ffprobe'), bundled: !['/opt/homebrew/bin', '/usr/local/bin'].includes(folder) };
        return cachedTools;
      } catch { /* Try the next explicit trusted tool directory. */ }
    }
    throw new Error('The local media rendering engine is missing. Reinstall Visro or run the media-tool preparation script.');
  }

  function run(binary, args, { signal, progress, duration, timeout = 60000 } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('Media export cancelled.')); return; }
      const child = spawn(binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', timedOut = false, cancelTimer;
      const abort = () => { child.kill('SIGTERM'); cancelTimer = setTimeout(() => child.kill('SIGKILL'), 1500); };
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + chunk).slice(-2 * 1024 * 1024);
        if (progress && duration) {
          const matches = [...String(chunk).matchAll(/out_time_(?:us|ms)=(\d+)/g)];
          if (matches.length) progress(Math.min(1, Number(matches.at(-1)[1]) / 1000000 / duration));
        }
      });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-12000); });
      child.once('error', () => { clearTimeout(timer); clearTimeout(cancelTimer); signal?.removeEventListener('abort', abort); reject(new Error('The local media engine could not be started.')); });
      child.once('close', (code) => {
        clearTimeout(timer); clearTimeout(cancelTimer); signal?.removeEventListener('abort', abort);
        if (signal?.aborted) reject(new Error('Media export cancelled.'));
        else if (timedOut) reject(new Error('The media operation took too long. Try a shorter clip or smaller resolution.'));
        else if (code !== 0) reject(new Error(`The local media engine could not read or render this item. ${stderr.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 350)}`));
        else resolve(stdout);
      });
    });
  }

  async function capabilities() {
    try {
      const engine = await tools();
      const version = (await run(engine.ffmpeg, ['-version'], { timeout: 15000 })).match(/ffmpeg version ([^\s]+)/)?.[1];
      return { available: true, videoExport: true, formats: ['mp4', 'webm', 'gif'], engine: 'ffmpeg', bundled: engine.bundled, version };
    } catch { return { available: false, videoExport: false, formats: [], engine: null, bundled: false }; }
  }

  async function readCatalog() {
    try {
      const stat = await fs.stat(catalogPath);
      if (stat.size > 8 * 1024 * 1024) throw new Error('Invalid media catalog.');
      const list = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
      if (!Array.isArray(list)) throw new Error('Invalid media catalog.');
      return list.filter((item) => item && ID_PATTERN.test(item.id) && ['video', 'audio'].includes(item.kind));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('The media library could not be read.');
    }
  }

  async function writeCatalog(items) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${catalogPath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(items), { mode: 0o600 });
    await fs.rename(temporary, catalogPath);
  }

  async function asset(id) {
    mediaId(id);
    const item = (await readCatalog()).find((entry) => entry.id === id);
    if (!item) throw new Error('This media item is no longer in your library. Import it again.');
    const folder = path.join(directory, item.id);
    return { ...item, folder, sourcePath: path.join(folder, 'source'), previewPath: path.join(folder, item.kind === 'video' ? 'preview.mp4' : 'preview.m4a'), thumbnailPath: path.join(folder, 'thumbnail.jpg') };
  }

  async function publicAsset(item) {
    const result = { id: item.id, name: item.name, kind: item.kind, src: `visro://app/media/${item.id}`, duration: item.duration, hasAudio: item.hasAudio, importedAt: item.importedAt, size: item.size, ...(item.kind === 'video' ? { width: item.width, height: item.height } : {}) };
    try { result.thumbnail = `data:image/jpeg;base64,${(await fs.readFile(path.join(directory, item.id, 'thumbnail.jpg'))).toString('base64')}`; } catch { /* Audio may not include artwork. */ }
    return result;
  }

  async function probe(file, signal) {
    const engine = await tools();
    const json = await run(engine.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', DEMUXERS, '-show_format', '-show_streams', '-of', 'json', file], { timeout: 30000, signal });
    try { return JSON.parse(json); } catch { throw new Error('This file is not a readable video or audio clip.'); }
  }

  async function importFiles(files, requestedKind = 'all', { signal } = {}) {
    return enqueue(async () => {
      if (!Array.isArray(files) || !files.length || files.length > 20 || !['video', 'audio', 'all'].includes(requestedKind)) throw new Error('Choose up to 20 video or audio files.');
      const engine = await tools();
      const imported = [];
      for (const file of files) {
        if (signal?.aborted) throw new Error('AI media generation cancelled.');
        if (typeof file !== 'string' || !MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new Error('Choose a supported video or audio file.');
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) throw new Error('Import a video or audio file smaller than 1 GB.');
        const id = crypto.randomUUID(), folder = path.join(directory, id);
        await fs.mkdir(folder, { recursive: true, mode: 0o700 });
        const sourcePath = path.join(folder, 'source');
        try {
          await fs.copyFile(file, sourcePath);
          const metadata = await probe(sourcePath, signal);
          const video = metadata.streams?.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
          const audio = metadata.streams?.find((stream) => stream.codec_type === 'audio');
          const kind = video ? 'video' : audio ? 'audio' : null;
          if (!kind || (requestedKind !== 'all' && kind !== requestedKind)) throw new Error(`Choose a ${requestedKind === 'all' ? 'video or audio' : requestedKind} file.`);
          const duration = Number(metadata.format?.duration || video?.duration || audio?.duration);
          if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error('Import a readable media clip up to 1 hour long.');
          if (video && (Number(video.width) > 8192 || Number(video.height) > 8192)) throw new Error('Import a video with dimensions up to 8K.');
          const item = { id, name: path.basename(file), kind, duration, hasAudio: Boolean(audio), width: Number(video?.width || 0), height: Number(video?.height || 0), importedAt: Date.now(), size: stat.size };
          const progress = (fraction) => onProgress({ jobId: id, phase: 'import', percent: Math.round(fraction * 100), message: `Preparing ${item.name}` });
          const common = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-format_whitelist', DEMUXERS, '-i', sourcePath];
          if (kind === 'video') {
            await run(engine.ffmpeg, [...common, '-vf', "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-progress', 'pipe:1', path.join(folder, 'preview.mp4')], { duration, progress, timeout: 1800000, signal });
            await run(engine.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', path.join(folder, 'preview.mp4'), '-frames:v', '1', '-vf', 'scale=320:-1', path.join(folder, 'thumbnail.jpg')], { signal });
          } else {
            await run(engine.ffmpeg, [...common, '-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-progress', 'pipe:1', path.join(folder, 'preview.m4a')], { duration, progress, timeout: 1800000, signal });
            await run(engine.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', path.join(folder, 'preview.m4a'), '-filter_complex', 'showwavespic=s=320x120:colors=0xED704D', '-frames:v', '1', path.join(folder, 'thumbnail.jpg')], { signal });
          }
          if (signal?.aborted) throw new Error('AI media generation cancelled.');
          const catalog = await readCatalog();
          catalog.unshift(item);
          await writeCatalog(catalog);
          imported.push(await publicAsset(item));
          onProgress({ jobId: id, phase: 'complete', percent: 100, message: `${item.name} is ready` });
        } catch (error) { await fs.rm(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); throw error; }
      }
      return imported;
    });
  }

  async function importBuffer({ data, name, kind }, { signal } = {}) {
    if (!Buffer.isBuffer(data) || !data.length || data.length > 200 * 1024 * 1024 || !['video', 'audio'].includes(kind)) throw new Error('Generated media is missing or too large.');
    if (signal?.aborted) throw new Error('AI media generation cancelled.');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = await fs.mkdtemp(path.join(directory, '.generated-'));
    const extension = kind === 'video' ? 'mp4' : 'wav';
    const file = path.join(temporary, `${safeName(name, kind === 'video' ? 'Veo video' : 'Gemini voice').replace(/\.(mp4|wav)$/i, '')}.${extension}`);
    try {
      await fs.writeFile(file, data, { mode: 0o600 });
      return (await importFiles([file], kind, { signal }))[0];
    } finally { await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  }

  async function listMedia() { return Promise.all((await readCatalog()).map(publicAsset)); }
  async function removeMedia(id) {
    mediaId(id);
    return enqueue(async () => {
      const catalog = await readCatalog();
      if (!catalog.some((item) => item.id === id)) return { removed: false };
      await fs.rm(path.join(directory, id), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      await writeCatalog(catalog.filter((item) => item.id !== id));
      return { removed: true };
    });
  }

  async function mediaResponse(request) {
    const url = new URL(request.url);
    const match = /^\/media\/([0-9a-f-]+)$/.exec(url.pathname);
    if (url.protocol !== 'visro:' || url.hostname !== 'app' || !match || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    try {
      const item = await asset(match[1]);
      const stat = await fs.stat(item.previewPath);
      const headers = { 'Content-Type': item.kind === 'video' ? 'video/mp4' : 'audio/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(stat.size), 'Cross-Origin-Resource-Policy': 'same-origin' };
      let start = 0, end = stat.size - 1, status = 200;
      const range = request.headers?.get?.('range');
      if (range) {
        const parsed = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!parsed || (!parsed[1] && !parsed[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
        if (!parsed[1]) start = Math.max(0, stat.size - Number(parsed[2]));
        else { start = Number(parsed[1]); if (parsed[2]) end = Math.min(end, Number(parsed[2])); }
        if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; headers['Content-Length'] = String(end - start + 1);
      }
      const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(item.previewPath, { start, end }));
      return new Response(body, { status, headers });
    } catch { return new Response('Not found', { status: 404 }); }
  }

  async function exportTimeline(input, destination) {
    if (activeExport) throw new Error('Wait for the current media export to finish, or cancel it.');
    const timeline = validateTimeline(input);
    const job = { id: crypto.randomUUID(), controller: new AbortController() };
    activeExport = job;
    const engine = await tools().catch((error) => { activeExport = undefined; throw error; });
    const work = path.join(directory, `.export-${job.id}`);
    await fs.mkdir(work, { recursive: true, mode: 0o700 });
    const emit = (phase, percent, message) => onProgress({ jobId: job.id, phase, percent: Math.round(percent), message });
    const ff = (args, options = {}) => run(engine.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { signal: job.controller.signal, timeout: 3600000, ...options });
    const localInput = (file) => ['-protocol_whitelist', 'file,pipe', '-format_whitelist', DEMUXERS, '-i', file];
    const fitFilter = (w, h, fit) => fit === 'cover' ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1` : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    async function writeImage(decoded, name) { const extension = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[decoded.mimeType]; const file = path.join(work, name.replace(/\.png$/, extension)); await fs.writeFile(file, Buffer.from(decoded.data, 'base64')); return file; }
    try {
      const segments = [];
      for (let i = 0; i < timeline.clips.length; i++) {
        if (job.controller.signal.aborted) throw new Error('Media export cancelled.');
        const clip = timeline.clips[i], args = [];
        let sourceIndex = 0, silentIndex, hasAudio = false, graph;
        if (clip.kind === 'image') {
          const image = await writeImage(clip.image, `image-${i}.png`);
          args.push('-loop', '1', '-framerate', String(timeline.fps), ...localInput(image));
          graph = `[0:v]${fitFilter(timeline.width, timeline.height, clip.fit)}`;
          silentIndex = 1;
        } else {
          const media = await asset(clip.mediaId);
          if (media.kind !== 'video') throw new Error('Choose a video item for a video scene.');
          if (clip.trimStart >= media.duration || clip.trimStart + clip.duration > media.duration + 0.1) throw new Error(`${media.name} does not have enough video after the selected trim point.`);
          hasAudio = media.hasAudio;
          if (clip.backgroundImage) {
            const background = await writeImage(clip.backgroundImage, `background-${i}.png`);
            args.push('-loop', '1', '-framerate', String(timeline.fps), ...localInput(background)); sourceIndex = 1;
          }
          args.push('-ss', String(clip.trimStart), '-t', String(clip.duration), ...localInput(media.sourcePath));
          if (clip.backgroundImage) {
            const rect = clip.overlay || { x: 0, y: 0, width: timeline.width, height: timeline.height };
            graph = `[0:v]${fitFilter(timeline.width, timeline.height, 'contain')}[bg];[1:v]${fitFilter(rect.width, rect.height, clip.fit)}[fg];[bg][fg]overlay=${rect.x}:${rect.y}:shortest=1`;
          } else graph = `[0:v]${fitFilter(timeline.width, timeline.height, clip.fit)}`;
          silentIndex = sourceIndex + 1;
        }
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
        graph += `,fps=${timeline.fps},format=yuv420p${clip.transition === 'fade' ? `,fade=t=in:st=0:d=${Math.min(0.4, clip.duration / 3)}` : ''}[v]`;
        args.push('-filter_complex', graph, '-map', '[v]', '-map', `${hasAudio ? sourceIndex : silentIndex}:a:0`, '-af', `volume=${clip.volume}`, '-t', String(clip.duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-progress', 'pipe:1');
        const name = `scene-${i}.mp4`; segments.push(name);
        await ff([...args, path.join(work, name)], { duration: clip.duration, progress: (fraction) => emit('render', (i + fraction) / timeline.clips.length * 75, `Rendering scene ${i + 1} of ${timeline.clips.length}`) });
      }
      const list = path.join(work, 'scenes.txt');
      await fs.writeFile(list, segments.map((name) => `file '${name}'`).join('\n'));
      const joined = path.join(work, 'joined.mp4');
      emit('mix', 76, 'Joining your scenes');
      await ff(['-f', 'concat', '-safe', '1', '-protocol_whitelist', 'file,pipe', '-i', list, '-c', 'copy', joined]);
      let movie = joined;
      if (timeline.audio.length && timeline.format !== 'gif') {
        const args = ['-i', joined], filters = [], inputs = ['[0:a]'];
        for (let i = 0; i < timeline.audio.length; i++) {
          const track = timeline.audio[i], media = await asset(track.mediaId);
          if (!media.hasAudio || track.trimStart >= media.duration) throw new Error(`${media.name} has no audio at the selected trim point.`);
          const length = Math.min(track.duration, media.duration - track.trimStart, timeline.duration - track.start);
          args.push('-ss', String(track.trimStart), '-t', String(length), ...localInput(media.sourcePath));
          const label = `a${i}`;
          filters.push(`[${i + 1}:a:0]atrim=duration=${length},asetpts=PTS-STARTPTS,volume=${track.volume},adelay=${Math.round(track.start * 1000)}|${Math.round(track.start * 1000)}[${label}]`); inputs.push(`[${label}]`);
        }
        filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=first:normalize=0,alimiter=limit=0.95[audio]`);
        movie = path.join(work, 'mixed.mp4');
        await ff([...args, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(timeline.duration), movie]);
      }
      emit('encode', 85, `Encoding ${timeline.format.toUpperCase()}`);
      const rendered = path.join(work, `rendered.${timeline.format}`);
      if (timeline.format === 'mp4') await fs.copyFile(movie, rendered);
      else if (timeline.format === 'webm') await ff(['-i', movie, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-cpu-used', '5', '-row-mt', '1', '-threads', '2', '-c:a', 'libopus', '-b:a', '128k', '-progress', 'pipe:1', rendered], { duration: timeline.duration, progress: (fraction) => emit('encode', 85 + fraction * 14, 'Encoding WebM') });
      else await ff(['-i', movie, '-filter_complex', 'fps=12,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a', '-an', '-loop', '0', '-progress', 'pipe:1', rendered], { duration: timeline.duration, progress: (fraction) => emit('encode', 85 + fraction * 14, 'Encoding animated GIF') });
      if (job.controller.signal.aborted) throw new Error('Media export cancelled.');
      const temporary = path.join(path.dirname(destination), `.visro-${job.id}.${timeline.format}`);
      try { await fs.copyFile(rendered, temporary); await fs.rename(temporary, destination); } finally { await fs.rm(temporary, { force: true }); }
      emit('complete', 100, 'Your video is ready');
      return { saved: true, filePath: destination, name: path.basename(destination), duration: timeline.duration };
    } catch (error) {
      if (job.controller.signal.aborted) emit('cancelled', 0, 'Media export cancelled');
      throw error;
    } finally {
      activeExport = undefined;
      await fs.rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }

  function cancelExport() { if (!activeExport) return { cancelled: false }; activeExport.controller.abort(); return { cancelled: true }; }
  return { capabilities, importFiles, importBuffer, listMedia, removeMedia, asset, mediaResponse, probe, exportTimeline, cancelExport };
}

module.exports = { createMediaService, validateTimeline, mediaId };
