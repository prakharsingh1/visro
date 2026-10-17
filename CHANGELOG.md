# Changelog

## 0.9.0 — 17 October 2026

- Added **File → Import from Canva…** for supported PowerPoint and SVG exports, with local editable objects and a report of missing fonts, unsupported content and appearance differences. [Import guide](docs/CANVA_IMPORT.md).
- Reworked the header into one row, with the design name alongside the right-side actions and a compact local-save cloud/check indicator beside the editing controls.
- Added bounded recovery of missing or outdated Home project previews without changing the saved artwork.
- Fixed lost mouse releases so an unpressed move cannot jump the selected object; the gesture settles at its last pressed position, preserves one Undo step and resumes paused previews. Option-drag duplication retains its asynchronous copy transaction.

The application suite passed 404 tests with one optional network skip. The packaged Mac app passed 50 real drags, native PPTX text editing, SVG groups, painted Home covers and exact save/reopen checks. See [Validation](docs/VALIDATION.md) for the automation setup and limits.

## 0.8.1 — 17 October 2026

The first public download packages the current Visro feature set with a clearer onboarding experience.

- Replaced hard-coded personal profile labels with a neutral local workspace.
- Added screenshot-led documentation, installation and backup guidance, a user guide, contribution instructions and issue templates.
- Published Apple silicon Mac downloads with source, license notices and SHA-256 checksums.

## 0.8.0

- Expanded the library to 650 original templates, 144 shapes and 320 graphics.
- Added 46 bundled open font families, 48 editable font combinations and 13 original photo mockups.
- Aligned the native top-left controls and fourteen-category Elements browser with the observed reference layout.
- Added native photo-drop/crop behavior in mockups and six page-animation previews.
- Fixed grouped-selection history restoration and double-click photo cropping.

The complete feature-build suite passed 370 tests with one optional network skip. See [Validation](docs/VALIDATION.md) for browser, packaged-app and performance boundaries.

## Earlier work

The local workspace already includes continuous multipage editing, drag/arrow/shortcut controls, frames and grids, line endpoints and effects, offline photo background removal, local project persistence, documents, sheets, media exports and optional Gemini integrations. Detailed implementation and remaining limits are recorded in [Features](docs/FEATURES.md), [Workflow map](docs/PARITY.md) and [Validation](docs/VALIDATION.md).
