# Visro

Visro is a local Mac creative workspace with a Canva-style editor and your own Gemini key. Designs, assets, brand kits, comments and versions stay on this Mac.

## Open and connect

Open `~/Applications/Visro.app`, or install the Apple silicon DMG from `release/`. This build is signed ad hoc; it is not Apple-notarized.

Open **File → Visro settings…** or your profile's Settings, paste your key from [Google AI Studio](https://aistudio.google.com/apikey), and choose **Connect Gemini**. The desktop app encrypts the key using macOS-backed Electron safeStorage. Keys are not included in projects or browser storage. Text, image, speech and video models can be configured independently; **Load available models** lists those accessible to your Google project.

**Apps → Magic Media** provides editable designs, writing, translation, image generation/editing, speech and Veo video. Returned results can be previewed and added to a project. AI requests need internet, model access and quota in your Google project. No live key was used in development; model availability still needs acceptance with your key.

## Create and edit

- Start with 46 original editable templates, or create a presentation, social design, video, print layout, rich document, whiteboard, sheet, website or custom canvas.
- Drag objects directly. Purple hover outlines identify the object under the pointer; click selects it. Option-drag duplicates an object or selection in one Undo. Shift selects several. Arrow keys move selected objects by 1px; Shift+Arrow moves 10px. Undo preserves fractional positions.
- Use the left rail for Templates, Elements, Text, Brand, Uploads, Tools, Projects and Apps. **Position** opens on the left with Arrange/Layers, ordering, alignment, distribution and exact geometry. Comments open on the right; Notes sit below the canvas.
- Use the floating context toolbar for typography, color, spacing, opacity, photo editing, crop, flips, effects and position. Right-click an object for copy/paste, duplicate, ordering, alignment, grouping, locks, links, alternative text and other applicable actions.
- Use 21 bundled open font families or upload a local font. Canva Sans loads from an existing local Canva installation when available; its binary is not distributed with Visro. Visro settings offers light, dark and system appearance.
- **File → Settings** provides rulers/guides (Shift+R), draggable guides, column/row guide grids, snapping, guide locks and a 5% safe-margin preview. Guides are saved per page and stay outside exports.
- Insert photos/SVGs, draw, use image frames, build editable tables/charts, generate QR codes, save reusable components and create multiple pages from CSV data.
- Remove photo backgrounds offline with bundled IS-Net. Erase/restore brushes refine the real alpha channel. Interactive crop works in original image coordinates and preserves the placed frame's proportions.
- Rich documents support headings, formatting, lists, images, tables and Find/Replace with native Undo. Sheets provide references, arithmetic, SUM/AVERAGE/MIN/MAX/COUNT, CSV/TSV, record-preserving sorting, row/column insertion/deletion with formula repair, Find/Replace and undo/redo. Local video/audio supports timeline ordering, trims, timing, volume and MP4/WebM/GIF rendering with bundled FFmpeg.
- Home provides recent projects, search, folders, stars and Trash. Brand kits store named color/font/logo sets. Comments and named versions are local.

Designs autosave into IndexedDB. Repeated large photos are stored once as local blobs; project lists load small summaries rather than every photo. **Save** writes a portable `.visro` file with reused images bundled once. **Open** imports it. PNG/JPEG/SVG/PDF/PPTX, document HTML/PDF, sheet CSV, static website HTML and media exports are supported. PDF import renders pages for annotation; it does not recover editable source layers. Complex PowerPoint artwork is rendered into slide images; simple supported objects remain editable.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Save / Save as / Open | ⌘S / ⇧⌘S / ⌘O |
| Undo / Redo | ⌘Z / ⇧⌘Z or ⌘Y |
| Copy / Cut / Paste / Select all | ⌘C / ⌘X / ⌘V / ⌘A |
| Duplicate / Group / Ungroup | ⌘D / ⌘G / ⇧⌘G |
| Text / Rectangle / Circle / Line | T / R / C / L |
| Rulers and guides / Duplicate by dragging | Shift+R / Option-drag |
| Find and replace in Docs and Sheets | ⌘F |
| Move / Larger move | Arrow / Shift+Arrow |
| Bring forward / Send backward | ⌘] / ⌘[ |
| Bring to front / Send to back | ⌥⌘] / ⌥⌘[ |
| Show layers / Copy style / Paste style | ⌥1 / ⌥⌘C / ⌥⌘V |
| Link / Component / Comment | ⌘K / ⌥⌘K / ⌥⌘N |
| Add page / Delete page | ⌘Enter / ⌘Delete |
| Zoom / Fit / Pan | ⌘+ or ⌘− / ⌘0 / hold Space and drag |

Inputs, rich text and an actively edited canvas textbox keep normal text editing shortcuts.

## Develop and build

Use Node.js 22.12+ and macOS for native packaging. The verified toolchain on this Mac is Node 26.5.0.

```sh
npm ci
npm run start
```

If dependency installation skipped Electron's install script, run `node node_modules/electron/install.js` first. For hot reload, run `npm run dev`, then `VISRO_DEV_URL=http://127.0.0.1:5173 npm run desktop`. The local browser editor can be opened at the development URL; encrypted Gemini, native clipboard, printing and FFmpeg services run in the Mac app.

```sh
npm run typecheck
npm test
npm run dist:mac
```

The build prepares verified background models, PDF assets, offline fonts and signed Apple silicon media tools. Cached assets are checked and reused; missing assets are obtained from their pinned sources. Packaging stages outside Documents/iCloud, signs and verifies the complete bundle, then copies flat DMG/ZIP installers into `release/`.

## Reference, provenance and boundaries

The requested MIT REA fork is [prakharsingh1/rea](https://github.com/prakharsingh1/rea), with a sibling checkout at `../rea`. REA is a research tool, not Visro's editor engine or runtime dependency.

Visro's independent editor follows the visible installed Canva Mac app's navigation, panels and familiar input behavior. The reference is recorded in [RESEARCH.md](docs/RESEARCH.md). Canva's private server source and its hosted services are not available through its installed client.

This build substantially expands the local workflows; it is not complete 1:1 Canva parity. Remaining local limits include an infinite whiteboard engine, advanced video animation/captions, video background removal, full document/Excel compatibility and the entire effects/catalog collection. Cloud synchronization, live teams, paid stock, remote publishing and print fulfillment are outside the user's local-projects/Gemini-only choice. [FEATURES.md](docs/FEATURES.md) and [PARITY.md](docs/PARITY.md) record exact boundaries; [VALIDATION.md](docs/VALIDATION.md) separates verified behavior from pending live AI acceptance.

Source is AGPL-3.0-only because of the IMG.LY background-removal dependency. See LICENSE and THIRD_PARTY_NOTICES.md. The release's source ZIP includes application source, tests, lockfile, licenses and reproducible asset preparation scripts.
