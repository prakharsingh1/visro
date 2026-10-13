# Visro desktop bridge

`window.visro` is available inside the desktop editor. All calls return Promises, except `onMenu`. Errors reject with a readable message. Canceled native dialogs return `null`. The browser preview has no desktop bridge.

```ts
getSettings(): Promise<{
  hasKey: boolean;
  textModel: string;
  imageModel: string;
  secureStorage: boolean;
  encryptionAvailable: boolean;
}>;
saveSettings({ apiKey?, clearKey?, textModel?, imageModel? }): Promise<Settings>;
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

Menu actions: `new`, `open`, `save`, `save-as`, `export`, `settings`, `undo`, `redo`, `zoom-in`, `zoom-out`, `fit`. Native Save reuses the last native project destination. Save As always displays a native dialog. New from the native menu clears the last project destination; renderer-created fresh designs should use `saveAs: true` on their first save.

Project JSON and exports are capped at 100 MB. Project JSON is stripped of prototype-manipulation keys; the renderer must additionally run its project version/geometry validation before loading. Export PNG/JPEG/PDF takes a base64 data URL matching the chosen MIME type; PDF should be rendered with jsPDF before calling the bridge. SVG accepts a string and rejects scripts, event handlers, foreign objects, and remote references.

Production assets are served from the secure `visro://app` origin, including local background model/WASM files. CSP permits local scripts, workers, WebAssembly, styles and data/blob images, and blocks renderer network access to third-party origins. Cross-origin isolation enables local ML workers. Development loads only `http://127.0.0.1:5173/` when `VISRO_DEV_URL` is set.

The protocol handler sets CSP, COOP, COEP, CORP, MIME, and nosniff headers on its returned `Response` directly. Local data/blob fetches are permitted for cutout image decoding and runtime chunks. Symlinks outside the built asset directory, foreign initiator origins, and non-read requests are blocked.

CSP tradeoff: IMG.LY 1.7.0 bundles `ndarray`, which constructs typed-array accessor functions using `new Function` (`node_modules/@imgly/background-removal/dist/index.mjs`, lines 88, 92, and 219). A real cold native cutout failed with `unsafe-eval` blocked, so production permits JavaScript string evaluation for this local dependency as well as WebAssembly. This reduces CSP's protection if an attacker already gains JavaScript execution in the renderer. External scripts and renderer network connections remain blocked; production inline scripts are blocked; the renderer retains Electron sandboxing, context isolation, no Node globals, validated IPC inputs, and no access to the stored Gemini key. Bundled model/runtime assets are local, and no third-party code is fetched at runtime.

After `npm run build` and local model preparation, run `node electron/native-smoke.cjs` for a cold production-origin desktop check. A packaged build can be checked with `node electron/native-smoke.cjs --app '/absolute/path/Visro.app'`; add `--screenshot '/absolute/path/native-smoke.png'` to capture the editor. This uses Node's native CDP client with an ephemeral loopback debugging port, then closes its child process. It verifies the actual secure origin, isolated renderer, native bridge, local cutout manifest, data/blob fetches, worker, WebAssembly, external network blocking, and absence of key material from settings. It never submits a Gemini request, changes keys, or saves projects.

Add `--cutout '/absolute/path/photo.jpeg'` for a full local segmentation check in the smoke process's temporary Chromium profile. It imports the image through the actual file input, clicks Remove background, then reads the autosaved PNG and counts transparent versus retained pixels. This changes only the isolated test profile and verifies real transparency rather than relying on a completion message. Allow up to three minutes for a cold local inference.

No additional runtime npm dependencies are required by `electron/*`; the service uses Electron and Node's native `fetch`. Tests use Node's built-in `node:test`.

Implementation references (checked 2026-10-13): [Gemini model listing](https://ai.google.dev/api/models), [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
