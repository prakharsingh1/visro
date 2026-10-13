# Visro

A Mac creative studio for local, editable designs, with real background removal and your own Gemini key.

## Open the Mac app

The installed Apple silicon app is at `/Users/prakharsingh/Applications/Visro.app`. An installable DMG and ZIP are in `release/`; the packaging wrapper keeps its signed app bundle in a local cache outside Documents. Drag Visro into Applications from the DMG, or open the app directly. This development build is signed ad hoc and is not Apple-notarized for public distribution.

Click **Settings** in the top toolbar, paste a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey), and choose **Connect Gemini**. The key is encrypted through Electron's macOS-backed safeStorage and is never stored in a project, canvas, browser localStorage, source file, or remote Visro server. Text/design and image models are independently configurable. **Load available models** discovers those exposed to your account.

Click **Visro AI** to generate an editable design, write copy, generate an image, or edit a selected photo. Review the returned result before adding it. A generated design is added as a new page, retaining your existing work. Gemini requires internet and the model access/quota granted to your Google project; your API usage is billed by Google.

## Design workflows

- Start from 10 original templates or resize a canvas for social posts, stories, presentations, documents, cards, and posters.
- Add and edit text, shapes, freehand strokes, and imported PNG/JPG/WebP/GIF images. Drag handles to scale or rotate; select layers for precise position, style, locking, visibility, grouping, flipping, cropping, and image adjustments.
- Add, duplicate, and switch pages. Undo/redo preserves the full document. Brand colours and font choices travel with the project.
- Designs autosave to a local IndexedDB library. Click the Visro logo to reopen them. **Save** creates a portable `.visro` file through a native save dialog; **Open** restores it.
- **Export** saves current-page PNG/JPG/SVG or a PDF containing every page. PNG supports transparency and 1×/2×/3× dimensions. Presentation view displays pages on a dark backdrop.
- Select an image, then click **Remove background**. IS-Net runs on this Mac and returns a real PNG alpha channel. Its verified model/runtime are bundled in the app, so it works offline without a Gemini key or a first-use download. The first image initializes the model and may take longer; complex hair, glass, and multiple subjects can need refinement.

Shortcuts: `⌘S` Save, `⌘O` Open, `⌘Z` Undo, `⌘⇧Z` Redo, `⌘D` Duplicate selected, `T` Add a heading, Delete Remove selected. Native menus also expose New, Save As, Export, Settings, zoom, and fit.

## Develop and build

Requires Node.js 22.12+ and macOS for Mac packaging. The verified local toolchain uses Node 26.5.0.

```sh
npm ci
node node_modules/electron/install.js
npm run prepare:models
npm run start
```

The explicit Electron install command is useful when an npm install policy skips dependency scripts. Ordinary `npm ci` with Electron installation enabled already prepares the runtime.

For hot reload, run `npm run dev` in one terminal and `VISRO_DEV_URL=http://127.0.0.1:5173 npm run desktop` in another. For packaging, run `npm run dist:mac`. The wrapper stages and signs the app outside Documents/iCloud, verifies the complete bundle, then copies the flat installers into `release/`. Build scripts verify and reuse the 95.4 MiB of bundled cutout assets; a fresh checkout downloads them from IMG.LY's official versioned endpoint with size/SHA-256 checks. `npm run typecheck` checks TypeScript and `npm test` runs editor and desktop-service tests.

## Scope and provenance

The requested MIT-licensed REA fork is [prakharsingh1/rea](https://github.com/prakharsingh1/rea), checked out in the sibling `../rea` folder. REA is an analysis tool; it is not the design editor and is not a runtime dependency of Visro. Visro uses independent source, UI, templates, and document format. See [the research notes](docs/RESEARCH.md) for ArtCraft's public clean-room approach and static Canva desktop observations.

Visro implements the workflows above. It does not provide full Canva parity: real-time collaboration, Canva's licensed content/marketplace, cloud document import/sync, video editing, social publishing, and print fulfillment are absent. The [feature inventory](docs/FEATURES.md) records the complete first-build boundaries. Full parity is an ongoing product roadmap, not a property of substituting a Gemini key.

Source is AGPL-3.0-only because of IMG.LY's local background-removal dependency. See LICENSE and THIRD_PARTY_NOTICES.md. The source ZIP shipped with the build includes the corresponding application source, lockfile, tests, and reproducible model preparation script. See [validation results](docs/VALIDATION.md) for completed checks and the live Gemini acceptance check that still needs your key.
