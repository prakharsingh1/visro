import manifest from '../scripts/font-manifest.json' with { type: 'json' };

export type DesignFontCategory='Sans serif'|'Serif'|'Handwritten'|'Brush'|'Display'|'Monospace';
const categoryFamilies:Record<DesignFontCategory,string[]>={
  'Sans serif':['Montserrat','Poppins','Open Sans','Lato','Roboto','League Spartan','DM Sans','Nunito','Raleway','Inter','Quicksand','Manrope','Comfortaa'],
  Serif:['Playfair Display','Libre Baskerville','Cormorant Garamond','Cinzel','Abril Fatface','DM Serif Display','Fraunces'],
  Handwritten:['Pacifico','Dancing Script','Patrick Hand','Caveat','Shadows Into Light','Amatic SC','Shantell Sans','Allura','Great Vibes'],
  Brush:['Knewave','Kaushan Script','Sedgwick Ave Display','Kalam'],
  Display:['Anton','Bebas Neue','Archivo Black','Oswald','Alfa Slab One','Bungee','Black Ops One','Rubik Dirt','Rubik Glitch','Monoton','Press Start 2P','Shrikhand'],
  Monospace:['Space Mono'],
};
export const FONT_CATEGORIES=Object.keys(categoryFamilies) as DesignFontCategory[];
export const FONT_CATALOG=manifest.families.map(family=>({...family,category:FONT_CATEGORIES.find(category=>categoryFamilies[category].includes(family.name))??'Display'}));
export const FONT_FAMILIES: string[] = FONT_CATALOG.map((family) => family.name);
export const DESIGN_FONT_FAMILIES = FONT_FAMILIES;
export const fontFamilies = FONT_FAMILIES;
export function searchDesignFonts(query='',category='All'){const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return FONT_CATALOG.filter(family=>(category==='All'||family.category===category)&&words.every(word=>`${family.name} ${family.category}`.toLocaleLowerCase().includes(word)));}
let loading: Promise<void> | undefined;
const installedFaces=new Set<string>();

/** Full Unicode faces are packaged locally. Bounded decoding keeps startup
 * work predictable; a failed face can retry without reinstalling good faces. */
export function loadDesignFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const base = import.meta.env?.BASE_URL || './';
    const entries=manifest.families.flatMap(family=>family.faces.map(face=>({family:family.name,...face}))),errors:Error[]=[];
    let next=0;
    await Promise.all(Array.from({length:Math.min(8,entries.length)},async()=>{
      while(next<entries.length){
        const entry=entries[next++],key=`${entry.family}:${entry.file}`;if(installedFaces.has(key))continue;
        try{
          const face=new FontFace(entry.family,`url("${base}fonts/${entry.file}") format("woff2")`,{weight:entry.weight,style:'normal',display:'swap'});
          await face.load();document.fonts.add(face);installedFaces.add(key);
        }catch{errors.push(new Error(`The packaged ${entry.family} font could not be loaded. Reopen Visro to retry.`));}
      }
    }));
    if(errors.length)throw errors[0];
    await document.fonts.ready;
  })();
  loading.catch(() => { loading = undefined; });
  return loading;
}
