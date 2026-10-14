import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, FileText, Image as ImageIcon, LoaderCircle, Music, Plus, Settings2, Sparkles, Video } from 'lucide-react';
import { desktop, type AIRequest, type AIResult, type AIProgress, type Settings } from './bridge';
import type { StudioEditor } from './editor';
import { documentParagraphs, editableDesign, existingSequence, withGeneratedMedia } from './magic-media';

export type MagicMediaKind = AIRequest['kind'];
interface Props {
  getEditor: () => StudioEditor | null;
  settings: Settings;
  onSettings: () => void;
  onNotify: (message: string) => void;
  onMode?: (mode: 'design' | 'document' | 'sheet' | 'video') => void;
  initialKind?: MagicMediaKind;
  initialText?: string;
}
const VOICES = ['Kore','Puck','Zephyr','Charon','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat'];
const TAB_KINDS = { design: ['design', 'remix', 'resize'], images: ['image', 'edit'], video: ['video'], audio: ['voice'], write: ['copy', 'translate', 'rewrite', 'summarize'] } as const;
const LABELS: Record<MagicMediaKind, string> = { design: 'Generate design', remix: 'Remix design', resize: 'Adapt design', image: 'Generate image', edit: 'Edit image', video: 'Generate video', voice: 'Generate speech', copy: 'Write', translate: 'Translate', rewrite: 'Rewrite', summarize: 'Summarize' };
const EXAMPLES: Partial<Record<MagicMediaKind, string[]>> = {
  design: ['A bold product launch', 'A presentation cover', 'A restaurant menu'],
  image: ['Editorial still life', 'Dreamy landscape', 'Minimal product shot'],
  edit: ['Remove an object', 'Change the background', 'Restyle as a painting'],
  video: ['A slow cinematic product reveal', 'A sunrise over mountain peaks', 'A playful animated brand intro'],
  copy: ['Write 5 headlines', 'Find a brand tagline', 'Draft a short product announcement'],
};
function DesignPreview({ design }: { design: NonNullable<AIResult['design']> }) {
  return <svg className="magic-design-preview" viewBox={`0 0 ${design.width} ${design.height}`} role="img" aria-label={`Preview of ${design.name}`} style={{ width: '100%', aspectRatio: `${design.width}/${design.height}`, display: 'block' }}>
    <rect width={design.width} height={design.height} fill={design.background}/>
    {design.elements.map((e, i) => {
      const x = Number(e.x) || 0, y = Number(e.y) || 0, width = Number(e.width) || 100, height = Number(e.height) || 100;
      const props = { key: i, fill: String(e.fill || '#222'), opacity: Number(e.opacity ?? 1), transform: `rotate(${Number(e.angle ?? e.rotation) || 0} ${x} ${y})` };
      if (e.type === 'rect') return <rect {...props} x={x} y={y} width={width} height={height}/>;
      if (e.type === 'circle') return <ellipse {...props} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2}/>;
      const size = Number(e.fontSize) || 32, alignment = e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start';
      return <text {...props} x={alignment === 'middle' ? x + width / 2 : alignment === 'end' ? x + width : x} y={y + size} fontSize={size} fontFamily={String(e.fontFamily || 'Arial')} fontWeight={String(e.fontWeight || 'normal')} textAnchor={alignment}>{String(e.text || '').split('\n').map((line, j) => <tspan key={j} x={alignment === 'middle' ? x + width / 2 : alignment === 'end' ? x + width : x} dy={j ? size * 1.2 : 0}>{line}</tspan>)}</text>;
    })}
  </svg>;
}

export function MagicMediaPanel({ getEditor, settings, onSettings, onNotify, onMode, initialKind = 'design', initialText = '' }: Props) {
  const [kind, setKind] = useState<MagicMediaKind>(initialKind), [prompt, setPrompt] = useState(initialKind === 'voice' ? initialText : ''), [source, setSource] = useState(initialKind === 'voice' ? '' : initialText);
  const [language, setLanguage] = useState('English'), [tone, setTone] = useState(''), [voice, setVoice] = useState('Kore'), [aspect, setAspect] = useState<'16:9'|'9:16'>('16:9'), [duration, setDuration] = useState<4|6|8>(8), [useImage, setUseImage] = useState(false);
  const [width, setWidth] = useState(getEditor()?.width || 1080), [height, setHeight] = useState(getEditor()?.height || 1080);
  const [result, setResult] = useState<AIResult|null>(null), [resultKind, setResultKind] = useState<MagicMediaKind>(initialKind), [busy, setBusy] = useState(false), [applying, setApplying] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState<AIProgress|null>(null);
  const alive = useRef(true), running = useRef<string|null>(null);
  const tab = (Object.keys(TAB_KINDS) as Array<keyof typeof TAB_KINDS>).find((name) => (TAB_KINDS[name] as readonly string[]).includes(kind)) || 'design';
  const textAction = ['translate','rewrite','summarize'].includes(kind), mediaJob = ['voice','video'].includes(kind);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = desktop?.onAIProgress((p) => { if (alive.current && p.requestId === running.current) setProgress(p); });
    return () => { alive.current = false; unsubscribe?.(); if (running.current) void desktop?.cancelAI(running.current).catch(() => {}); };
  }, []);
  const changeKind = (next: MagicMediaKind) => { setKind(next); setResult(null); setError(''); setProgress(null); };
  const run = async () => {
    if (busy) return;
    if (!desktop) { setError('Open the Visro Mac app to connect your Gemini key.'); return; }
    if (!settings.hasKey) { onSettings(); return; }
    const editor = getEditor();
    if (!editor) { setError('Open a project before generating media.'); return; }
    setBusy(true); setError(''); setResult(null); setProgress(null);
    const requestId = mediaJob ? crypto.randomUUID() : null;
    running.current = requestId;
    try {
      const selected = editor.getSelected();
      const text = source.trim() || (textAction ? selected?.text?.trim() : '') || '';
      if (!prompt.trim() && !text && !['remix','resize'].includes(kind)) throw new Error(kind === 'voice' ? 'Enter the words you want spoken.' : 'Describe what you want to create.');
      if (textAction && !text && !prompt.trim()) throw new Error('Select text or paste the source text here.');
      const input: AIRequest = { kind, prompt: prompt.trim(), width: kind === 'resize' ? width : editor.width, height: kind === 'resize' ? height : editor.height };
      if (textAction) { input.text = text || prompt.trim(); input.language = language; input.tone = tone; }
      if (kind === 'copy' && source.trim()) input.prompt = `${prompt.trim()}\n\nSource text:\n${source.trim()}`;
      if (kind === 'copy' && tone.trim()) input.prompt += `\nTone: ${tone.trim()}`;
      if (kind === 'voice') { input.text = prompt.trim() || source.trim(); input.voiceName = voice; input.tone = tone; }
      if (kind === 'video') { input.aspectRatio = aspect; input.durationSeconds = duration; }
      if (requestId) input.requestId = requestId;
      if (kind === 'edit' || (kind === 'video' && useImage)) {
        if (selected?.type !== 'image') throw new Error('Select an image on the canvas first.');
        input.image = await editor.selectedImageDataURL();
      }
      if (['remix','resize'].includes(kind)) input.design = editableDesign(editor.serialize());
      const output = await desktop.runAI(input);
      if (alive.current) { setResult(output); setResultKind(kind); }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Generation failed.'); }
    finally { running.current = null; if (alive.current) setBusy(false); }
  };
  const apply = async (target: 'default'|'replace'|'document' = 'default') => {
    const editor = getEditor();
    if (!result || !editor || applying) return;
    setApplying(true); setError('');
    try {
      if (result.media) {
        const project = editor.serialize();
        const sequence = existingSequence(project.kind, editor.getProjectContent());
        const length = sequence.scenes.reduce((sum, scene) => sum + scene.duration, 0);
        const image = result.media.kind === 'audio' && length < result.media.duration ? await editor.exportImage({ format: 'png', scale: 1 }) : undefined;
        editor.setProjectMetadata({ kind: 'video', content: withGeneratedMedia(sequence, result.media, image) });
        onMode?.('video'); onNotify(result.media.kind === 'audio' ? 'Voiceover added to your timeline.' : 'Generated video added to your timeline.');
      } else if (result.design) {
        await editor.addPage();
        await editor.insertDesign(result.design as unknown as Parameters<StudioEditor['insertDesign']>[0]);
        onMode?.('design'); onNotify('Your editable design was added as a new page.');
      } else if (result.image) {
        if (target === 'replace') {
          if (editor.getSelected()?.type !== 'image') throw new Error('Select an image to replace.');
          await editor.replaceSelectedImage(result.image);
        } else await editor.addImage(result.image, 'Gemini image');
        onMode?.('design'); onNotify(target === 'replace' ? 'Selected image updated.' : 'Generated image added to your canvas.');
      } else if (result.text) {
        if (target === 'document') {
          const current = editor.state.kind === 'document' && typeof editor.getProjectContent() === 'string' ? String(editor.getProjectContent()) : '';
          editor.setProjectMetadata({ kind: 'document', content: current + documentParagraphs(result.text) });
          onMode?.('document'); onNotify('Writing added to your document.');
        } else {
          if (target === 'replace' || (['translate','rewrite','summarize'].includes(resultKind) && editor.getSelected()?.type === 'text')) {
            if (editor.getSelected()?.type !== 'text') throw new Error('Select text to replace.');
            editor.updateSelected({ text: result.text });
          } else { editor.addText('body'); editor.updateSelected({ text: result.text }); }
          onMode?.('design'); onNotify('Writing added to your design.');
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add this creation.'); }
    finally { if (alive.current) setApplying(false); }
  };
  const stop = async () => { if (!running.current || !desktop) return; try { await desktop.cancelAI(running.current); } catch (e) { setError(e instanceof Error ? e.message : 'Could not stop waiting.'); } };
  return <div className="magic-media-panel">
    <div className="ai-banner"><span className="ai-orb"><Sparkles size={23}/></span><div><strong>Magic Media</strong><span>Create with your Gemini key.</span></div></div>
    <div className="ai-tabs magic-media-tabs" role="tablist" aria-label="Magic Media tools">{(Object.keys(TAB_KINDS) as Array<keyof typeof TAB_KINDS>).map((name) => <button role="tab" aria-selected={tab === name} key={name} disabled={busy} className={tab === name ? 'active' : ''} onClick={() => changeKind(TAB_KINDS[name][0])}>{name[0].toUpperCase() + name.slice(1)}</button>)}</div>
    {TAB_KINDS[tab].length > 1 && <div className="magic-action-grid">{TAB_KINDS[tab].map((action) => <button key={action} disabled={busy} className={kind === action ? 'active' : ''} onClick={() => changeKind(action)}>{LABELS[action]}</button>)}</div>}
    {textAction && <label className="field-label">Source text<textarea aria-label="Source text" className="ai-prompt" maxLength={40000} placeholder="Paste text, or leave this empty to use selected text." value={source} onChange={(e) => setSource(e.target.value)}/></label>}
    {kind === 'translate' && <label className="field-label">Language<select aria-label="Translate language" value={language} onChange={(e) => setLanguage(e.target.value)}>{['English','Hindi','Marathi','Spanish','French','German','Japanese','Chinese','Arabic','Portuguese','Italian','Korean'].map((value) => <option key={value}>{value}</option>)}</select></label>}
    <label className="prompt-label" htmlFor="magic-prompt">{kind === 'voice' ? 'What should the voice say?' : textAction ? 'Instructions (optional)' : kind === 'edit' ? 'What would you change?' : 'Describe your idea'}</label>
    <textarea id="magic-prompt" className="ai-prompt" aria-label="AI prompt" maxLength={kind === 'video' ? 4000 : 12000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={kind === 'voice' ? 'Enter your narration, announcement or voiceover script…' : textAction ? 'Keep the tone warm and concise…' : kind === 'video' ? 'A cinematic close-up of a ceramic cup, steam rising, soft morning light…' : kind === 'edit' ? 'Change the background and keep the subject…' : 'A warm, minimal coffee shop launch with earthy colours…'}/>
    {['voice','rewrite','copy'].includes(kind) && <label className="field-label">Tone (optional)<input aria-label="AI tone" maxLength={160} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Warm, playful, confident…"/></label>}
    {kind === 'voice' && <label className="field-label">Voice<select aria-label="Gemini voice" value={voice} onChange={(e) => setVoice(e.target.value)}>{VOICES.map((value) => <option key={value}>{value}</option>)}</select></label>}
    {kind === 'resize' && <div className="magic-size-fields"><label className="field-label">Width<input aria-label="AI design width" type="number" min={16} max={8192} value={width} onChange={(e) => setWidth(Math.min(8192, Math.max(16, Number(e.target.value))))}/></label><label className="field-label">Height<input aria-label="AI design height" type="number" min={16} max={8192} value={height} onChange={(e) => setHeight(Math.min(8192, Math.max(16, Number(e.target.value))))}/></label></div>}
    {kind === 'video' && <><div className="magic-size-fields"><label className="field-label">Aspect ratio<select aria-label="AI video aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)}><option value="16:9">Landscape 16:9</option><option value="9:16">Portrait 9:16</option></select></label><label className="field-label">Duration<select aria-label="AI video duration" value={duration} onChange={(e) => setDuration(Number(e.target.value) as 4|6|8)}>{[4,6,8].map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></label></div><label className="magic-image-option"><input type="checkbox" checked={useImage} onChange={(e) => setUseImage(e.target.checked)}/>Animate selected image</label><p className="small-hint">Veo requires model access and a billed Gemini account. Generation can take several minutes.</p></>}
    {kind === 'edit' && <p className="small-hint"><ImageIcon size={14}/> Select an image on your canvas. Its bytes will be sent to Gemini.</p>}
    {['remix','resize'].includes(kind) && <p className="small-hint">Gemini adapts the active page’s editable text and shapes.</p>}
    <button className="full-button coral" disabled={busy || applying} onClick={() => void run()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} {busy ? 'Creating…' : LABELS[kind]}</button>
    {busy && mediaJob && <div className="magic-progress" role="status"><div className="progress-track"><span style={{ width: `${progress?.percent || 3}%` }}/></div><span>{progress?.message || 'Sending your request to Google…'}</span><button className="full-button" onClick={() => void stop()}>Stop waiting</button>{kind === 'video' && <p className="small-hint">Stopping Visro’s wait may leave an accepted Google render running and billable.</p>}</div>}
    {!busy && EXAMPLES[kind] && <div className="ai-suggestions">{EXAMPLES[kind]!.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}<ArrowUpRight size={12}/></button>)}</div>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {result && <div className="ai-result"><div className="section-label"><span>Your creation</span><CheckCircle2 size={15}/></div>
      {result.image && <img src={result.image} alt="Gemini generated result"/>}
      {result.design && <><DesignPreview design={result.design}/><p><strong>{result.design.name}</strong><br/>{result.design.elements.length} editable elements · {result.design.width} × {result.design.height}</p></>}
      {result.text && <textarea aria-label="Generated writing" value={result.text} onChange={(e) => setResult({ ...result, text: e.target.value })}/>}
      {result.media && <div className="magic-media-preview">{result.media.kind === 'video' ? <video controls preload="metadata" src={result.media.src} poster={result.media.thumbnail}/> : <><img src={result.media.thumbnail} alt="Voice waveform"/><audio controls preload="metadata" src={result.media.src}/></>}<p><strong>{result.media.name}</strong><br/>{result.media.duration.toFixed(1)} seconds · saved in your local library</p></div>}
      <button className="full-button dark" disabled={applying} onClick={() => void apply()}>{result.media?.kind === 'video' ? <Video size={16}/> : result.media ? <Music size={16}/> : <Plus size={16}/>} {applying ? 'Adding…' : result.media ? 'Add to timeline' : result.design ? 'Add as editable page' : 'Add to design'}</button>
      {result.text && <><button className="full-button" disabled={applying} onClick={() => void apply('replace')}>Replace selected text</button><button className="full-button" disabled={applying} onClick={() => void apply('document')}><FileText size={16}/>Add to document</button></>}
      {result.image && <button className="full-button" disabled={applying} onClick={() => void apply('replace')}>Replace selected image</button>}
    </div>}
    <button className="key-status" onClick={onSettings}><span className={settings.hasKey ? 'connected-dot' : 'disconnected-dot'}/><span>{settings.hasKey ? 'Gemini settings' : 'Connect your Gemini key'}</span><Settings2 size={15}/></button>
    <p className="privacy-copy">Prompts and chosen source images go directly to Google. Your projects and generated media stay local. API usage is billed to your Gemini account.</p>
  </div>;
}

export default MagicMediaPanel;
