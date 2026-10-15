# Visro 0.3.0 validation

Verified on this Apple silicon Mac on 13–16 October 2026. Current sources substantially expand the local editor and repair the reported blank-artboard/edit freeze. This document separates completed checks from live model acceptance.

## Automated and browser checks

- Strict TypeScript typecheck passes. All **118 automated tests** pass, covering the engine, project format, portable image bundles, exported link transforms, formulas, native menus/clipboard, encrypted settings, Gemini requests, media processing, printing, font assets and secure routing.
- Process sampling found another packaged startup freeze: a passive secure-storage availability check blocked the main thread in macOS SecItemCopyMatching. Public settings now read only encrypted-key presence and model metadata; Explicit key save/use uses Electron’s non-blocking asynchronous encryption APIs; delayed-provider tests keep a heartbeat running and never call synchronous APIs. Key rotation preserves concurrent model edits and key replacement/removal.
- The reported design fixture remained rendered over reopen cycles. Real pointer drags, per-pixel text hit handling, purple hover outlines, transforms, groups and undo were exercised in Chromium. Selected-object actions and physical right-click now work; capture-phase context handling runs before Fabric stops the event.
- An integrated arrow test applied 100 ordinary Right keys, Shift+Right and Down, moved the element from (410.4,410.4) to (520.4,411.4), and restored the original fractional position with one Undo. A separate 1000-call nudge test completed in 174 ms without synchronous React callbacks, then emitted one frame/history update.
- A deliberate 1000 ms target-project load confirmed that a departing design's pending edits stay in that design, the new design keeps its own layers, input is blocked during loading and delayed startup cannot overwrite a newer choice. Save and Home wait for queued canvas operations. Single wheel movement pans exactly 100 px for a 100 px event; Ctrl-wheel uses exp(−0.003×delta) once, with no console errors.
- The 20-page repeated-photo storage fixture previously produced a 1083 ms frame gap. Deduplicated local blobs reduced the repeated save from 279 ms to 2.82 ms; first ingestion's observed maximum frame gap was 50 ms. Twelve storage checks cover nested original photos, filters, masks, media, versions, folders, stars, Trash and queued writes. These are measured fixture results, not a universal frame-rate guarantee.
- Layout acceptance covers 1440×960 and 1280×800, light/dark appearance, the 72 px rail, left 360 px Position drawer at y 153, right Comments, bottom Notes, real 110×70 page thumbnails, controls fitting the viewport and menus opening in both directions. A clean browser document registered 24 loaded FontFace entries across 22 families: the bundled 23 open faces plus local Canva Sans.
- Crop pointer/engine tests compare source-coordinate positions and preserve a 4:3 frame to within 0.001 px. The mask painter removes real alpha and restores pixels from the retained original source. Brand-kit tests save colors/fonts/logos and insert actual assets; rich-document and sheet edit/save/reopen/export checks pass.
- Actual downloaded PowerPoint contains editable text and shapes (one slide, two shape nodes, no page picture in the simple-object fixture). Actual linked PDF, HTML and PPTX contain the URI annotation, clipped polygon/noopener anchor and PowerPoint hyperlink relationship respectively. Two automated transform cases compare flipped, rotated and nested link bounds against Fabric geometry.
- Backend media checks actually run bundled FFmpeg/FFprobe for imports, seek ranges and MP4/WebM/GIF output. Rich-document native printing produced a valid six-page selectable-text PDF. AI network fixtures return real WAV/video bytes which are imported and played through the local media library; the Google requests themselves are mocked.

Browser evidence is in `output/playwright/`, including `project-switch-review.md`, `project-switch-regression.png`, `app-arrow-response.png`, the reference-layout screenshots, crop/mask/brand fixtures and downloaded export files. Export inspection is recorded in `output/export-roundtrip-validation.json`.

## 0.3.0 interaction and workflow checks

- Raster thumbnails and exports use a separate render target. Engine regressions verify actual painted pixels at three zoom levels and unchanged DOM dimensions, CSS size, cached pointer offset, selection and revision. Guide view ignores offscreen render events.
- Real pointer events exercise Option-drag on nested transformed groups, rotated selections and cropped/framed/filtered/flipped photos. Delayed decoding does not delay movement; original transforms/IDs remain, moved copies get unique recursive IDs, and one Undo/Redo restores the gesture. Locked multiple selections resist drag transforms.
- Guide tests cover fresh-bound snapping and exact movement when snapping is disabled. Browser checks cover ruler dragging, 10px guide nudging, Undo, margin view, grid gaps/margins, saved-page reopen, locking and Shift+R. Malformed imported guide metadata is normalized safely.
- Thirty-three browser workflow checks cover Sheets sorting, formula repair, row/column structure, undo/redo, cell navigation, multi-cell paste, Find/Replace and persistence; Docs literal matching across inline formatting, atomic Replace all Undo/Redo and persistent font styling; and shared topbar history routing.

## Native package acceptance

The signed Apple silicon **0.3.0 package passed** native acceptance. The runner verifies the app reports version 0.3.0. Fifty real drags and nine idle thumbnail/autosave windows retained correct geometry, then reopened at the saved position (822,153). Arrow and Shift+Arrow moved exactly 1px and 10px; hover preserved selection; all thirteen expected context-menu actions stayed inside the viewport and keyboard menu navigation did not move artwork.

A 50ms renderer heartbeat reached a maximum interval of **79.41ms**, with **zero browser long tasks** and no slow gaps in the completed run. The maximum staged gesture took 285ms, including deliberate input delays; it is not a measurement of single-frame latency. An earlier run during installer compression exceeded the responsiveness threshold while retaining correct object positions; it passed unchanged after compression completed. These are isolated test results, not a promise of constant frame rate under every machine load.

The package loaded 24 actual font faces, passed editable-object/plain-text/2×2 image clipboard round-trips and restored the original OS clipboard without recording its values. Native text Undo and Cmd+Y Redo worked. A cold local cutout produced a persisted 1024×683 PNG with 611,486 transparent pixels and 87,906 foreground pixels. Sandboxing, context isolation, blocked external renderer requests, local workers/WASM, async encryption API availability and bundled media tools passed. No smoke profile or process remained. Evidence: `output/playwright/native-v030-final.json` and the adjacent final screenshots.

The staged app and mounted DMG app both passed deep/strict codesign verification; hdiutil verified the DMG checksum. Runtime main/settings modules and built entry JS/CSS match the current source build. The installed app and existing user data are backed up outside Documents before replacement.

The prepared package includes 26 verified cutout model/runtime files, 21 open font families / 23 faces and signed Apple silicon FFmpeg/FFprobe. Canva Sans is read from the existing installed Canva package only at runtime; it is not redistributed.

## Live Gemini acceptance still required

No user key was supplied or searched for. Editable designs, writing, rewriting, summarizing, translation, remix/adaptation, image generation/editing, speech and Veo video are connected through fixed Google endpoints with response/error/timeout/cancellation and credential-boundary tests. They still require live acceptance after the user enters a valid key in File → Visro settings…. Model access, quota, billing and generated quality depend on that Google project.

## Scope and release properties

[FEATURES.md](FEATURES.md) and [PARITY.md](PARITY.md) identify remaining local limits. The installed Canva client informed visual and input behavior; private Canva server code and cloud services are not represented as replicated. Projects and Gemini-only operation follow the user's chosen scope.

Runtime npm audit reports zero known vulnerabilities. Eight moderate build-tool advisories remain in the sprintf-js dependency chain; those development modules are excluded from the app. Signing is ad hoc with no Apple notarization. Source is public at [prakharsingh1/visro](https://github.com/prakharsingh1/visro).

The native renderer uses sandboxing/context isolation, local secure-origin routing, blocked external renderer fetches and bundled inference workers/WebAssembly. CSP permits local evaluation required by the bundled ndarray accessor generator; the tested tradeoff is documented in electron/API.md.
