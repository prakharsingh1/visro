# Canva reference and Visro workflow map

Reviewed 16 October 2026; installed Canva observations were made on 13 and 16 October. Projects stay local, Gemini is the only AI provider, and the user subsequently authorized public image search/downloads. Visro implements a broad local creative workspace with familiar Canva controls. This map records implemented behavior and remaining limits; it does not claim complete 1:1 parity with Canva's entire product or backend.

## Reference used

The installed Canva Mac app, version **1.126.0**, was inspected directly for visual layout and visible menu commands. Its collapsed Home navigation is 72px wide, with Create/Home/Projects/Templates/Brand/Canva AI/More and a centered search area. The observed editor has 40px desktop tabs, a 56px teal/purple header, a 72px tool rail and a dark workspace near `#0e1013`. The main rail order is Templates, Elements, Text, Brand, Uploads, Tools, Projects and Apps, followed by pinned Components, Audio, Background and Charts.

Context controls float above the artwork. **Position opens on the left**, beginning below the combined 96px tab/header area; Comments opens on the right, and Notes below the canvas. The Position reference includes Arrange/Layers, forward/back/front/back order, page alignment, width/height/ratio and X/Y/rotation fields. Purple outlines with white corner handles, selected-element actions, centered page thumbnails and the lower zoom/pages controls informed Visro's corresponding layout. Header/context type uses 14px/600 and rail labels 12px/600, with a 72px rail pitch, 32px buttons for selected actions and a 40px context bar at y=104. Interface glyphs are independently recreated from screenshots with 24px geometry and rounded 1.5px strokes; they are not claimed to be extracted original SVGs.

Canva Sans is read from the user's installed Canva desktop package at runtime when available. Visro does not redistribute that proprietary font. Its 21-family open font catalog and local font upload work independently. Actual loaded FontFace entries were checked in the browser; CSS fallback checks alone are not treated as evidence that Canva Sans loaded.

Canva's [Visual Suite](https://www.canva.com/visual-suite/) describes the broader product areas. Its [appearance help](https://www.canva.com/help/light-and-dark-mode-settings/) documents light, dark and system modes and gradual navigation changes. The [official editor image](https://content-management-files.canva.com/913decc8-a00e-4381-aa37-26774f7c3149/LOC_MarTechB2C_VisualSuite_LandingPage_WorkWithInteractivity_en.png) provided an additional light-theme reference. [Canva AI](https://www.canva.com/canva-ai/) also includes announced capabilities; announcements are not treated as proof that a workflow is universally available.

The 16 October follow-up inspected selected text, native shapes, plain lines, photos and multiple-page scrolling in the owned reference design. The header order is File → Resize → Editing → separator → Undo/Redo. Its Editing popup is 320px at x≈143/y=96, with Editing/Commenting/Viewing rows. Element menus use 272px width, 14px type and shortcut keycaps. Layer ordering is front/forward/backward/back; page alignment groups horizontal Left/Center/Right before Top/Middle/Bottom.

Text controls put strike and uppercase after underline, then alignment/list/spacing/transparency/effects/animate/position/copy style. Images place Edit/Replace/BG Remover/Eraser before stroke/corners/crop/flip/transparency/animate/position. Native shape Edit opens the left shape pane and replaces geometry. Frames and Grids are separate Elements destinations; supported category cards follow the observed three-column order. No selection leaves the context toolbar hidden. Lines still lack the complete ten-marker and elbow/curve endpoint UI, and shape effects remain a separate known gap; controls are not exposed without working behavior.

Ordinary scrolling reveals adjacent pages in one continuous vertical stack with a measured ≈54px screen gap and a title/control row above each page. Selection persists even when its page scrolls out of view; the visible-page footer counter is independent. The official [page management help](https://www.canva.com/help/manage-pages/) also describes vertical desktop scrolling view.

## Local workflow map

“Implemented” means the current source contains the workflow. Browser regressions, earlier native results and final packaged acceptance are distinguished in [VALIDATION.md](VALIDATION.md). Every Gemini row remains **live model verification pending** until a supplied key produces real content.

| Workflow | Current status | Boundary |
| --- | --- | --- |
| Home, recent projects, search, folders, stars, Trash | Implemented | Local records and lightweight summaries; no account sync. |
| Reference chrome, drawers and theme | Implemented; browser layout checked | Current installed-app reference, not every account rollout or responsive variant. |
| Canva Sans and design fonts | Implemented; actual faces loaded | Local installed Canva Sans, 21 bundled open families and user uploads; no proprietary font catalog distribution. |
| Workspace tabs | Implemented | Native ⌘T/⌘W/⇧⌘T, ⌥⌘←/→ and ⌘1…9; pending edits saved before tab switches, closed tabs can reopen. Browser tab commands remain browser-owned. |
| Template discovery | Implemented; gallery filter/preview/create checked | Name/description search, category/color filters, saved stars; 24 results per Home page and 18 per editor panel. |
| Templates and common formats | Implemented; 530 original editable layouts | 46 existing originals, 454 vector/type additions and 30 detailed photographic originals. Twelve bundled CC0/public-domain photos, original copy and editable objects; no copied Canva library. |
| Public photo search | Implemented; keyless Commons service | Elements → Photos, public-domain/CC0 filters, preview/source details, 24-result pages and lazy thumbnails. Click or drag to add; locally cached bytes and source provenance persist in portable projects. Queries and uncached image downloads contact Commons; no Canva stock service. |
| Text, shapes, photos, SVGs and drawing | Implemented | Supported editable local object types, including 56 native shapes across six categories, with lines, dashes, arrows, callouts, polygons and stars. |
| Typography and text effects | Implemented | Font drawer, selected-character styles, Unicode-safe cases, paragraph list cycling/continuation/indentation, spacing and listed effects; no entire Canva effect catalog. |
| Drag, transform, groups, keyboard nudges and undo | Implemented; real browser interaction checked | Pointer commits, Option-drag duplication, Tab layer cycling, click-behind selection and fractional-coordinate undo; 1px/10px movement and ⌘+Arrow resize preserve expected geometry. Exact packaged evidence is in VALIDATION.md. |
| Copy/paste, duplicate, copy style and context menus | Implemented; real UI copy/paste persisted | In-app object handling and native clipboard integration; exact packaged evidence is recorded in VALIDATION.md. |
| Header editing modes | Implemented | Editing/Commenting/Viewing menu in the observed header position; local mutation gating, not cloud access control. |
| Quick actions and focus shortcuts | Implemented | `/` or ⌘E, sidebar toggle, canvas/toolbar/sidebar focus and keyboard context menu. Text inputs retain their own shortcuts. |
| Position, layers, snapping and distribution | Implemented | Left Position drawer, ordering, page alignment, geometry, visibility and locks. |
| Rulers and guides | Implemented; browser pointer/reopen checked | File Settings / Shift+R, guide grids, locks, snapping, page persistence and view-only safe margins. |
| Original graphics library | Implemented; all 192 insertions validated in the editor engine | Ten categories of independently drawn static artwork; search, categories, stars, recent use and 24-result pages. Click or drag to add native path groups, recolor palette colors and ungroup parts. Decorative infographic motifs and frames have no linked-data or photo-mask behavior. |
| Emoji, components and QR | Implemented | Local collections and generated elements; no paid stock marketplace. |
| Gradients, Frames and Grids | Implemented | Linear gradients, 36 original masks and 24 grids with 1–9 slots. Native editable images, photo drop/fill, cropped replacement, persistent provenance and one Undo; no copied Canva frame catalog. |
| Crop, flip, replace and photo adjustments | Implemented; crop pointer/engine tests passed | Interactive crop preserves frame proportions; supported cumulative filters. |
| Photo background remover | Implemented; earlier packaged photo verified | Bundled local IS-Net model and real transparent PNG output. |
| Background erase/restore | Implemented; actual alpha brush checked | Original-source pixel recovery, preview and PNG application; latest packaged acceptance passed. |
| Video background remover/layer reconstruction | Not included | Still-image segmentation and mask refinement only. |
| Pages, notes, timer and presentation | Implemented | Continuous page scrolling preserving selection/history, real thumbnails, grid, move/insert-after controls, page timing, basic animations/playback; no live audience or recording service. |
| Rich documents | Implemented; browser edit/save/reopen checked | Find/Replace, native Undo/Redo, HTML export and text-to-design; no complete DOCX import/pagination engine. |
| Sheets | Implemented; formulas/undo/save/reopen checked | Limited formulas, row/column structure, record-preserving sort, Find/Replace, CSV and paste; no complete Excel-compatible engine. |
| Charts and tables | Implemented; undo and editable objects checked | Editable groups; no linked external datasets. |
| Whiteboard | Partial | Large canvas, drawings, shapes and sticky notes; no infinite multiplayer board. |
| Media timeline and local rendering | Implemented | Imported clips/design scenes, trim/order/timing/audio/basic fades and one preview playhead. Manual timed captions with SRT/WebVTT import/export, styling, preview and baked caption rendering; no automatic transcription or advanced keyframes. |
| Brand kits and logos | Implemented; browser save/apply/insert checked | Named local color/font/logo kits; no team approvals or enterprise service. |
| Comments and version history | Implemented; browser persistence checked | Local resolve/reopen and snapshots; no remote participants. |
| Gemini writing and translation | Implemented; live verification pending | Draft/rewrite/summarize/selected text and listed language controls. |
| Gemini design, remix and resize | Implemented; live verification pending | Editable layouts using supported objects; adaptation may need manual refinement. |
| Gemini image generation/editing | Implemented; live verification pending | Supported configured image model; selected source bytes sent for requested edits. |
| Gemini speech | Implemented; live verification pending | Voice selection, PCM-to-WAV decoding, playback and local audio insertion. |
| Gemini/Veo video | Implemented; live verification pending | Text/image input, aspect/duration, operation polling, cancellation and local video insertion; project/model access required. |
| PNG/JPEG/SVG/PDF/PPTX and imports | Implemented | Format-specific fidelity; PDF import is rendered artwork for annotation. |
| Portable project sharing | Implemented; pack/unpack unit checks passed | Embedded reused assets stored once; latest native reopen acceptance passed. |
| Website | Partial | Local static HTML export; no hosting/domain/publishing service. |
| Apps | Implemented local tools | Magic Media/Write, QR, charts, tables, bulk tools and components; no remote Apps marketplace. |

## Observed shortcuts and input behavior

Visible installed-Canva menu commands were checked for Copy `⌘C`, Paste `⌘V`, Duplicate `⌘D`, Copy style `⌥⌘C`, Comment `⌥⌘N`, Bring forward `⌘]`, Send backward `⌘[`, Bring to front `⌥⌘]` and Send to back `⌥⌘[`. On 16 October, a blank test design named **Visro interaction reference** was used in the installed Canva app to inspect overlapping-element selection: `⌘`-click selected the element behind the front object. Visro follows that observed interaction.

Visro also provides `/` or `⌘E` Quick actions, `⌘/` sidebar toggle, Tab/Shift+Tab layer cycling while the canvas has focus, `⇧⌥L` layer lock, `⌘F1/F2/F3` toolbar/canvas/sidebar focus and Shift+F10 element actions. Arrow keys move 1px or 10px with Shift; `⌘`+Arrow resizes by the same increments while preserving the top-left position. `⌥,` / `⌥.` rotate by 1°, or 15° with Shift. The 1° Option+period increment was measured in the installed Canva app. The larger Shift increment has not been verified against Canva.

The Mac app implements `⌘T` new design tab, `⌘W` close design, `⇧⌘T` reopen, `⌥⌘←/→` previous/next, `⌘1…9` numbered tab selection, `⇧⌘W` close window and `⇧⌘H` Home. Browser-reserved tab/window commands are not intercepted by the web editor. The complete shortcut table is in the README; labels and visual similarity do not establish every Canva shortcut as identical.

Actual Visro regressions exercised drag, empty-textbox hit handling, arrow movement, repeated nudges, hover outlines and Undo. New templates were opened through the real gallery, moved by physical pointer input and saved; a development hot-reload regression preserved edits that were still pending autosave. Text fields keep normal typing behavior. Final acceptance uses the exact packaged build documented in VALIDATION.md.

## Excluded by user preference

Cloud projects, account synchronization, real-time collaborators, paid stock and premium proprietary templates, external publishing/hosting, social scheduling, email campaigns, analytics, print ordering, remote integrations and enterprise approvals are excluded. A Gemini key does not supply those Canva services. User-authorized Commons search is a separate public asset source; it does not synchronize or publish projects.

The 530 bundled layouts are independently authored Visro Originals with separately credited public-domain/CC0 source photographs, not Canva’s ranked or copied template catalog. Canva’s [Content License Agreement, §9.8](https://www.canva.com/policies/content-license-agreement/) restricts competitive use of its licensed content.

The remaining local gaps are recorded explicitly above. No hidden Canva feature is represented as unlocked, and no live AI output is replaced with a successful-looking placeholder.
