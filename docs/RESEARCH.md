# Visro implementation research

Reviewed 14 October 2026; installed Canva observations were made on 13 October. Visro is an independent design app inspired by Canva's familiar workflows, built with its own document format, interface, templates, and Gemini integration.

## What the requested REA fork does

[REA](https://github.com/morluto/rea) supplies agent tools for understanding application behavior and implementation. Its JavaScript/Electron analysis reports modules, imports, IPC boundaries, routes, and evidence. It is MIT-licensed analysis tooling, not a ready-made Canva editor or a source of Canva's cloud services. The fork is useful for research; the editor itself must be implemented separately.

## How ArtCraft approaches similar products

[ArtCraft's official apps page](https://getartcraft.com/apps) describes independent, native Rust implementations with familiar layouts and shortcuts, local files, public source code, and agent control channels. Its lineup includes image, vector, video, publishing, and other creative apps, with several still marked early alpha or in development.

[PhotoCraft's official repository](https://github.com/storytold/photocraft) explains the architecture: a document model and command engine, CPU and GPU compositors, tiled image storage, and a thin UI. It says its clean-room implementation uses public specifications and observed behavior, with no proprietary code or assets. It also explicitly says its early alpha is not yet a complete Photoshop replacement for professional daily work. That is the useful precedent for Visro: rebuild useful behavior and verify it, while recording actual gaps.

## Static evidence from the installed Canva Mac app

Only application package metadata and bundled application resources were inspected. No account data, cookies, passwords, project files, or licensing checks were accessed or changed.

Evidence on this Mac:

| Item                      | Observation                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Installed package         | `/Applications/Canva.app`                                                               |
| Bundle identifier         | `com.canva.CanvaDesktop`                                                                |
| Bundled package version   | `1.126.0`                                                                               |
| Resource archive          | `Contents/Resources/app.asar`, approximately 22 MB                                      |
| Package main entry        | `dist/main.js`                                                                          |
| Bundled boundary evidence | Electron `BrowserWindow`, `webContents.loadURL`, a `preload.js`, and an Electron bridge |
| Production origin string  | `https://www.canva.com`                                                                 |

These observations support an Electron desktop shell with web integration. They do not establish the internals of Canva's hosted AI models, stock-content services, or collaboration backend. Copying or extracting the shell would not recreate those services. Visro therefore implements its own local canvas and uses the user's Gemini key for generative features.

### REA inspection performed

The published **rea-agents 6.4.0** CLI was used for execution-free static analysis, without setup, global installation, agent configuration changes, runtime attachment, or hooks. The REA fork remains unchanged.

An initial bounded analysis of the installed `app.asar` inventoried **804 relevant files** and stopped after reporting `dist/main.js` (164/804), returning exit code 1. The filtered output did not retain its diagnostic reason, so neither a complete archive reconstruction nor a specific failure cause is claimed.

A smaller inspection succeeded on exact copies of **`package.json` and `dist/preload.js`**, whose SHA-256 values matched the originals' declared ASAR integrity values. REA read **8,029 bytes**, parsed **one JavaScript file**, visited **956 AST nodes**, and reported **zero parse failures**. Its graph recorded Canva package version **1.126.0**, the declared main entry **`dist/main.js`**, and a literal **`require('electron')`** reference in the preload at line 1, columns 298–317. These are package/AST observations; they do not prove runtime execution. The declared main target and external Electron import remain unresolved within this two-file subset. Zero recovered bridge/IPC counts are not evidence that those boundaries are absent from Canva.

The concise result is saved at `output/research/rea-canva-findings.json`, the exact file digests at `output/research/rea-canva-subset-provenance.json`, and full subset evidence at `output/research/rea-canva-subset-evidence.json`. `output/research/rea-command-scope.json` records both commands and limitations. The full original archive's SHA-256 is `77be1417d9646cf72394c0a4304c1b960395af125a4f347191ef94f86a2144ba`. Coverage is complete for the admitted two-file subset only. No extracted application source was copied into Visro's implementation.

For the product surface, Canva's [official Mac app listing](https://apps.apple.com/us/app/canva-ai-photo-video-editor/id897446215?platform=mac) documents templates, photo and video tools, Magic Studio, Brand Kit, collaboration, printing, websites, and social scheduling. The [official Background Remover help page](https://www.canva.com/help/background-remover/) documents separate photo and video workflows and erase/restore refinement. Visro's current implemented workflows and remaining boundaries are recorded in [FEATURES.md](FEATURES.md) and [PARITY.md](PARITY.md).

## Visual and input reference

Visible chrome and menus in the installed **Canva 1.126.0** app were observed separately from the static REA analysis. The current dark Home has a 72px collapsed rail, rounded main surface, gradient heading, broad purple-bordered search and twelve circular quick-create categories. The editor uses 40px native tabs, a 56px gradient header, 72px rail, floating context toolbar and a dark workspace near `#0e1013`. Position is a 360px drawer on the **left**, Comments opens on the right, and Notes below the canvas. Position's Arrange/Layers tabs, order/alignment controls and advanced geometry fields were checked directly.

The icon observations included the Brand briefcase with infinity mark; Elements heart, triangle, music and circle; Tools pen with lower squiggle; Components nested hexagons; empty rounded Comments bubble; and the quick-create pie/easel presentation, heart chat bubble and whiteboard crop frame. Visro's SVG glyphs are its own recreations from observed geometry. No complete proprietary editor icon source was recovered or copied, and pixel-identical original glyphs are not claimed.

Native menu labels confirmed `⌘C` Copy, `⌘V` Paste, `⌘D` Duplicate, `⌥⌘C` Copy style, `⌥⌘N` Comment, `⌘]`/`⌘[` forward/backward and `⌥⌘]`/`⌥⌘[` front/back. Other shortcut equivalence is not inferred from generic macOS conventions. Actual Visro keyboard/pointer checks are described below and in release validation.

### Font source and distribution

The installed package's `dist/renderer/desktop_chrome_v2/static_font_4.ltr.css` declares **Canva Sans**, normal weights 400–700, split into Latin, Latin-extended and symbol subsets. The fixed Latin WOFF2 is `images/cff149ee1e9d2be50ac77bcd86769d05.woff2`, **38,848 bytes**. WOFF metadata identifies Colophon Foundry's 2021 copyright; no redistribution grant was found in that metadata.

Visro reads this fixed, bounded font resource only at runtime from the user's existing Canva installation and registers a FontFace for the interface. It does not copy the proprietary binary into its repository, application package or downloadable release. Missing Canva/font resources use the system fallback. Evidence is saved in `output/research/canva-bundled-font-manifest.json` and `canva-bundled-font-metadata.json`.

The separate design-font catalog contains **21 open font families and 23 faces**, prepared from the pinned Google Fonts commit in `scripts/font-manifest.json`. Converted WOFF2 files retain the full glyph repertoire and variable axes, with source/output SHA-256 values and per-family OFL notices. Local font upload remains available. The current browser verified **24 loaded FontFace entries**, including the installed Canva Sans; multiword family names are normalized when checking their serialized names. `document.fonts.check()` alone is insufficient because it can report success through fallback fonts.

## Real local background removal

Visro uses [`@imgly/background-removal`](https://github.com/imgly/background-removal-js), pinned to **1.7.0**, with **onnxruntime-web 1.21.0**, matching the published package's peer dependency. The published README mentions an older prerelease runtime command; the package metadata is the version authority for this build.

The source helper invokes an IS-Net foreground segmentation model, applies its mask to the input image's alpha channel, and returns PNG. It does not paint a white background, request a Gemini image, or upload the photo.

The preparation script fetches the [official versioned asset manifest](https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/resources.json), checks its pinned SHA-256, and downloads only the fp16 model plus CPU WASM/module resources. Every downloaded chunk is verified against both its byte count and SHA-256. The selected resources total **99,998,062 bytes**, approximately **95.4 MiB**, across 26 content-addressed chunks. Models are bundled into the build, so the installed app requires no first-use model download. Re-running preparation reuses verified chunks.

Integration requirements:

- Serve `public/background-removal/1.7.0/` beside the built `index.html`; Vite copies it into `dist`.
- A packaged Electron app must serve these assets through a fetch-capable secure application protocol or a loopback origin. Plain `file:` loading is not a reliable fetch origin for this inference library.
- CSP permits local connections and `blob:` fetches, local/blob module scripts, WASM compilation (`'wasm-unsafe-eval'`) and blob workers. The bundled library's ndarray accessors use `new Function`, so its local runtime also requires `'unsafe-eval'`. The packaged renderer still blocks external fetches and has no Node access; Google requests run through the main process. No external image-removal origin is required.
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` enable shared-memory multithreading where supported. Without cross-origin isolation, ONNX can fall back to one thread; cutouts take longer.
- CPU inference was selected for predictable device compatibility. Runtime memory use is larger than the model's disk size, and the first cutout initializes an inference session. Hair, glass, complex backgrounds and multiple subjects can need the included erase/restore brush.

The dependency is AGPL-3.0. Visro uses `AGPL-3.0-only` for its source distribution and preserves dependency notices. IMG.LY offers alternate licensing through its published contact. This is a dependency choice, separate from the MIT license of the REA research fork.

### Verification completed during implementation

- The standalone TypeScript helper passed strict typechecking.
- All 26 asset chunks passed size and SHA-256 checks. A subsequent preparation reused all 26 verified files.
- In Chrome, the helper processed the [official library's photograph fixture](https://github.com/imgly/background-removal-js/blob/main/packages/node-e2e/fixtures/images/photo-1686002359940-6a51b0d64f68.jpeg). The PNG retained its 1024 × 683 dimensions and contained 611,486 fully transparent pixels plus 87,906 subject/edge pixels. The before/after screenshot was visually inspected: the person remained while the bridge and city disappeared.
- Every model/runtime request in that run used the local development origin; no photograph or model request went to an external server.
- Repeating the operation after putting the browser offline returned the same PNG byte-for-byte using the initialized local session.
- The initial helper test used a non-isolated development origin and correctly fell back to one thread. Separate packaged validation then confirmed a secure, cross-origin-isolated `visro://app` origin, local model fetches, workers/WASM, blocked external renderer fetches and a real cutout PNG. The earlier 0.2.0 package retained 1024 × 683 dimensions with 611,486 fully transparent and 87,906 subject/edge pixels, and persisted the PNG. Exact build evidence is in `output/packaged-native-v020-validation.json`; final acceptance for the newest UI remains separate.
- Erase/restore refinement was exercised through actual brush input: erase produced RGBA `[0,0,0,0]`, restore recovered `[51,102,153,255]`, and the applied output was a 200 × 140 PNG. The original source remains available for later restoration. Latest packaged refinement acceptance remains part of release validation.

## Interaction and storage measurements

Real Chromium pointer tests kept a 2048px JPEG visible through 100 drags with exactly 100 commits. Under concurrent builds, observed frame intervals were p95 33ms and maximum 84ms. Hover produced 2,960 purple outline pixels with no selection/history callbacks. Empty-textbox hit handling and first-press dragging passed. A 1,000-nudge engine burst took 174ms with no synchronous callbacks and one frame callback; the integrated App test made 102 keyboard moves with the exact expected `(+110,+1)` result, then restored fractional coordinates with one Undo. These are measured tests, not a promise of constant 60fps.

An earlier save of a repeated 4MB photo across twenty pages took 1,232ms initially and 279ms on repeat, with a 1,083ms frame gap. Normalizing source images into deduplicated local blobs reduced the measured first save to 126.8ms, repeat save to 2.82ms, summary listing to 4.32ms, opened-design hydration to 2.51ms and the observed frame gap to 50ms. Twelve hydration/legacy/library/version assertions passed. Library/Home views now use summaries; only an opened design is hydrated. Portable export packs reused image bytes once and expands references on import. Final native round-trip acceptance is recorded by the release checks.

Crop pointer tests moved raw coordinates `(100,75)` to `(140,95)` and resized 200 × 150 to 240 × 180 while preserving 4:3. Applied coordinates matched within 0.001; source/frame/filter/undo engine checks passed. A local brand kit was saved with three fonts and a logo, and its SVG logo inserted as an editable layer. These browser checks complement the automated engine and application checks; they do not substitute for final packaged acceptance.

## Final browser interface checks

Nine focused layout checks passed at 1440px and 1280px in light and dark themes. They covered the collapsed Home rail and quick-create row, exact editor rail order, closed default panels, matched canvas/viewport origins, left Templates/Position, right Comments, bottom Notes, floating controls, real page thumbnails, and context menus that remain inside the viewport. A real right-click near the right edge opened its Layer submenu to the left. A fresh reload recorded all 24 expected font faces with `status === 'loaded'`.

Actual Copy → right-click Paste was checked against one fixed saved project, after allowing clipboard access in the isolated browser test context. With a 400ms delay, its persisted object count changed from 8 to 9. With no inserted delay, it changed from 9 to 10. The project ID and name remained unchanged. This checks both UI actions and autosave; it does not infer success from a DOM layer count. Reports are `output/playwright/reference-layout-validation.json`, `output/playwright/reference-interaction-validation.json` and `output/playwright/clipboard-ui-validation.json`. The interaction report retains earlier inconclusive clipboard/position timing failures; the final dedicated clipboard report supersedes its clipboard attempt. Native acceptance belongs to the exact packaged build recorded in VALIDATION.md.

## Generative AI boundary

The Gemini key belongs to the user and is stored through macOS-backed encryption in the main process. The renderer receives configuration status rather than a saved plaintext key. Text/design/image operations, speech generation and Veo video requests are implemented through the Gemini API. Google's [speech generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation) and [video generation documentation](https://ai.google.dev/gemini-api/docs/video) provide the request/response contracts. Voice output is decoded to WAV; video operations are polled with progress/cancellation and their returned media is imported into the local library.

These requests require internet, an API-enabled project and access to the configured models. Quota and billing belong to that Google project. Local background removal and ordinary editing do not require a Gemini key. Transport/parser tests do not establish live model success: real generation remains pending a user-entered key and response. No stored credential was searched for, and no placeholder image or video is represented as a successful model result.
