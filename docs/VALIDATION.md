# Visro 0.1.0 validation

Verified on this Apple silicon Mac on 13 October 2026.

## Completed checks

- TypeScript strict typecheck passed.
- All 40 automated tests passed: 30 desktop/service/security/cleanup tests and 10 project/editor tests.
- Fourteen additional Chromium editor assertions covered text edits, undo/redo, grouping transforms, multipage AI insertion, image replacement, cumulative image filters, viewport-independent export, true PNG alpha, SVG, and project reopening.
- Native project saving used the actual macOS save dialog. The saved `.visro` file preserved the starter page's eight editable layers. Native PNG export produced a 2160 × 2160 image. Native PDF export used the actual save dialog and opened as a valid one-page PDF.
- Multi-page PDF export returned two correctly sized pages. The final compressed PDF was 197,767 bytes; PDF preserves the rendered layout as raster page images. SVG retains vector elements.
- The signed packaged app launched at `visro://app/index.html` with sandboxing/context isolation, a secure origin, cross-origin isolation, working local assets, workers, and WebAssembly. The renderer could not access Node or stored key material; external renderer fetches were blocked.
- A cold packaged UI run imported the official library's 1024 × 683 photo fixture, clicked **Remove background**, and inspected the persisted PNG. It contained 611,484 fully transparent pixels and 87,908 retained foreground/edge pixels. Visual inspection confirmed the person remained and the surrounding city disappeared. The earlier browser offline repeat returned the same PNG byte-for-byte.
- Every bundled background model/runtime chunk passed its pinned size/SHA-256 checks; no first-use model download is required.
- The complete app passed `codesign --verify --deep --strict`. The DMG passed checksum verification; its mounted read-only app also passed deep/strict verification. Signing is ad hoc, with no Apple notarization or public-release claim.
- Runtime dependency audit reported zero known vulnerabilities. The build-tool dependency chain has eight moderate npm advisories rooted in the current `sprintf-js` dependency; those modules are excluded from the shipped app. No high/critical advisory was reported.

Evidence from the working checkout: `output/packaged-native-validation.json`, `output/playwright/visro-native-final.png`, `output/Visro-Native-Check.visro`, `output/Visro-Native-Check.png`, and the PDF exports in `output/` and `output/playwright/`.

## Required live AI check

No user Gemini API key was supplied or searched for. Design, writing, image generation, and image editing are wired through Google's REST API, with request/response/error handling checked using mock-network tests. These features still require live verification after the user enters a valid key in the Mac app. Availability, model access, quota, and billing depend on the user's Google project.

## Scope and remaining release work

This is the first Visro build, not every Canva feature. See FEATURES.md for explicit gaps. Public release still needs the relevant Apple Developer signing/notarization setup, live Gemini acceptance testing, broader device testing, and a review of distribution requirements for the AGPL dependency.

The production CSP permits local JavaScript evaluation because IMG.LY's bundled `ndarray` generates typed-array accessor functions. This was verified through a real native cutout failure and repair; the tradeoff and retained protections are documented in `electron/API.md`.
