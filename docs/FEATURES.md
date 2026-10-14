# Visro feature scope

Visro is a local Mac creative app with Gemini assistance. Projects, assets, brand kits, comments, versions and generated media are stored on this Mac. The user chose **local projects and Gemini only**; account synchronization, cloud collaboration and paid stock services are outside the requested scope.

## Included workflows

| Area | Current implementation |
| --- | --- |
| Home and projects | Collapsible navigation, recent project thumbnails, search, folders, starred designs, Trash/restore, import/reopen and automatic local saves. Project lists read summaries without loading every design's image data. |
| Reference interface | Current Canva Mac 1.126.0 layout observed directly: 40px desktop tabs, 56px gradient header, 72px editor rail, floating context controls, left Position drawer, right Comments drawer and bottom Notes. Light, dark and system themes; shared rounded outline glyphs. |
| Fonts | 21 bundled open font families with 23 faces, uploaded local fonts, searchable font drawer and previews. Canva Sans is loaded at runtime from an existing Canva installation when available; its proprietary binary is not distributed with Visro. |
| Templates and formats | 46 original editable templates across 15 categories, plus presentation, social, video, print, document, whiteboard, sheet, website and custom-size creation. |
| Design canvas | Editable text, shapes, photos, SVGs and drawings; drag, scale, rotate, group/ungroup, selection and hover outlines, undo/redo, arrow-key nudges, alignment, snapping, distribution, layers, visibility and locks. |
| Text | Font size, colors, spacing, alignment, lists, uppercase, bold/italic, underline/strikethrough and shadow/outline/neon/lift/hollow/splice effects. |
| Elements | Original graphics and icon/emoji collections, sticky notes, gradients, circle/rounded/arch/diamond image frames, editable charts and tables, QR codes and reusable local components. |
| Images | Local upload/replace, crop ratios and interactive crop reposition/resize, flips, cumulative photo adjustments, real offline background removal and erase/restore alpha refinement. Refinement retains the original source so removed pixels can be restored. |
| Context controls | Copy/paste/duplicate/delete, copy style, layer/align submenus, group/ungroup, component creation, comments, lock, links, element timing and alternative text. Text offers Magic Write and translation; images offer crop/background actions. |
| Pages and presentation | Real page thumbnails, page/grid navigation, add/duplicate/delete, speaker notes, timer, durations, basic animations and presentation playback. |
| Brand kits | Named local kits with colors, font choices and imported logos. A kit can be applied to a project; logos can be inserted as editable assets. |
| Local review | Per-project comments with resolve/reopen and named version snapshots. Restore preserves a snapshot of the state being replaced. |
| Documents | Rich text headings/paragraphs, lists, quotes, font/color/alignment controls, HTML export and transfer of document text to the design canvas. |
| Sheets | Local cells, references/arithmetic, SUM/AVERAGE/MIN/MAX/COUNT, tab-separated paste, CSV import/export and transfer into an editable design table. |
| Video and audio | Local media library, design-page scenes, timeline, clip trim/duration/volume, reorder/duplicate/delete, audio timing/volume and local MP4/WebM/GIF rendering through bundled FFmpeg. |
| Gemini design and text | Structured editable design generation, writing, rewrite, summarize, translation, remix and layout adaptation. |
| Gemini images | Generate images or edit a selected source image; preview the returned result and insert/apply it to the local project. |
| Gemini voice and video | Speech generation with voice selection and WAV playback/import; Veo text-to-video or selected-image animation, aspect/duration controls, progress, cancellation and local result playback/import. |
| Export and local sharing | Portable `.visro` files, PNG/JPEG/SVG/PDF/PPTX, document HTML, sheet CSV, static website HTML and media exports. Reused embedded images are stored once in portable project files and restored on import. |

“Implemented” describes current code, not proof that every possible input or model succeeds. [VALIDATION.md](VALIDATION.md) records acceptance evidence and the exact packaged build tested. The latest UI, storage and crop changes require final packaged acceptance. Live Gemini requests require a user-entered key with access to the chosen model; no private key was searched for or used during testing.

## Practical boundaries

- The original templates, graphics and bundled fonts cover a much smaller collection than Canva's licensed catalog. Imported assets and local kits extend the user's library.
- Whiteboard uses a large design canvas, drawing and sticky notes; it has no separate infinite board engine or multiplayer cursors.
- Sheets support up to 200 rows and 26 columns with a limited formula engine. Documents do not implement complete DOCX import or word-processor pagination.
- Charts and tables are editable groups. They do not retain a live connection to external databases.
- The media editor supports scenes, trims, audio and basic transitions. It does not provide professional keyframe editing, automatic captions, motion tracking or video background removal. Browser preview is simpler than final FFmpeg output.
- Photo cutout uses local segmentation. Hair, glass and complicated backgrounds can need erase/restore refinement; there is no universal layer reconstruction tool.
- Gemini, TTS and Veo access, response behavior, quota and billing depend on the user's Google project and configured models. Visro does not add another AI provider or promise every Canva AI capability through one key.
- PDF import renders pages for annotation; imported pages do not recover the source's editable text or layers. Export format fidelity has format-specific limits.
- Website export produces local static HTML. Hosting, domains, publishing, analytics, social scheduling, print fulfillment and enterprise approval services are excluded by the local-only preference.
- Canva cloud projects and proprietary templates are not native Visro documents. REA was used for research, rather than as an editor engine or replacement for Canva's hosted services.

## Local behavior and responsiveness

Ordinary editing, local projects, imported assets, kits, comments, versions, document/sheet work, exports and bundled photo removal run locally. Gemini needs internet and enabled model access. Installing source dependencies and preparing model/font/runtime assets initially needs internet; the prepared application includes its inference model, open fonts and FFmpeg runtime.

The storage implementation deduplicates image data into local blobs, reads lightweight summaries for libraries, hydrates only an opened design and coalesces saves. In the measured 20-page repeated-photo fixture, a repeat save fell from 279ms to 2.82ms and the observed frame gap fell from 1083ms to 50ms. Real browser pointer and keyboard regressions also passed. Those measurements describe the tested fixture on this Mac, rather than a guarantee for every document or a claim of constant 60fps.

Current reference comparisons are in [PARITY.md](PARITY.md). Research provenance, font handling and dependency licenses are in [RESEARCH.md](RESEARCH.md).
