# Getting started with Visro

Visro is a local creative workspace for macOS. You can design, use the bundled templates and graphics, edit photos, remove backgrounds and export your work without an account or an AI key.

## Install on a Mac

1. Download the Apple silicon (`arm64`) DMG from [GitHub Releases](https://github.com/prakharsingh1/visro/releases/latest).
2. Open the DMG and drag **Visro** into **Applications**. Eject the DMG, then open the installed app.
3. This release is signed ad hoc and is **not Apple-notarized**. If macOS blocks the app because its developer cannot be verified, review [Apple’s guidance](https://support.apple.com/en-us/102445), then use the app-specific **System Settings → Privacy & Security → Open Anyway** control if you choose to open the copy you downloaded from this repository.

The published desktop build requires **macOS 13 or newer** and an **Apple silicon Mac (M1 or later)**. Intel, Windows and Linux installers are not currently provided. You can also [run the source locally](../CONTRIBUTING.md).

## Make your first design

1. On **Home**, choose a template or create a new design with your desired size.
2. Use **Elements** for shapes, graphics, photo frames, grids and mockups. Click a card to add it, or drag supported cards onto the canvas. Use **Uploads** for your own images and assets.
3. Click an object to select it. Drag to move it, use the handles to resize it, and use the toolbar above the canvas to change its appearance. Double-click text to edit it; double-click a selected image to crop it.
4. Use **Text → Font combinations** for editable type layouts. Ungroup a combination when you want to adjust its individual text boxes.
5. Scroll to adjacent pages, or use the page thumbnails below the canvas. Use **Share / Download** to export the finished work.

The interface supports light, dark and system appearance under **File → Visro settings…**. Choose **Editing** in the header when you want to change a design; **Viewing** and **Commenting** restrict canvas edits.

Useful Mac shortcuts:

| Action | Shortcut |
| --- | --- |
| Undo / Redo | ⌘Z / ⇧⌘Z |
| Save a portable project / Open a project | ⌘S / ⌘O |
| Duplicate / Group / Ungroup | ⌘D / ⌘G / ⇧⌘G |
| Move selected objects | Arrow keys; hold Shift for 10px steps |
| Add text / Rectangle / Circle / Line | T / R / C / L |
| Pan / Fit design | Hold Space and drag / ⌘0 |
| Search actions | `/` or ⌘E |

Text fields keep their normal editing shortcuts. The [User guide](USER_GUIDE.md) includes the larger shortcut reference.

## Save and back up your work

Visro automatically saves designs and imported assets in the app's local library. Wait for **Saved locally** before closing the app. Autosave is local storage, not cloud backup.

Use **File → Save** (⌘S) to write a portable **`.visro`** project; **Save as** (⇧⌘S) creates another copy. Project files include the design and embedded assets, so they are the practical way to back up your work or transfer a design to another Mac. Reopen one with **File → Open** (⌘O). Keep backups outside the app's own storage.

An exported PNG, PDF or video is a finished output, not a replacement for the editable `.visro` file. Clearing browser site data or deleting the app's local data can remove its library. Browser and desktop libraries are separate; use project files to move designs between them. Local comments, brand kits and workspace settings are not a shared team service.

## Optional Gemini tools

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. In the **Mac app**, open **File → Visro settings…**, paste it and choose **Connect Gemini**.
3. Use **Load available models** to see models your Google project can access. Text/design, image, voice and video models have separate settings.
4. Open **Apps → Magic Media** to use the supported AI tools.

The desktop app encrypts your key with macOS-backed Electron `safeStorage`. It is not put in project files or browser storage, and the renderer cannot read the saved key. Choose **Remove saved key** in Settings to disconnect it.

AI requests send the content needed for the selected operation to Google. They require an internet connection, model access and quota; Google may charge for usage. Live end-to-end acceptance with a user-supplied key is still pending, so treat the available AI integrations as implemented workflows rather than a guarantee that every model will work with your account. See [validation details](VALIDATION.md).

## Photos and offline use

The bundled templates, fonts, vector libraries and local background-removal model work offline in the packaged app. **Elements → Photos** is an optional Wikimedia Commons search for public-domain/CC0 images. Searching and downloading a new image contacts Commons; inspect its source and license information before use. Once inserted, the downloaded image is embedded in the project and available locally.

## Desktop or browser?

| Workflow | Mac app | Local browser editor |
| --- | --- | --- |
| Canvas editing, templates, local library and portable projects | Available | Available; separate browser storage |
| Bundled photo editing and background removal | Available offline | Requires the prepared local model assets |
| Gemini key storage and AI requests | Available through the native bridge | Use the Mac app |
| Native clipboard, document PDF printing and FFmpeg media services | Available | Native services unavailable |
| Native design-tab keyboard commands | Available | Some commands are reserved by the browser |

The browser editor is a locally run development experience, not a hosted Visro cloud service. See [Contributing](../CONTRIBUTING.md) to start it.

## What to expect

Visro has an independent editor, original template/graphics collections and open font assets. It is not affiliated with Canva and does not include Canva's marketplace catalog or hosted services. There is no cloud synchronization or live team collaboration. Forms are editable layouts; the 3D category contains vector illustrations. Advanced video keyframes, automatic transcription, video background removal and complete Office-file compatibility remain gaps.

Interaction and persistence regressions are tested, including packaged-app checks. This does not guarantee that every design or Mac will be free of delays. If something goes wrong, export a `.visro` backup if possible and [report the issue](https://github.com/prakharsingh1/visro/issues) with the version, macOS version and steps to reproduce. Share a small non-sensitive sample instead of a private project or API key.

See [Features](FEATURES.md), [Parity and limitations](PARITY.md) and [Validation](VALIDATION.md) for the current boundaries.
