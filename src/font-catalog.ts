import manifest from '../scripts/font-manifest.json' with { type: 'json' };

export const FONT_FAMILIES: string[] = manifest.families.map((family) => family.name);
export const DESIGN_FONT_FAMILIES = FONT_FAMILIES;
export const fontFamilies = FONT_FAMILIES;
let loading: Promise<void> | undefined;

/** Load only packaged font files, once, before restoring a design. */
export function loadDesignFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const base = import.meta.env?.BASE_URL || './';
    const faces = manifest.families.flatMap((family) => family.faces.map((face) => new FontFace(
      family.name,
      `url("${base}fonts/${face.file}") format("woff2")`,
      { weight: face.weight, style: 'normal', display: 'swap' },
    )));
    await Promise.all(faces.map(async (face) => { await face.load(); document.fonts.add(face); }));
    await document.fonts.ready;
  })();
  loading.catch(() => { loading = undefined; });
  return loading;
}
