# Visro

Visro is a local Mac creative workspace with a Canva-style editor and your own Gemini key. Designs, assets, brand kits, comments and versions stay on this Mac. Optional **Elements → Photos** searches public-domain/CC0 images on Wikimedia Commons; those search queries and selected-image downloads contact Commons. Gemini remains the only AI provider.

## Open and connect

Open `~/Applications/Visro.app`, or install the Apple silicon DMG from `release/`. This build is signed ad hoc; it is not Apple-notarized.

Open **File → Visro settings…** or your profile's Settings, paste your key from [Google AI Studio](https://aistudio.google.com/apikey), and choose **Connect Gemini**. The desktop app encrypts the key using macOS-backed Electron safeStorage. Keys are not included in projects or browser storage. Text, image, speech and video models can be configured independently; **Load available models** lists those accessible to your Google project.

**Apps → Magic Media** provides editable designs, writing, translation, image generation/editing, speech and Veo video. Returned results can be previewed and added to a project. AI requests need internet, model access and quota in your Google project. No live key was used in development; model availability still needs acceptance with your key.

## Create and edit

- Start with **530 original editable templates**, or create a presentation, social design, video, print layout, rich document, whiteboard, sheet, website or custom canvas. The template browser searches names and descriptions, filters categories/colors, saves stars and previews a layout before use. It displays 24 results per Home page or 18 in the editor panel. Thirty detailed Photo Editions use twelve bundled public-domain/CC0 photographs for editorial covers, travel, food, fashion, architecture, presentations and more; they work offline.
- Drag objects directly. Purple hover outlines identify the object under the pointer; click selects it. Option-drag duplicates an object or selection in one Undo. Shift selects several. Arrow keys move selected objects by 1px; Shift+Arrow moves 10px. Undo preserves fractional positions, the surviving selection and the current zoom/pan. Tab/Shift+Tab cycles layers when the canvas has focus; ⌘-click selects an element behind another. ⌘+Arrow resizes by 1px and ⇧⌘+Arrow by 10px while preserving the top-left position.
- Use the left rail for Templates, Elements, Text, Brand, Uploads, Tools, Projects and Apps. **Position** opens on the left with Arrange/Layers, ordering, alignment, distribution and exact geometry. Comments open on the right; Notes sit below the canvas. The Position drawer starts directly below the 96px combined tab/header area. Press `/` or ⌘E for searchable Quick actions; ⌘/ toggles the sidebar.
- Scroll vertically through a continuous stack of pages, with all visible pages rendered even at low zoom. Scrolling preserves selection and never creates an Undo step; click or drag on the next page to edit it. Control-wheel zoom keeps the pointed location anchored to its page. Page controls provide move up/down, duplicate, delete and insert after; decoded previews also populate the bottom page thumbnails.
- The header places **Editing / Commenting / Viewing** between Resize and Undo. Commenting and Viewing gate canvas mutations while allowing page navigation, zoom and export; comments are available in Commenting.
- Use the floating context toolbar for typography, color, spacing, opacity, photo editing, crop, flips, effects and position. Right-click an object for copy/paste, duplicate, ordering, alignment, grouping, locks, links, alternative text and other applicable actions.
- Select a line for separate start/end marker menus, Swap line ends and Straight/Elbowed/Curved routing. Ten endpoint styles include arrows, bars, circles, squares and diamonds. Drag either endpoint directly; native vectors preserve editable geometry, styling and Undo across saves.
- Select a shape and open **Effects** beside Transparency for Drop, Glow, Echo or Glitch, plus eleven advanced color/gradient presets. Direction, offset, blur, opacity/intensity and effect colors remain editable. Removing an effect preserves the current shape fill and border.
- Text formatting respects the selected characters and paragraphs. Lists cycle through bullets, numbering and plain text; Enter continues a list, an empty item exits it, and Tab/Shift+Tab changes indentation. Case conversion preserves mixed character styles and Unicode glyphs.
- Use 21 bundled open font families or upload a local font. Canva Sans loads from an existing local Canva installation when available; its binary is not distributed with Visro. Visro settings offers light, dark and system appearance.
- **File → Settings** provides rulers/guides (Shift+R), draggable guides, column/row guide grids, snapping, guide locks and a 5% safe-margin preview. Guides are saved per page and stay outside exports.
- Insert photos/SVGs, draw, use image frames, build editable tables/charts, generate QR codes, save reusable components and create multiple pages from CSV data.
- **Elements → Shapes** offers 56 native vector shapes across basics, polygons, stars/badges, arrows, callouts and lines. **Elements → Graphics** contains 192 independently drawn vector graphics across ten categories, with search, stars, recent use and 24-result pages. Click or drag to insert, recolor individual palette colors, or ungroup to edit the native vector parts. These bundled collections work offline.
- **Elements → Frames / Grids** offers 36 original photo masks and 24 editable photo-grid layouts with 1–9 slots. Insert an empty frame, then drag an uploaded or public-domain photo into it. Replacement preserves its placement, mask, crop proportions and layer identity, with one Undo. Selected shapes can be replaced from the left **Edit** panel or converted into photo frames through right-click → **Change to frame**; stroke controls support weight, solid/dashed/dotted patterns and round line caps. Photo/rectangle corners have an adjustable radius.
- **Elements → Photos** searches Wikimedia Commons without an API key, with public-domain/CC0 filters, source/license details, preview and lazy thumbnail pages. Click to add, or drag a photo onto the canvas to place it in the scene. Chosen images are cached locally and inserted as embedded bytes with source provenance; one Undo removes the insertion. Crop, adjustments and background removal work on these photos. Searches and uncached downloads require internet; already chosen/cached bytes remain available locally.
- Remove photo backgrounds offline with bundled IS-Net. Erase/restore brushes refine the real alpha channel. Interactive crop works in original image coordinates and preserves the placed frame's proportions.
- Rich documents support headings, formatting, lists, images, tables and Find/Replace with native Undo. Sheets provide references, arithmetic, SUM/AVERAGE/MIN/MAX/COUNT, CSV/TSV, record-preserving sorting, row/column insertion/deletion with formula repair, Find/Replace and undo/redo. Local video/audio supports timeline ordering, trims, timing, volume and MP4/WebM/GIF rendering with bundled FFmpeg. The unified playhead synchronizes scenes, audio and caption preview. Add/edit timed captions, import/export SRT or WebVTT and bake styled captions into rendered video; automatic speech transcription is not included.
- Design tabs support new, close, reopen, numbered selection and previous/next navigation without losing pending edits. Home provides recent projects, search, folders, stars and Trash. Brand kits store named color/font/logo sets. Comments and named versions are local.

Designs autosave into IndexedDB. Repeated large photos are stored once as local blobs; project lists load small summaries rather than every photo. **Save** writes a portable `.visro` file with reused images bundled once. **Open** imports it. PNG/JPEG/SVG/PDF/PPTX, document HTML/PDF, sheet CSV, static website HTML and media exports are supported. PDF import renders pages for annotation; it does not recover editable source layers. Complex PowerPoint artwork is rendered into slide images; simple supported objects remain editable.

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New design / Close design / Reopen closed design (Mac app) | ⌘T / ⌘W / ⇧⌘T |
| Previous / Next design tab (Mac app) | ⌥⌘← / ⌥⌘→ |
| Select design tab / Home / Close window (Mac app) | ⌘1…⌘9 / ⇧⌘H / ⇧⌘W |
| Save / Save as / Open | ⌘S / ⇧⌘S / ⌘O |
| Undo / Redo | ⌘Z / ⇧⌘Z or ⌘Y |
| Copy / Cut / Paste / Select all | ⌘C / ⌘X / ⌘V / ⌘A |
| Duplicate / Group / Ungroup | ⌘D / ⌘G / ⇧⌘G |
| Text / Rectangle / Circle / Line | T / R / C / L |
| Continue / Indent / Outdent a list (while editing text) | Enter / Tab / Shift+Tab |
| Rulers and guides / Duplicate by dragging | Shift+R / Option-drag |
| Find and replace in Docs and Sheets | ⌘F |
| Move / Larger move | Arrow / Shift+Arrow |
| Resize / Larger resize | ⌘+Arrow / ⇧⌘+Arrow |
| Rotate / Larger rotate | ⌥, or ⌥. / ⇧⌥, or ⇧⌥. |
| Next / Previous layer (canvas focus) | Tab / Shift+Tab |
| Select an element behind / Lock or unlock | ⌘-click / ⇧⌥L |
| Quick actions / Toggle sidebar | `/` or ⌘E / ⌘/ |
| Focus toolbar / Canvas / Sidebar | ⌘F1 / ⌘F2 / ⌘F3 |
| Selected-element menu | Shift+F10 |
| Bring forward / Send backward | ⌘] / ⌘[ |
| Bring to front / Send to back | ⌥⌘] / ⌥⌘[ |
| Show layers / Copy style / Paste style | ⌥1 / ⌥⌘C / ⌥⌘V |
| Link / Component / Comment | ⌘K / ⌥⌘K / ⌥⌘N |
| Add page / Delete page | ⌘Enter / ⌘Delete |
| Zoom / Fit / Pan | ⌘+ or ⌘− / ⌘0 / hold Space and drag |

Inputs, rich text and an actively edited canvas textbox keep normal text editing shortcuts. Rotation increments are 1° or 15° with Shift. The 1° Option+period increment was measured in Canva; its larger Shift increment has not been verified. Browser-reserved tab commands are provided by the native Mac app.

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

Visro's independent editor follows the visible installed Canva Mac app's navigation, panels and familiar input behavior. Current refinements use 14px/600 header and context type, 12px/600 rail labels, a 72px rail pitch and 32px buttons for selected actions. Glyphs were independently redrawn from the observed interface. The reference is recorded in [RESEARCH.md](docs/RESEARCH.md). Canva's private server source and its hosted services are not available through its installed client.

**Visro Originals** preserves the first 46 layouts, adds 454 vector/type layouts across 26 composition families, 23 categories and 19 collections, and adds 30 detailed photographic originals. The twelve bundled photographs total 2.33 MiB and retain their separate public-domain/CC0 status; source pages, authors, licenses, modifications and hashes are recorded in `public/template-photos/manifest.json` and `NOTICES.md`. Photo placement preserves aspect ratio through cover cropping, and project files embed the bytes and source provenance. The layouts use original copy, fictional brands, editable vectors and bundled open fonts. They are not Canva’s “top 500.” Canva’s [Content License Agreement, §9.8](https://www.canva.com/policies/content-license-agreement/) restricts using its licensed content to compete with Canva, so Visro does not redistribute that catalog.

This build substantially expands the local workflows; it is not complete 1:1 Canva parity. Remaining local limits include an infinite whiteboard engine, advanced video keyframes, automatic transcription, video background removal, full document/Excel compatibility and the entire effects/catalog collection. Cloud synchronization, live teams, paid stock, remote publishing and print fulfillment are outside the user's local-projects/Gemini-only choice. [FEATURES.md](docs/FEATURES.md) and [PARITY.md](docs/PARITY.md) record exact boundaries; [VALIDATION.md](docs/VALIDATION.md) separates verified behavior from pending live AI acceptance.

Source is AGPL-3.0-only because of the IMG.LY background-removal dependency. See LICENSE and THIRD_PARTY_NOTICES.md. The release's source ZIP includes application source, tests, lockfile, licenses and reproducible asset preparation scripts.
