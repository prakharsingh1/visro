# Import a Canva export

Visro can open supported **PowerPoint (`.pptx`)** and **SVG (`.svg`)** exports as local editable designs. No Gemini key or Canva account connection is needed in Visro. Import works from the file you choose; it cannot read a Canva design link, a private `.canva` file or Canva's original server-side layer model.

## Export your design from Canva

Open your own design in Canva, select **Share → Download**, choose a format and download it. Canva's [download instructions](https://www.canva.com/help/download-or-purchase/) explain page selection and the available options.

| Choose | Best use in Visro | What to expect |
| --- | --- | --- |
| **Microsoft PowerPoint (`.pptx`)** | Presentations with multiple pages and editable text | Supported exported text, shapes, photos and groups can become native objects. |
| **SVG** | Static vector artwork or an individual page | Supported text, vectors, embedded images and exported groups can remain editable. Letters exported as outlines stay vector paths. |

Canva currently offers PPTX for presentations; SVG availability depends on the Canva plan and design. See Canva's [supported download file types](https://www.canva.com/help/download-file-types/) for its current restrictions. If Canva downloads several SVG pages as a ZIP, extract the ZIP and import an individual `.svg` file.

PNG and JPG contain finished pixels. Visro's PDF import produces pages for annotation. These formats do not reconstruct the original Canva text boxes, layers or groups.

## Open the file in Visro

1. Choose **File → Import from Canva…**.
2. Read the introduction, choose **Choose PPTX or SVG**, and select the downloaded file. You can also choose **Upload** on Home and select a PPTX or SVG.
3. Visro creates a new local design. The report lists page, text, image, vector and group counts, followed by any **Import notes**.
4. Review the notes, choose **Start editing**, and compare each page with the original export. Click text to select it and double-click to edit; ungroup supported groups when you need their individual objects.
5. Save a portable **`.visro`** file when you want a backup. The Canva source and downloaded export are unchanged.

Import reads the selected file locally. It does not fetch a design from Canva or require another cloud service. A linked external image is not downloaded automatically; use an export containing embedded images.

## What can stay editable

**PPTX import is best effort.** Supported text runs retain text and common style properties. Supported shapes and line geometry become vectors, embedded photos retain supported crops, groups retain their exported transforms, and presentation slides become Visro pages. The importer can only use objects included in the export.

Some PowerPoint features are approximated or skipped, including unsupported preset/custom shapes, tables/charts/diagrams, embedded objects, animations/transitions, artistic effects and decorative master/layout layers. Text wrapping, autofit, list markers and font metrics can differ. The import report describes detected omissions and appearance differences; review the artwork even when the report is short.

**SVG import preserves supported export structure.** Live SVG text can become editable text, vectors stay vectors, embedded photos remain images, and exported groups become editable groups. SVG filters, masks and patterns can look different. Its group hierarchy and layer names may differ from the original Canva design.

If Canva outlined text, the export contains paths rather than the original words and font data. Visro cannot recover those text boxes. If Canva flattened an effect or several objects into one image, that image cannot be separated back into its original layers.

## Fonts and import notes

Missing fonts and unsupported content appear in **Import notes**. Choose a bundled font in Visro or upload a font you are licensed to use, then review line breaks and alignment. Font files are not recovered from Canva or downloaded automatically by this importer.

Keep the exported file as a reference. For a troublesome design, try a smaller selection of pages or simpler artwork, then report a minimal non-sensitive sample in [GitHub Issues](https://github.com/prakharsingh1/visro/issues).

## File limits

- PPTX: up to 40 MiB, 1–100 slides, and up to 100 MiB of expanded archive content.
- SVG: up to 6 MiB, static self-contained content and supported canvas dimensions.
- Scripts, active SVG content and external resource references are rejected. Larger or unusually complex files can also be rejected to keep the local editor responsive.

Supported input is not a promise of exact visual equivalence. Importing an export does not add Canva stock assets or templates to Visro's public library, and the original content's license still applies.

The 0.9.0 importer passed 10 parser/engine tests and six dialog tests. Actual browser and packaged Mac checks imported PPTX/SVG, edited a native PPTX text layer, painted Home covers and reopened the exact saved objects. See [Validation](VALIDATION.md) for the completed checks and their limits, and [Getting started](GETTING_STARTED.md) for local saving and backups.
