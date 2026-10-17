# Contributing to Visro

Thanks for helping make Visro a useful local creative tool. Bug reports, interaction fixes, accessibility improvements, original templates and well-scoped features are welcome.

Before a larger change, open an [issue](https://github.com/prakharsingh1/visro/issues) describing the workflow you want to improve. [Features](docs/FEATURES.md) and [current limitations](docs/PARITY.md) explain the existing scope: local projects, optional public-domain/CC0 image search and Gemini as the AI provider.

## Set up the project

Use Node.js **22.12 or newer**, npm and Git. Node **26.5.0** is the recommended, verified development and test toolchain. Native builds and the bundled media-tool preparation target **Apple silicon macOS**; the packaged app requires **macOS 13 or newer** and an **M1 or later** chip.

```sh
git clone https://github.com/prakharsingh1/visro.git
cd visro
npm ci
```

Keep optional dependencies enabled: the editor-engine tests use Fabric's Node environment and `canvas`. If a native dependency has to compile on your system, follow that dependency's build requirements rather than removing it from the lockfile. If Electron's install script was skipped, restore its runtime with:

```sh
node node_modules/electron/install.js
```

For the full production app:

```sh
npm start
```

This builds the renderer, prepares its assets and opens Electron. The first build can download the pinned background-removal model and Apple silicon media tools; cached assets are verified and reused. Font and photo assets already committed to the repository work without fetching a new catalog.

For hot reload, run these in separate terminals:

```sh
npm run dev
```

```sh
VISRO_DEV_URL=http://127.0.0.1:5173 npm run desktop
```

You can open the displayed Vite URL in a browser for canvas/UI development. It has its own local library and no desktop bridge. Gemini credentials, native clipboard, document PDF printing and FFmpeg services require Electron. See [Getting started](docs/GETTING_STARTED.md) for user-facing behavior.

## Validate a change

Start with checks relevant to what changed:

```sh
npm run typecheck
node --test tests/project.test.cjs tests/portable.test.cjs
```

For an editor change, run its relevant engine/interaction tests and exercise the real pointer or keyboard workflow. Include Undo/Redo and save/reopen when you change persistent objects. For a visual change, inspect light and dark modes and include a screenshot in the pull request. Documentation-only changes need link and instruction checks, not a full native stress run.

Before proposing a runtime change, run the complete suite and production build:

```sh
npm test
npm run build
```

Some tests import TypeScript directly. Use the verified Node toolchain or a current Node release with native type stripping; on older Node 22 releases that require the opt-in flag, use `NODE_OPTIONS=--experimental-strip-types npm test`. The optional live Commons check can skip when its network endpoint is unavailable. A separate template-font audit skips if its local font cache has not been prepared; this is reported explicitly by the test.

For native bridge or packaging changes, use the isolated smoke runner after building:

```sh
npm run verify:native
```

It uses a disposable app profile and never submits a Gemini request or changes your saved key. Optional fixtures and packaged-app checks are documented in [electron/API.md](electron/API.md). Native automation results and normal foreground performance are distinct evidence; record the mode you used. Keep real keys and private projects out of logs, fixtures and screenshots.

## Fonts and template typography checks

Normal `npm run prepare:fonts` verifies the committed font files and licenses. Python is needed only to restore/reconvert missing WOFF2 files or run the extra offline template typography audit.

```sh
python3 -m venv build/font-tools-env
build/font-tools-env/bin/python -m pip install fonttools==4.60.1 brotli==1.1.0
npm run prepare:fonts
build/font-tools-env/bin/python scripts/prepare-template-audit-fonts.py
node --test tests/template-expansion-engine.test.cjs
```

The preparation script automatically finds `build/font-tools-env/bin/python`; `VISRO_FONT_PYTHON` can select another interpreter with those exact package versions. Font restoration uses pinned official Google Fonts sources and checks hashes. The optional audit makes static TTF instances for Pango/node-canvas from the verified bundled WOFF2 files. Its generated files stay in the ignored `build/template-audit-fonts/` cache and are not distributed.

## Build a Mac package

```sh
npm run pack
npm run dist:mac
```

`pack` builds an unpacked Apple silicon app; `dist:mac` also creates DMG and ZIP installers in `release/`. Packaging stages the app in the macOS user cache outside Documents/iCloud and verifies its code signature. Current builds are ad hoc signed and not notarized. Generated models, build caches, installers, test output and personal app data should remain untracked.

## Keep contributions reviewable

- Explain the concrete problem and the resulting behavior. Keep a pull request focused and list the checks you actually ran.
- Preserve project compatibility and existing template/object IDs. Add a meaningful regression check when fixing a persistence or interaction bug.
- Use original assets or assets with a redistribution-compatible license. Include source, author, license and hashes where the existing asset manifest expects them. Do not add Canva marketplace content or proprietary font binaries.
- Do not commit API keys, credentials, private designs or generated user data. Reproduce bugs with a small sanitized fixture.
- Avoid adding cloud services or analytics implicitly. Explain any new network request and how it fits the local-project scope.

Visro's source is [AGPL-3.0-only](LICENSE). Third-party libraries and bundled assets retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Contributions must be compatible with these licenses.

## Report a problem

Include the Visro version, macOS and chip type, whether you used the desktop app or browser, exact reproduction steps and the expected result. For a freeze or delay, mention the approximate page/object count, image sizes and the action that triggered it. Attach a screen recording or sanitized `.visro` project if it helps. Never include your Gemini key.
