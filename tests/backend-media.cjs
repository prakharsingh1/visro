'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createMediaService, validateTimeline } = require('../electron/media.cjs');
const { decodeExport } = require('../electron/files.cjs');

const root = path.resolve(__dirname, '..');
const tools = path.join(root, 'build/media-tools');
const ffmpeg = path.join(tools, 'ffmpeg');
const run = promisify(execFile);
const ID = 'f45d84c5-05a9-4e42-a8bf-442b334be1bb';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5E0AAAAASUVORK5CYII=';

test('timeline validates duration, geometry, volume and opaque library IDs before launching an encoder', () => {
  const valid = validateTimeline({ name: '../film', width: 161, height: 90, format: 'mp4', clips: [{ kind: 'video', mediaId: ID, duration: 1.2, trimStart: .1 }], audio: [{ mediaId: ID, start: .2, volume: .3 }] });
  assert.equal(valid.width, 162);
  assert.equal(valid.duration, 1.2);
  assert.equal(valid.name, 'film');
  for (const clip of [{ kind: 'video', mediaId: '/etc/passwd', duration: 1 }, { kind: 'video', mediaId: ID, duration: -1 }, { kind: 'video', mediaId: ID, duration: 1, volume: '1;movie=secret' }, { kind: 'image', image: 'https://attacker.example', duration: 1 }]) assert.throws(() => validateTimeline({ width: 160, height: 90, format: 'mp4', clips: [clip] }));
  assert.throws(() => validateTimeline({ width: 160, height: 90, format: 'gif', clips: [{ kind: 'image', image: PNG, duration: 200 }] }), /2 minutes/);
});

test('HTML, CSV and text exports validate MIME and preserve UTF-8 bytes', () => {
  for (const [format, mime, text] of [['html', 'text/html', '<!doctype html><p>Visro café</p>'], ['csv', 'text/csv', 'Month,Sales\nJan,12'], ['txt', 'text/plain', 'A clear idea']]) {
    const exported = decodeExport({ name: `draft.${format}`, format, dataURL: `data:${mime};charset=utf-8;base64,${Buffer.from(text).toString('base64')}` });
    assert.equal(exported.name, `draft.${format}`);
    assert.equal(exported.data.toString('utf8'), text);
  }
  assert.throws(() => decodeExport({ name: 'draft', format: 'csv', dataURL: 'data:text/html;base64,PGI+' }), /chosen format/);
});

test('real bundled FFmpeg imports video/audio, persists catalog, serves seek ranges, and exports MP4/WebM/GIF', { skip: !existsSync(ffmpeg) }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'visro-media-integration-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const video = path.join(directory, 'fixture.mp4'), audio = path.join(directory, 'fixture.wav'), image = path.join(directory, 'fixture.png');
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=15:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=1', audio]);
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90', '-frames:v', '1', image]);
  const progress = [];
  const service = createMediaService({ directory: path.join(directory, 'library'), toolsDirectory: tools, onProgress: (item) => progress.push(item) });
  const capabilities = await service.capabilities();
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.bundled, true);
  assert.match(capabilities.version, /^9\.0\.2/);
  const assets = await service.importFiles([video, audio]);
  assert.equal(assets.length, 2);
  const movie = assets.find((item) => item.kind === 'video'), sound = assets.find((item) => item.kind === 'audio');
  assert.ok(movie.thumbnail.startsWith('data:image/jpeg;base64,'));
  assert.ok(sound.thumbnail.startsWith('data:image/jpeg;base64,'));
  assert.ok(movie.src.startsWith('visro://app/media/'));
  const restored = createMediaService({ directory: path.join(directory, 'library'), toolsDirectory: tools });
  assert.equal((await restored.listMedia()).length, 2);
  const seek = await service.mediaResponse(new Request(movie.src, { headers: { range: 'bytes=0-127' } }));
  assert.equal(seek.status, 206);
  assert.equal(seek.headers.get('Content-Length'), '128');
  assert.equal((await seek.arrayBuffer()).byteLength, 128);
  assert.equal((await service.mediaResponse(new Request(movie.src, { headers: { range: 'bytes=9999999999-' } }))).status, 416);
  const imageURL = `data:image/png;base64,${(await fs.readFile(image)).toString('base64')}`;
  for (const format of ['mp4', 'webm', 'gif']) {
    const destination = path.join(directory, `result.${format}`);
    const result = await service.exportTimeline({ name: 'Film', width: 160, height: 90, fps: 15, format, clips: [{ kind: 'video', mediaId: movie.id, trimStart: .2, duration: .6, volume: .4 }, { kind: 'image', image: imageURL, duration: .6, transition: 'fade' }], audio: [{ mediaId: sound.id, start: .1, trimStart: .1, duration: .8, volume: .3 }] }, destination);
    assert.equal(result.saved, true);
    const output = await service.probe(destination);
    assert.ok(Math.abs(Number(output.format.duration) - 1.2) < .2, `${format} must contain the rendered timeline duration`);
    assert.equal(output.streams[0].width, 160);
    assert.ok((await fs.stat(destination)).size > 100);
    if (format !== 'gif') assert.ok(output.streams.some(stream => stream.codec_type === 'audio'), 'Exported video must retain the mixed soundtrack');
  }
  assert.ok(progress.some((item) => item.phase === 'render'));
  assert.ok(progress.some((item) => item.phase === 'complete' && item.percent === 100));
  const overlayOutput = path.join(directory, 'overlay.mp4');
  await service.exportTimeline({ name: 'Overlay', width: 160, height: 90, format: 'mp4', clips: [{ kind: 'video', mediaId: movie.id, backgroundImage: imageURL, duration: .5, overlay: { x: 20, y: 10, width: 80, height: 46 } }] }, overlayOutput);
  assert.ok((await fs.stat(overlayOutput)).size > 100);
  await assert.rejects(service.exportTimeline({ name: 'bad', width: 160, height: 90, format: 'mp4', clips: [{ kind: 'video', mediaId: movie.id, duration: 1, trimStart: 10 }] }, path.join(directory, 'bad.mp4')), /enough video/);
  assert.deepEqual(await service.removeMedia(sound.id), { removed: true });
  assert.equal((await service.listMedia()).length, 1);
  const unchanged = path.join(directory, 'cancelled.mp4');
  await fs.writeFile(unchanged, 'Keep the previous export');
  let cancelling;
  const cancellationService = createMediaService({ directory: path.join(directory, 'library'), toolsDirectory: tools, onProgress: (event) => { if (event.phase === 'render' && !cancelling) { cancelling = true; cancellationService.cancelExport(); } } });
  await assert.rejects(cancellationService.exportTimeline({ name: 'Cancel', width: 160, height: 90, format: 'mp4', clips: [{ kind: 'image', image: imageURL, duration: 30 }] }, unchanged), /cancelled/);
  assert.equal(await fs.readFile(unchanged, 'utf8'), 'Keep the previous export');
  assert.deepEqual(cancellationService.cancelExport(), { cancelled: false });
});
