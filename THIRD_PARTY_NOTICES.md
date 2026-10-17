# Third-party notices

Visro source is licensed under AGPL-3.0-only because its local background-removal integration uses IMG.LY's AGPL package. The full license is preserved in LICENSE. This is independent of the MIT-licensed REA fork, which is a separate research tool and is not included in this app.

- @imgly/background-removal 1.7.0 — IMG.LY GmbH, AGPL-3.0. Full license in LICENSE; dependency/model inventory in licenses/imgly-third-party.json. https://github.com/imgly/background-removal-js
- IS-Net segmentation weights — preserved license and origin information in IMG.LY's third-party inventory. https://github.com/xuebinqin/DIS
- ONNX Runtime 1.21.0 — Microsoft Corporation, MIT. https://github.com/microsoft/onnxruntime
- Fabric.js 7.4.0 — MIT. https://github.com/fabricjs/fabric.js
- React / React DOM — Meta Platforms, Inc. and affiliates, MIT. https://github.com/facebook/react
- Lucide icons — ISC. https://github.com/lucide-icons/lucide
- jsPDF — MIT. https://github.com/parallax/jsPDF
- Electron / Chromium — Electron MIT and Chromium's third-party licenses, shipped within the Electron runtime. https://github.com/electron/electron

- PDF.js 6.4.299 — Mozilla and contributors, Apache-2.0. License in licenses/pdfjs-dist-LICENSE. Decoder, CMap and standard-font notices accompany the packaged pdf-assets. https://github.com/mozilla/pdf.js
- PptxGenJS 4.0.1 — MIT. License in licenses/pptxgenjs-LICENSE. https://github.com/gitbrent/PptxGenJS
- qrcode 1.5.4 — MIT. License in licenses/qrcode-LICENSE. https://github.com/soldair/node-qrcode
- image-size 2.0.4 — MIT. License in licenses/image-size-LICENSE. https://github.com/image-size/image-size
- FFmpeg and FFprobe 9.0.2, signed Apple Silicon builds by Martin Riedl — GPL-3.0-or-later. License, exact configuration, SHA-256 manifest and source references accompany the binaries in resources/media-tools. FFmpeg source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz ; publisher build/dependency sources: https://git.martin-riedl.de/ffmpeg/build-script .
- Offline design fonts from Google Fonts at commit 66928797f271fed5ee428544e7229685e2d90127 — OFL-1.1. Family copyright/license files accompany the fonts in fonts/; complete source/generated SHA-256 provenance is in scripts/font-manifest.json. WOFF2 conversion preserves all Unicode glyphs, original names, outlines and variable axes. https://github.com/google/fonts

Template layouts and copy, interface design, app icon, and Visro's application logic were created for this project. Twelve bundled source photographs and archival images are separately credited below. No Canva or Adobe source, proprietary templates, logos, or premium stock assets are included in the distributed app. The optional Canva Sans interface typeface is read locally from the user’s already-installed Canva application; its proprietary binaries are not copied into this repository, installers, or source archive. Independently implemented icons and public app behavior inform the interface. Gemini is Google's API service; the user supplies a key and is responsible for their API usage.

For distribution, ship the complete corresponding Visro source (including package-lock.json, build scripts, Electron integration, and the documented model-download procedure) with the binaries. IMG.LY also offers separate commercial licensing; contact IMG.LY before changing this dependency's licensing assumptions.


## Public-domain and CC0 template photographs

The 106 photo-led templates across Photo Editions and Studio Editions use twelve bundled source images obtained from Wikimedia Commons, not Canva stock assets. Eight are marked CC0 and four public domain on their source pages. The resized/JPEG-compressed media retain those separate statuses; they are not relicensed as proprietary Visro imagery. The original editable layouts and copy remain AGPL-3.0-only.

- Complete per-image author, title, source page, source URL, license, modification and SHA-256 records: `public/template-photos/manifest.json`.
- Human-readable credits and license/source links: `public/template-photos/NOTICES.md`.
- The same notices and manifest ship in the packaged `template-photos/` asset directory. No endorsement of the fictional template brands by the source photographers or depicted people is implied.

The optional Commons photo-search service displays each result’s source and license, downloads only eligible public-domain/CC0 media through vetted Wikimedia hosts, and retains provenance with inserted image layers. The service does not grant rights to Canva’s catalog or make all Internet imagery public domain.
