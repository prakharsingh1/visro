import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Plus, Save, Trash2, Upload } from 'lucide-react';
import type { StudioEditor } from './editor';
import { newId } from './project';
import { listAssets, storeAsset } from './storage';
import type { LibraryAsset } from './storage';

interface BrandKit {
  id: string; name: string; colors: string[]; fonts: string[]; logos: string[]; updated: number;
}

export interface BrandKitsPanelProps {
  brand: { colors: string[]; fonts: string[] };
  getEditor: () => StudioEditor | null;
  onNotify: (message: string) => void;
  getSelectedPhoto?: () => string | null | Promise<string | null>;
}

const KEY = 'visro-brand-kits-v1';
const FONTS = ['Arial', 'Georgia', 'Helvetica', 'Verdana', 'Times New Roman', 'Courier New', 'Trebuchet MS', 'Impact', 'Palatino', 'Optima'];

function readKits(): BrandKit[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(stored) ? stored.filter((kit) => kit && typeof kit.id === 'string' && typeof kit.name === 'string' && Array.isArray(kit.colors) && Array.isArray(kit.fonts) && Array.isArray(kit.logos)).slice(0, 50).map((kit) => ({ ...kit, name: kit.name.slice(0, 80), colors: kit.colors.filter((value: unknown) => typeof value === 'string').slice(0, 32), fonts: kit.fonts.filter((value: unknown) => typeof value === 'string').slice(0, 32), logos: kit.logos.filter((value: unknown) => typeof value === 'string').slice(0, 12) })) : [];
  } catch { return []; }
}

function preview(data: string): string {
  return /^\s*<svg[\s>]/i.test(data) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}` : data;
}

export default function BrandKitsPanel({ brand, getEditor, onNotify, getSelectedPhoto }: BrandKitsPanelProps) {
  const [kits, setKits] = useState<BrandKit[]>(readKits);
  const kitsRef = useRef(kits);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const active = kits.find((kit) => kit.id === selectedId);

  useEffect(() => {
    let alive = true;
    void listAssets(["logo"]).then((stored) => { if (alive) setAssets(stored); }).catch(() => { if (alive) onNotify('Could not open the local logo library.'); });
    return () => { alive = false; };
  }, []);

  const persist = (next: BrandKit[]) => {
    localStorage.setItem(KEY, JSON.stringify(next)); kitsRef.current = next; setKits(next);
  };

  const saveKit = (notify = true): BrandKit => {
    if (!selectedId && kitsRef.current.length >= 50) throw new Error('You can keep up to 50 brand kits.');
    const old = kitsRef.current.find((kit) => kit.id === selectedId);
    const kit: BrandKit = { id: old?.id ?? newId('brand'), name: name.trim().slice(0, 80) || 'My brand kit', colors: brand.colors.slice(0, 32), fonts: brand.fonts.slice(0, 32), logos: old?.logos ?? [], updated: Date.now() };
    persist(old ? kitsRef.current.map((item) => item.id === kit.id ? kit : item) : [...kitsRef.current, kit]);
    setSelectedId(kit.id); setName(kit.name);
    if (notify) onNotify(`“${kit.name}” saved on this Mac.`);
    return kit;
  };

  const applyKit = (id: string) => {
    if (!id) { setSelectedId(''); setName(''); return; }
    const kit = kitsRef.current.find((item) => item.id === id); if (!kit) return;
    const editor = getEditor(); if (!editor) { onNotify('Open a design to apply a brand kit.'); return; }
    setSelectedId(id); setName(kit.name); editor.setBrand([...kit.colors], [...kit.fonts]);
    onNotify(`“${kit.name}” applied to this project.`);
  };

  const storeLogo = async (data: string, logoName: string, kit: BrandKit): Promise<BrandKit> => {
    if (kit.logos.length >= 12) throw new Error('A brand kit can contain up to 12 logos.');
    const asset: LibraryAsset = { id: newId('logo'), name: logoName, data, kind: 'logo', updated: Date.now() };
    await storeAsset(asset); setAssets((previous) => [asset, ...previous]);
    const next = { ...kit, logos: [...kit.logos, asset.id], updated: Date.now() };
    persist(kitsRef.current.map((item) => item.id === next.id ? next : item));
    return next;
  };

  const addLogos = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true);
    try {
      let kit = saveKit(false);
      for (const file of Array.from(files).slice(0, 12)) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) throw new Error('Choose a PNG, JPG, WebP, or SVG logo.');
        if (file.size > 10 * 1024 * 1024) throw new Error('Choose logos smaller than 10 MB.');
        const data = file.type === 'image/svg+xml' ? await file.text() : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the logo.')); reader.readAsDataURL(file);
        });
        kit = await storeLogo(data, file.name, kit);
      }
      onNotify('Logos saved in your local brand kit.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not save this logo.'); }
    finally { setBusy(false); if (logoInput.current) logoInput.current.value = ''; }
  };

  const saveSelectedLogo = async () => {
    setBusy(true);
    try {
      const data = getSelectedPhoto ? await getSelectedPhoto() : getEditor()?.getSelectedImageDataURL();
      if (!data) throw new Error('Select an image on the canvas to save as a logo.');
      await storeLogo(data, 'Logo from design', saveKit(false)); onNotify('Selected image saved as a brand logo.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not save the selected image.'); }
    finally { setBusy(false); }
  };

  const insertLogo = async (asset: LibraryAsset) => {
    setBusy(true);
    try {
      const editor = getEditor(); if (!editor) throw new Error('Open a design to add this logo.');
      if (/^\s*<svg[\s>]/i.test(asset.data)) await editor.addSVG(asset.data);
      else await editor.addImage(asset.data, asset.name);
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not add this logo.'); }
    finally { setBusy(false); }
  };

  return <section className="brand-kits-panel" aria-label="Brand kits">
    <div className="brand-kits-heading"><div><h3>Your brand kits</h3><p>Colours, type, and logos. Ready when you are.</p></div><button className="icon-button" title="New brand kit" onClick={() => { setSelectedId(''); setName(''); }}><Plus size={18}/></button></div>
    <label className="field-label">Saved kits<select aria-label="Saved brand kits" value={selectedId} onChange={(event) => applyKit(event.target.value)}><option value="">Create a new kit</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}</select></label>
    <label className="field-label">Kit name<input aria-label="Brand kit name" placeholder="Your brand name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)}/></label>
    <div className="brand-kit-actions"><button className="full-button dark" disabled={busy} onClick={() => { try { saveKit(); } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not save the brand kit.'); } }}><Save size={16}/>{active ? 'Save kit changes' : 'Save brand kit'}</button>{active && <button className="icon-button brand-kit-delete" title="Delete selected brand kit" onClick={() => { persist(kitsRef.current.filter((kit) => kit.id !== selectedId)); setSelectedId(''); setName(''); onNotify('Brand kit removed. Its logos stay in your asset library.'); }}><Trash2 size={17}/></button>}</div>
    <div className="section-label">Palette <span>{brand.colors.length} colours</span></div>
    <div className="brand-kit-palette">{brand.colors.map((color, index) => <div className="brand-kit-color" key={`${color}-${index}`}><button style={{ background: color }} title={`Apply ${color}`} onClick={() => { const editor = getEditor(); if (!editor) return; editor.getSelected() ? editor.updateSelected({ fill: color }) : editor.setBackground(color); }}/><span>{color.toUpperCase()}</span></div>)}<label className="brand-kit-add-color" title="Add a brand color"><Plus size={20}/><input aria-label="Add brand kit color" type="color" value="#F26B3A" onChange={(event) => getEditor()?.setBrand([...brand.colors, event.target.value], brand.fonts)}/></label></div>
    <div className="section-label">Typography</div><div className="brand-kit-font-list">{brand.fonts.map((font) => <button key={font} style={{ fontFamily: font }} onClick={() => getEditor()?.updateSelected({ fontFamily: font })}><span>{font}</span><strong>Aa</strong></button>)}</div>
    <label className="field-label">Add font to this kit<select aria-label="Add brand kit font" value="" onChange={(event) => { if (event.target.value && !brand.fonts.includes(event.target.value)) getEditor()?.setBrand(brand.colors, [...brand.fonts, event.target.value]); }}><option value="">Choose a typeface</option>{[...new Set([...FONTS, ...brand.fonts])].map((font) => <option key={font}>{font}</option>)}</select></label>
    <div className="section-label">Logos <span>{active?.logos.length ?? 0} saved</span></div>
    <div className="brand-kit-logos">{active?.logos.map((id) => {
      const asset = assets.find((item) => item.id === id);
      return asset ? <div className="brand-kit-logo" key={id}><button disabled={busy} title={`Add ${asset.name} to design`} onClick={() => void insertLogo(asset)}><img src={preview(asset.data)} alt={asset.name}/></button><span>{asset.name}</span><button className="icon-button" title={`Remove ${asset.name} from kit`} onClick={() => { const kit = { ...active, logos: active.logos.filter((logo) => logo !== id), updated: Date.now() }; persist(kitsRef.current.map((item) => item.id === kit.id ? kit : item)); }}><Trash2 size={13}/></button></div> : null;
    })}</div>
    <button className="full-button" disabled={busy} onClick={() => logoInput.current?.click()}><Upload size={16}/>Upload logos</button><button className="full-button" disabled={busy} onClick={() => void saveSelectedLogo()}><ImagePlus size={16}/>Save selected image as logo</button>
    <input ref={logoInput} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Upload brand logos" onChange={(event) => void addLogos(event.target.files)}/>
    <p className="brand-kit-local"><Check size={13}/>Brand kits and logos stay on this Mac.</p>
  </section>;
}
