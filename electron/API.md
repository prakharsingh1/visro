# Visro desktop bridge

`window.visro` is available inside the desktop editor. All calls return Promises, except `onMenu`. Errors reject with a readable message. Canceled native dialogs return `null`. The browser preview has no desktop bridge.

```ts
getSettings(): Promise<{
  hasKey: boolean;
  textModel: string;
  imageModel: string;
  voiceModel: string;
  videoModel: string;
  secureStorage?: boolean;
  encryptionAvailable?: boolean;
}>;
saveSettings({ apiKey?, clearKey?, textModel?, imageModel?, voiceModel?, videoModel? }): Promise<Settings>;
listModels(): Promise<Array<{ name: string; displayName: string; description: string; image: boolean }>>;
runAI({ kind: 'design' | 'copy' | 'image' | 'edit', prompt: string, width?, height?, image?: string }):
  Promise<{ design?: DesignSpec; text?: string; image?: string }>;
openProject(): Promise<{ project: unknown; filePath: string; name: string } | null>;
saveProject({ project: unknown, name?: string, saveAs?: boolean }):
  Promise<{ saved: true; filePath: string; name: string } | null>;
exportFile({ name: string, format: 'png' | 'jpg' | 'jpeg' | 'svg' | 'pdf', dataURL?: string, svg?: string }):
  Promise<{ saved: true; filePath: string; name: string } | null>;
openExternal(url: string): Promise<true>;
onMenu(callback: (action: string) => void): () => void;
```

`image` requests generate a new raster; `edit` requires an input PNG/JPEG/WebP base64 data URL. Input/returned AI images are capped at 15 MB. `copy` returns usable text. `design` returns a validated editable layout of text, rectangles, and circles, with `name`, `width`, `height`, `background`, and `elements`; each element includes `x`, `y`, `width`, `height`, `fill`, `opacity`, `angle`, and its compatible `rotation` alias. Text elements add `text`, `fontSize`, `fontFamily`, `fontWeight`, `align`.

Settings never return the API key. Omitting `apiKey`, or passing an empty string, preserves the existing key; `clearKey: true` deletes it. Saving a nonempty key encrypts it using Electron `safeStorage`/the macOS keychain. The main process persists only the ciphertext in its application support folder, with file mode `0600`. AI requests send the key in an HTTPS header directly to Google's fixed Gemini endpoint. The renderer cannot read stored credentials or customize the API URL.

Passive `getSettings()` reads only encrypted-key presence and model metadata. It never probes, encrypts or decrypts; startup, appearance/model changes and key deletion also avoid Keychain access. The optional `secureStorage` and `encryptionAvailable` fields are absent while capability is unknown. Explicit nonempty-key save and credential use rely exclusively on Electron 44's non-blocking `isAsyncEncryptionAvailable`, `encryptStringAsync` and `decryptStringAsync` APIs; synchronous APIs are never a fallback. Availability is cached for later public metadata reads. macOS can request Keychain access at that deliberate operation while the editor's event loop remains responsive. Async decryption accepts existing ciphertext; `shouldReEncrypt` triggers protected re-encryption and a serialized compare-and-update against the latest key, preserving concurrent model changes and respecting explicit key removal/replacement. See [Electron's async secure-storage recommendation](https://www.electronjs.org/docs/latest/api/safe-storage).

Menu actions: `new`, `open`, `save`, `save-as`, `export`, `settings`, `undo`, `redo`, `copy`, `cut`, `paste`, `select-all`, `zoom-in`, `zoom-out`, `fit`. Native Undo/Redo/Cut/Copy/Paste/Select All perform normal system editing when an input, textarea or editable region is focused; this includes the design name, settings, notes, document and Fabric's hidden text editor. Otherwise they notify the canvas editor. Redo accepts Cmd+Shift+Z and Canva's Cmd+Y alternate on Mac. Canvas paste always delegates to the validated clipboard bridge. Native Save reuses the last native project destination. Save As always displays a native dialog. New from the native menu clears the last project destination; renderer-created fresh designs should use `saveAs: true` on their first save.

Project JSON and exports are capped at 100 MB. Project JSON is stripped of prototype-manipulation keys; the renderer must additionally run its project version/geometry validation before loading. Export PNG/JPEG/PDF takes a base64 data URL matching the chosen MIME type; PDF should be rendered with jsPDF before calling the bridge. SVG accepts a string and rejects scripts, event handlers, foreign objects, and remote references.

Production assets are served from the secure `visro://app` origin, including local background model/WASM files. CSP permits local scripts, workers, WebAssembly, styles and data/blob images, and blocks renderer network access to third-party origins. Cross-origin isolation enables local ML workers. Development loads only `http://127.0.0.1:5173/` when `VISRO_DEV_URL` is set.

The protocol handler sets CSP, COOP, COEP, CORP, MIME, and nosniff headers on its returned `Response` directly. Local data/blob fetches are permitted for cutout image decoding and runtime chunks. Symlinks outside the built asset directory, foreign initiator origins, and non-read requests are blocked.

CSP tradeoff: IMG.LY 1.7.0 bundles `ndarray`, which constructs typed-array accessor functions using `new Function` (`node_modules/@imgly/background-removal/dist/index.mjs`, lines 88, 92, and 219). A real cold native cutout failed with `unsafe-eval` blocked, so production permits JavaScript string evaluation for this local dependency as well as WebAssembly. This reduces CSP's protection if an attacker already gains JavaScript execution in the renderer. External scripts and renderer network connections remain blocked; production inline scripts are blocked; the renderer retains Electron sandboxing, context isolation, no Node globals, validated IPC inputs, and no access to the stored Gemini key. Bundled model/runtime assets are local, and no third-party code is fetched at runtime.

After `npm run build` and local model preparation, run `node electron/native-smoke.cjs` for a cold production-origin desktop check. A packaged build can be checked with `node electron/native-smoke.cjs --app '/absolute/path/Visro.app'`; add `--screenshot '/absolute/path/native-smoke.png'` to capture the editor. This uses Node's native CDP client with an ephemeral loopback debugging port, then closes its child process. It verifies the actual secure origin, isolated renderer, native bridge, bundled FFmpeg, local cutout manifest, data/blob fetches, worker, WebAssembly, external network blocking, and absence of key material from settings. It never submits a Gemini request or changes keys. All projects written by optional fixture checks remain in a disposable Chromium profile.

Add `--cutout '/absolute/path/photo.jpeg'` for a full local segmentation check in the smoke process's temporary Chromium profile. It imports the image through the actual file input, clicks Remove background, then reads the autosaved PNG and counts transparent versus retained pixels. This changes only the isolated test profile and verifies real transparency rather than relying on a completion message. Allow up to three minutes for a cold local inference.

Add `--project '/absolute/path/user-project-repro.visro'` for the saved-project movement regression. It seeds the disposable local library, opens the project through Home, performs 50 real native pointer drags on the fixture's pink circle, measures renderer heartbeat gaps, verifies autosaved coordinates, reloads, and checks restored pixels and subsequent selection. Pixel tests wait for actual rendering, and coordinate comparisons account for the inspector's whole-pixel display rounding. Screenshots include a separate `-gestures.png` view.

No additional runtime npm dependencies are required by `electron/*`; the service uses Electron and Node's native `fetch`. Tests use Node's built-in `node:test`.

## Local video and audio

Additional `window.visro` methods are typed in `src/bridge.ts`:

```ts
getMediaCapabilities(): Promise<{available:boolean;videoExport:boolean;formats:('mp4'|'webm'|'gif')[];engine:'ffmpeg'|null;bundled:boolean;version?:string}>;
importMedia(kind?: 'video'|'audio'|'all'): Promise<MediaAsset[]>;
listMedia(): Promise<MediaAsset[]>;
removeMedia(id: string): Promise<{removed:boolean}>;
openMedia(id: string): Promise<void>;
exportTimeline(input: TimelineExport): Promise<{saved:true;filePath:string;name:string;duration:number}|null>;
cancelMediaExport(): Promise<{cancelled:boolean}>;
onMediaProgress(callback: (progress: MediaProgress) => void): () => void;
```

Media imports use a native file dialog. The main process copies source bytes into a persistent private local library, probes duration and streams, creates H.264/AAC MP4 or AAC M4A previews, and generates video thumbnails or audio waveforms. Assets return UUIDs, display names, duration, dimensions, a thumbnail, and a same-origin `visro://app/media/<uuid>` URL. Ranged responses support video/audio seeking. The renderer cannot request arbitrary filesystem paths. Supported source extensions are MP4/MOV/M4V/WebM/MKV/AVI and MP3/WAV/M4A/AAC/Ogg/FLAC/Opus; imports are capped at 1 GB and 1 hour per file.

Timeline export accepts sequential `clips` with `kind:'video'|'image'`, `mediaId` or PNG/JPEG/WebP `image` data URL, `duration`, `trimStart`, `volume`, `fit:'contain'|'cover'`, and `transition:'none'|'fade'`. A video can include a `backgroundImage` and `overlay:{x,y,width,height}` to render it over a design. Global audio tracks have `mediaId`, `start`, `trimStart`, `duration`, and `volume`. Rendering performs real trims, canvas fitting, fade-ins, sequential scenes, original clip audio, and mixed delayed soundtrack tracks. MP4 uses H.264/AAC, WebM VP9/Opus, and GIF a generated palette. GIF is silent. Exports are limited to 100 scenes, 16 audio tracks, 3840 pixels per dimension, 60 fps, and 1 hour; GIFs are limited to 2 minutes. Scene images total up to 80 MB.

Progress messages include a `jobId`, phase (`import`, `render`, `mix`, `encode`, `complete`, `cancelled`), percent, and message. Cancellation stops the encoder and leaves any previous destination file intact. The completed movie is written to a temporary file beside the native save destination and renamed only after success.

`scripts/prepare-media-tools.mjs` downloads pinned signed Apple Silicon FFmpeg/FFprobe 9.0.2 ZIPs from [Martin Riedl's build server](https://ffmpeg.martin-riedl.de/), validates published SHA-256 checksums, checks the runtime version and absence of `--enable-nonfree`, and caches tools in `build/media-tools`. The packaged app expects that directory copied to `resources/media-tools`; binaries depend on macOS system frameworks, without Homebrew or user PATH. GPLv3 license, exact build configuration, publisher and corresponding source references are included beside the tools. These tools run as separate local subprocesses without a shell, and imported file protocols/formats are restricted to local media.

## Additional Gemini and file operations

`runAI` also accepts `translate`, `rewrite`, and `summarize`, with a source `text` (up to 40,000 characters), optional `language`/`tone`, and an optional additional `prompt`. Each returns `{text}`. `remix` and `resize` accept an existing editable `design` and target `width`/`height`, use structured Gemini generation, preserve editable text/shapes, and return `{design}` constrained to those dimensions. Existing encrypted-key storage and direct Google-only requests are unchanged. These actions require a saved key; no cloud project synchronization is implemented.

`runAI({kind:'voice',prompt,voiceName?,tone?,text?,requestId?})` generates single-speaker speech using the saved `voiceModel` (default `gemini-3.1-flash-tts-preview`). The 30 Google prebuilt voice names are validated, with Kore as default. Gemini PCM audio is wrapped in a signed 16-bit little-endian WAV container at the response's declared sample rate (24 kHz mono by default); newer editable TTS models may return a complete WAV directly. Speech is capped at 12,000 input characters and 40 MB returned audio. Output bytes are imported by the main process into the persistent local media catalog, converted into a playable preview with waveform, and returned as `{media:MediaAsset}`.

`runAI({kind:'video',prompt,aspectRatio?:'16:9'|'9:16',durationSeconds?:4|6|8,image?,requestId?})` uses saved `videoModel` (default `veo-3.1-generate-preview`). It submits the documented Google `predictLongRunning` request at 720p, polls the validated model operation every ten seconds for up to ten minutes, then downloads and locally imports the generated MP4. An optional initial PNG/JPEG/WebP is sent as inline bytes. Prompts are capped at 4,000 characters and downloads at 200 MB. Voice/video model choices are editable, persisted with settings, and never change the API host. Google account/model access, billing and quota determine availability; no generation request is made during automated testing.

Generated video file URLs are validated and rebuilt as Google's fixed `files/<id>:download?alt=media` endpoint. Downloads use manually checked HTTPS redirects to the exact Google API or Google Storage host; the API key header is stripped on storage redirects, and the Gemini key is never placed in a URL. Arbitrary hosts, file paths, credentials, operation path injection and oversized responses are rejected. Voice/video generation happens in the main process; the renderer receives only a local library asset and progress.

`onAIProgress(callback)` returns an unsubscribe function and reports `{requestId,kind,phase,percent,message}` for voice/video jobs. Phases are `generate`, `poll`, `download`, `import`, `complete`, `cancelled`; polling percentages describe waiting activity rather than Google's unknown render completion. `cancelAI(requestId)` returns `{cancelled:boolean}`, aborts pending requests, polling, downloads and library preparation, and releases the busy state. There is no documented Gemini Veo server-cancellation endpoint in the official SDK: stopping Visro's wait does not guarantee that Google stops an accepted render or its billing. Native quit aborts pending local jobs.

`exportFile` additionally accepts HTML (`text/html`), CSV (`text/csv`), TXT (`text/plain`), and PPTX (`application/vnd.openxmlformats-officedocument.presentationml.presentation`). All use strictly validated base64 data URLs; UTF-8 charset metadata is supported. PPTX must have a ZIP header and required PowerPoint package entries. HTML is exported as a file, never executed in a privileged Electron window.

`printDocument({html:string,name:string})` returns `{saved:true,filePath,name}` or `null` after cancellation. The native save dialog chooses the PDF destination. Rich document HTML is capped at 5 MB and parsed into an inert DOM in a separate, hidden Electron window with an ephemeral session, sandboxing, context isolation, no preload/Node access, denied permissions and navigation, and CSP `script-src 'none'; connect-src 'none'; img-src data:`. The service removes executable/embedded/form elements, event handlers, external references, arbitrary styles, and remote images, retaining rich text, headings, lists, tables, and inline PNG/JPEG/WebP. Only fixed local print styles are installed. Chromium produces selectable text and A4 pagination via `webContents.printToPDF`; the print window is destroyed after success/failure/timeout. Run `electron scripts/print-smoke.cjs output/fixtures/native-document.pdf` to exercise real printing with malicious-content removal and a six-page document fixture.

Implementation references (checked 2026-10-13): [Gemini model listing](https://ai.google.dev/api/models), [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [Electron printToPDF](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions), [Electron WebRequest](https://www.electronjs.org/docs/latest/api/web-request).

Voice/video references: [Gemini speech generation](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation), [Gemini 3.1 Flash TTS model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview), [Veo generation, parameters and limitations](https://ai.google.dev/gemini-api/docs/veo), [Google SDK video file downloads](https://github.com/googleapis/js-genai/blob/main/src/node/_node_downloader.ts), [Google SDK video operation polling](https://github.com/googleapis/js-genai/blob/main/src/operations.ts).

## Installed local typeface

`getLocalTypeface(): Promise<{name:string;data:string}|null>` reads the known Canva Sans Latin WOFF2 resource only from an existing `/Applications/Canva.app` installation. It accepts no path or other input, reads at most 1 MB, validates the file size, WOFF2 signature and declared length, and returns a font data URL. Missing or changed installations return `null` for the renderer's fallback font. Electron's ASAR filesystem support reads the installed archive directly. The proprietary font is not copied into Visro source, distribution files, caches or saved projects. Run `electron scripts/verify-local-typeface.cjs` to check actual ASAR reading and browser font decoding without saving or printing font bytes.

`src/font-catalog.ts` exports `FONT_FAMILIES` and `loadDesignFonts():Promise<void>`. Twenty-one open-source families are bundled offline as 23 WOFF2 faces (2.66 MB), including real Poppins/Lato regular/bold and complete variable axes where available. The loader fetches only same-origin packaged files in parallel, memoizes completion, and is awaited before restoring projects. All Unicode glyphs, outlines, original names and font metadata are preserved during WOFF2 compression. Each family’s OFL-1.1 copyright/license and source/SHA-256 provenance is distributed in `fonts/`.

`node scripts/prepare-fonts.mjs` verifies packaged hashes and needs no network or Python when the committed assets are intact. Missing files are restored only from the pinned official [Google Fonts repository](https://github.com/google/fonts/tree/66928797f271fed5ee428544e7229685e2d90127), checking source and generated-file checksums. Conversion uses FontTools 4.60.1 and Brotli 1.1.0 in a build-only Python environment; `VISRO_FONT_PYTHON` can select that interpreter. Run `electron scripts/verify-local-typeface.cjs --catalog` to decode every face in a real isolated browser window, or add `--fonts` to the native smoke runner to verify the actual production renderer’s loaded fonts and installed typeface bridge.

## Canvas clipboard

`writeCanvasClipboard({objects:Record<string,unknown>[],plainText?:string}):Promise<boolean>` uses Electron 44's atomic `ClipboardItem` API to commit raw OS format `app.visro.objects` and `text/plain` together. It clears stale image formats as part of the same write. The object marker contains a versioned sanitized JSON payload; text defaults to `Visro elements`. The main process accepts no arbitrary clipboard formats from the renderer.

`readCanvasClipboard():Promise<{kind:'objects';objects:Record<string,unknown>[]} | {kind:'image';data:string} | {kind:'text';text:string} | null>` is called only in the renderer's explicit user paste flow. Service initialization, project restore and copy never inspect clipboard contents. Each paste reads the current system clipboard, preferring the Visro marker, then PNG/JPEG, then plain UTF-8 text; it ignores HTML and foreign formats. Native images return PNG data URLs. External copy operations replace Visro's marker, so stale internal objects cannot override newly copied text or images.

Payloads are limited to 20 MB, 100 selected objects, 2,000 nested layers and depth 20. Project parsing strips prototype manipulation; layer types, finite geometry, event properties, external/executable styles and source URLs are validated before insertion. Objects retain only embedded raster images and sanitized link metadata. PNG/JPEG dimensions are inspected before native decoding, with a 32 megapixel limit; clipboard object rasters also have bounded PNG/JPEG/WebP/GIF dimensions. Invalid markers fail safely. All calls require the trusted top-level editor frame, as other IPC does. Unit tests use mocks and do not touch the system clipboard. Reference: [Electron clipboard and atomic ClipboardItem writes](https://www.electronjs.org/docs/latest/api/clipboard).

The explicitly authorized native smoke flag `--clipboard` verifies actual editable-object, external text and raster paste plus focused text Undo/Redo. It enables an ephemeral loopback main-process inspector in that isolated test instance only. Before fixtures, all current ClipboardItems are materialized and an atomic original-content round-trip confirms preservation. Original bytes and format names remain solely in main-process memory and never enter a report. Unavailable or oversized backups skip the test without fixtures. Restoration runs after every assertion outcome with retries; if it cannot be confirmed, the backup-owning native process is retained rather than erased. The flag neither changes production bridge permissions nor reads clipboard contents during ordinary startup.
