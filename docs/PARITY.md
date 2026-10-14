# Canva reference and Visro workflow map

Reviewed 14 October 2026; installed Canva observations were made on 13 October. The requested scope is **local projects with Gemini only**. Visro implements a broad local creative workspace with familiar Canva controls. This map records implemented behavior and remaining limits; it does not claim complete 1:1 parity with Canva's entire product or backend.

## Reference used

The installed Canva Mac app, version **1.126.0**, was inspected directly for visual layout and visible menu commands. Its collapsed Home navigation is 72px wide, with Create/Home/Projects/Templates/Brand/Canva AI/More and a centered search area. The observed editor has 40px desktop tabs, a 56px teal/purple header, a 72px tool rail and a dark workspace near `#0e1013`. The main rail order is Templates, Elements, Text, Brand, Uploads, Tools, Projects and Apps, followed by pinned Components, Audio, Background and Charts.

Context controls float above the artwork. **Position opens on the left**, Comments on the right, and Notes below the canvas. The Position reference includes Arrange/Layers, forward/back/front/back order, page alignment, width/height/ratio and X/Y/rotation fields. Purple outlines with white corner handles, selected-element actions, centered page thumbnails and the lower zoom/pages controls informed Visro's corresponding layout. Interface glyphs are recreated from these observations with 24px geometry and rounded 1.5px strokes; they are not claimed to be extracted original SVGs.

Canva Sans is read from the user's installed Canva desktop package at runtime when available. Visro does not redistribute that proprietary font. Its 21-family open font catalog and local font upload work independently. Actual loaded FontFace entries were checked in the browser; CSS fallback checks alone are not treated as evidence that Canva Sans loaded.

Canva's [Visual Suite](https://www.canva.com/visual-suite/) describes the broader product areas. Its [appearance help](https://www.canva.com/help/light-and-dark-mode-settings/) documents light, dark and system modes and gradual navigation changes. The [official editor image](https://content-management-files.canva.com/913decc8-a00e-4381-aa37-26774f7c3149/LOC_MarTechB2C_VisualSuite_LandingPage_WorkWithInteractivity_en.png) provided an additional light-theme reference. [Canva AI](https://www.canva.com/canva-ai/) also includes announced capabilities; announcements are not treated as proof that a workflow is universally available.

## Local workflow map

“Implemented” means the current source contains the workflow. Browser regressions, earlier native results and final packaged acceptance are distinguished in [VALIDATION.md](VALIDATION.md). Every Gemini row remains **live model verification pending** until a supplied key produces real content.

| Workflow | Current status | Boundary |
| --- | --- | --- |
| Home, recent projects, search, folders, stars, Trash | Implemented | Local records and lightweight summaries; no account sync. |
| Reference chrome, drawers and theme | Implemented; browser layout checked | Current installed-app reference, not every account rollout or responsive variant. |
| Canva Sans and design fonts | Implemented; actual faces loaded | Local installed Canva Sans, 21 bundled open families and user uploads; no proprietary font catalog distribution. |
| Templates and common formats | Implemented; 46 layouts rendered | Original artwork across 15 categories; no copied Canva library. |
| Text, shapes, photos, SVGs and drawing | Implemented | Supported editable local object types. |
| Typography and text effects | Implemented | Font drawer, formatting, spacing and listed effects; no entire Canva effect catalog. |
| Drag, transform, groups, keyboard nudges and undo | Implemented; real browser interaction checked | Pointer commits and fractional-coordinate undo verified; final native retest covers the latest build. |
| Copy/paste, duplicate, copy style and context menus | Implemented; real UI copy/paste persisted | In-app object handling and native clipboard integration; exact packaged evidence is recorded in VALIDATION.md. |
| Position, layers, snapping and distribution | Implemented | Left Position drawer, ordering, page alignment, geometry, visibility and locks. |
| Graphics, emoji, components and QR | Implemented | Local collections and generated elements; no paid stock marketplace. |
| Gradients and image frames | Implemented | Linear gradients and circle/rounded/arch/diamond masks. |
| Crop, flip, replace and photo adjustments | Implemented; crop pointer/engine tests passed | Interactive crop preserves frame proportions; supported cumulative filters. |
| Photo background remover | Implemented; earlier packaged photo verified | Bundled local IS-Net model and real transparent PNG output. |
| Background erase/restore | Implemented; actual alpha brush checked | Original-source pixel recovery, preview and PNG application; latest packaged acceptance pending. |
| Video background remover/layer reconstruction | Not included | Still-image segmentation and mask refinement only. |
| Pages, notes, timer and presentation | Implemented | Real thumbnails, grid, page timing, basic animations/playback; no live audience or recording service. |
| Rich documents | Implemented; browser edit/save/reopen checked | HTML export and text-to-design; no complete DOCX import/pagination engine. |
| Sheets | Implemented; formulas/undo/save/reopen checked | Limited formulas, CSV and paste; no complete Excel-compatible engine. |
| Charts and tables | Implemented; undo and editable objects checked | Editable groups; no linked external datasets. |
| Whiteboard | Partial | Large canvas, drawings, shapes and sticky notes; no infinite multiplayer board. |
| Media timeline and local rendering | Implemented | Imported clips/design scenes, trim/order/timing/audio and basic fades; no advanced keyframe/caption system. |
| Brand kits and logos | Implemented; browser save/apply/insert checked | Named local color/font/logo kits; no team approvals or enterprise service. |
| Comments and version history | Implemented; browser persistence checked | Local resolve/reopen and snapshots; no remote participants. |
| Gemini writing and translation | Implemented; live verification pending | Draft/rewrite/summarize/selected text and listed language controls. |
| Gemini design, remix and resize | Implemented; live verification pending | Editable layouts using supported objects; adaptation may need manual refinement. |
| Gemini image generation/editing | Implemented; live verification pending | Supported configured image model; selected source bytes sent for requested edits. |
| Gemini speech | Implemented; live verification pending | Voice selection, PCM-to-WAV decoding, playback and local audio insertion. |
| Gemini/Veo video | Implemented; live verification pending | Text/image input, aspect/duration, operation polling, cancellation and local video insertion; project/model access required. |
| PNG/JPEG/SVG/PDF/PPTX and imports | Implemented | Format-specific fidelity; PDF import is rendered artwork for annotation. |
| Portable project sharing | Implemented; pack/unpack unit checks passed | Embedded reused assets stored once; latest native reopen acceptance pending. |
| Website | Partial | Local static HTML export; no hosting/domain/publishing service. |
| Apps | Implemented local tools | Magic Media/Write, QR, charts, tables, bulk tools and components; no remote Apps marketplace. |

## Observed shortcuts and input behavior

Visible installed-Canva menu commands were checked for Copy `⌘C`, Paste `⌘V`, Duplicate `⌘D`, Copy style `⌥⌘C`, Comment `⌥⌘N`, Bring forward `⌘]`, Send backward `⌘[`, Bring to front `⌥⌘]` and Send to back `⌥⌘[`. Visro provides corresponding controls. Other editor shortcuts are implementation choices documented by Visro's menus; they are not all claimed to have been verified against native Canva.

Actual Visro regressions exercised drag, empty-textbox hit handling, arrow-key movement, repeated nudges, hover outlines and undo. Text fields keep their normal typing behavior. The initial arrow test exposed a coordinate/commit issue that was fixed; the integrated test then moved the element exactly by the requested amount and restored fractional coordinates with one Undo. Final acceptance should use physical pointer/keyboard input in the packaged app.

## Excluded by user preference

Cloud projects, account synchronization, real-time collaborators, paid stock and premium proprietary templates, external publishing/hosting, social scheduling, email campaigns, analytics, print ordering, remote integrations and enterprise approvals are excluded. A Gemini key does not supply those Canva services.

The remaining local gaps are recorded explicitly above. No hidden Canva feature is represented as unlocked, and no live AI output is replaced with a successful-looking placeholder.
