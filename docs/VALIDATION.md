# Visro 0.2.0 validation

Verified on this Apple silicon Mac on 13–14 October 2026. Current sources substantially expand the local editor and repair the reported blank-artboard/edit freeze. This document separates completed checks from live model acceptance.

## Automated and browser checks

- Strict TypeScript typecheck passes. All **107 automated tests** pass, covering the engine, project format, portable image bundles, exported link transforms, formulas, native menus/clipboard, encrypted settings, Gemini requests, media processing, printing, font assets and secure routing.
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

## Native package acceptance

Final packaged acceptance is recorded below after the rebuilt app is verified. Earlier native source checks passed atomic editable-object/plain-text/image clipboard handling and restored the original clipboard without logging its contents. Native menu tests keep Undo/Redo in focused text fields and register Cmd+Y.

The prepared package includes 26 verified cutout model/runtime files, 21 open font families / 23 faces and signed Apple silicon FFmpeg/FFprobe. Canva Sans is read from the existing installed Canva package only at runtime; it is not redistributed.

## Live Gemini acceptance still required

No user key was supplied or searched for. Editable designs, writing, rewriting, summarizing, translation, remix/adaptation, image generation/editing, speech and Veo video are connected through fixed Google endpoints with response/error/timeout/cancellation and credential-boundary tests. They still require live acceptance after the user enters a valid key in File → Settings. Model access, quota, billing and generated quality depend on that Google project.

## Scope and release properties

[FEATURES.md](FEATURES.md) and [PARITY.md](PARITY.md) identify remaining local limits. The installed Canva client informed visual and input behavior; private Canva server code and cloud services are not represented as replicated. Projects and Gemini-only operation follow the user's chosen scope.

Runtime npm audit reports zero known vulnerabilities. Eight moderate build-tool advisories remain in the sprintf-js dependency chain; those development modules are excluded from the app. Signing is ad hoc with no Apple notarization or public-release claim.

The native renderer uses sandboxing/context isolation, local secure-origin routing, blocked external renderer fetches and bundled inference workers/WebAssembly. CSP permits local evaluation required by the bundled ndarray accessor generator; the tested tradeoff is documented in electron/API.md.
