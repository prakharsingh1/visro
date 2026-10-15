import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Plus, Upload, Video, Music, Trash2, Download, ChevronLeft, ChevronRight, Copy, Volume2, Captions } from 'lucide-react';
import { desktop, saveExport, type MediaAsset, type TimelineClip, type TimelineAudio, type MediaProgress, type CaptionCue, type CaptionStyle } from './bridge';
import type { StudioEditor } from './editor';
import { normalizeCaptionStyle, locateScene, captionTimestamp, serializeCaptions } from './captions';
import { CaptionsPanel } from './CaptionsPanel';
import './media-captions.css';

type Scene = TimelineClip & { id: string; name: string; thumbnail?: string; pageId?: string };
type Sequence = { scenes: Scene[]; audio: TimelineAudio[]; captions: CaptionCue[]; captionStyle: CaptionStyle; burnCaptions: boolean };
function initialSequence(initial: unknown, height: number): Sequence {
  const value = initial as Partial<Sequence> | undefined;
  return {
    scenes: Array.isArray(value?.scenes) ? value.scenes.filter(scene => scene && ['video', 'image'].includes(scene.kind) && Number.isFinite(scene.duration) && scene.duration >= .1 && scene.duration <= 600).slice(0, 100).map(scene => ({ ...scene, id: typeof scene.id === 'string' ? scene.id : crypto.randomUUID() })) : [],
    audio: Array.isArray(value?.audio) ? value.audio.slice(0, 16) : [],
    captions: Array.isArray(value?.captions) ? value.captions.filter(cue => cue && typeof cue.text === 'string' && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.end <= 3600).slice(0, 1000).map(cue => ({ ...cue, text: cue.text.slice(0, 2000), id: typeof cue.id === 'string' ? cue.id : crypto.randomUUID() })) : [],
    captionStyle: normalizeCaptionStyle(value?.captionStyle, height), burnCaptions: value?.burnCaptions !== false,
  };
}
export function MediaStudio({ getEditor, name, initial, designId, width, height, onNotify }: { getEditor: () => StudioEditor | null; name: string; initial?: unknown; designId: string; width: number; height: number; onNotify: (message: string) => void }) {
  const [sequence, setSequence] = useState(() => initialSequence(initial, height));
  const [assets, setAssets] = useState<MediaAsset[]>([]), [selected, setSelected] = useState(0), [playing, setPlaying] = useState(false), [playhead, setPlayhead] = useState(0);
  const [format, setFormat] = useState<'mp4' | 'webm' | 'gif'>('mp4'), [progress, setProgress] = useState<MediaProgress | null>(null), [exporting, setExporting] = useState(false), [error, setError] = useState(''), [tab, setTab] = useState<'video' | 'audio' | 'captions'>('video');
  const videoRef = useRef<HTMLVideoElement>(null), audioRefs = useRef(new Map<number, HTMLAudioElement>()), previewRef = useRef<HTMLDivElement>(null), frameRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef(0), editorRef = useRef(getEditor), sequenceRef = useRef(sequence), assetsRef = useRef(assets), selectedRef = useRef(selected), playingRef = useRef(playing);
  editorRef.current = getEditor; sequenceRef.current = sequence; assetsRef.current = assets; selectedRef.current = selected; playingRef.current = playing;
  const { scenes, audio, captions, captionStyle, burnCaptions } = sequence;
  const scene = scenes[selected], asset = assets.find(item => item.id === scene?.mediaId), total = scenes.reduce((sum, item) => sum + item.duration, 0), prefix = scenes.slice(0, selected).reduce((sum, item) => sum + item.duration, 0);
  const offset = Math.max(0, playhead - prefix), activeCaptions = burnCaptions ? captions.filter(cue => cue.start <= playhead && cue.end > playhead && cue.text.trim()) : [];
  useEffect(() => { void desktop?.listMedia().then(setAssets).catch(e => setError(e.message)); return desktop?.onMediaProgress(setProgress); }, []);
  useEffect(() => { const next = initialSequence(initial, height); sequenceRef.current = next; setSequence(next); setSelected(0); setPlaying(false); setPlayhead(0); playheadRef.current = 0; }, [designId]);
  const persist = useCallback((patch: Partial<Sequence>) => {
    const next = { ...sequenceRef.current, ...patch };
    sequenceRef.current = next; setSequence(next);
    editorRef.current()?.setProjectMetadata({ kind: 'video', content: next });
  }, []);
  const getTime = useCallback(() => playheadRef.current, []);
  const seek = useCallback((time: number, pause = true) => {
    const current = sequenceRef.current.scenes, length = current.reduce((sum, item) => sum + item.duration, 0), next = Math.max(0, Math.min(length, time));
    const position = locateScene(current, next);
    playheadRef.current = next; setPlayhead(next); setSelected(position.index);
    if (pause) setPlaying(false);
    const node = videoRef.current;
    if (position.index === selectedRef.current && node?.readyState && current[position.index]?.kind === 'video') node.currentTime = (current[position.index].trimStart || 0) + position.offset;
  }, []);
  const seekPaused = useCallback((time: number) => seek(time), [seek]);
  const updateScenes = useCallback((next: Scene[]) => { setPlaying(false); persist({ scenes: next }); seek(Math.min(playheadRef.current, next.reduce((sum, item) => sum + item.duration, 0))); }, [persist, seek]);
  const updateAudio = useCallback((next: TimelineAudio[]) => persist({ audio: next }), [persist]);
  const updateCaptions = useCallback((next: CaptionCue[]) => persist({ captions: next }), [persist]);
  const updateCaptionStyle = useCallback((next: CaptionStyle) => persist({ captionStyle: next }), [persist]);
  const updateCaptionBurn = useCallback((next: boolean) => persist({ burnCaptions: next }), [persist]);
  const reportError = useCallback((message: string) => setError(message), []);
  const togglePlay = useCallback(() => {
    if (!sequenceRef.current.scenes.length) return;
    const length = sequenceRef.current.scenes.reduce((sum, item) => sum + item.duration, 0);
    if (!playingRef.current && playheadRef.current >= length - .01) seek(0, false);
    setPlaying(current => !current);
  }, [seek]);
  const syncLoadedVideo = useCallback(() => {
    const node = videoRef.current, current = sequenceRef.current.scenes[selectedRef.current];
    if (!node || !current) return;
    const start = sequenceRef.current.scenes.slice(0, selectedRef.current).reduce((sum, item) => sum + item.duration, 0);
    node.currentTime = (current.trimStart || 0) + Math.max(0, playheadRef.current - start);
    node.volume = Math.max(0, Math.min(1, current.volume ?? 1));
    if (playingRef.current) void node.play().catch(() => setPlaying(false));
  }, []);
  useEffect(() => { const node = videoRef.current; if (node?.readyState) syncLoadedVideo(); }, [scene?.id, scene?.trimStart, asset?.src, syncLoadedVideo]);
  useEffect(() => {
    const viewport = previewRef.current, frame = frameRef.current;
    if (!viewport || !frame) return;
    const resize = () => { const bounds = viewport.getBoundingClientRect(), frameWidth = Math.max(1, Math.min(bounds.width - 40, (bounds.height - 40) * width / height)); frame.style.width = `${frameWidth}px`; frame.style.height = `${frameWidth * height / width}px`; frame.style.setProperty('--caption-scale', String(frameWidth / width)); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(viewport); return () => observer.disconnect();
  }, [width, height, scene?.id]);
  useEffect(() => {
    const node = videoRef.current;
    if (!playing || !scene) { node?.pause(); audioRefs.current.forEach(item => item.pause()); return; }
    if (scene.kind === 'video' && !node) { setPlaying(false); setError('This clip is no longer in the local media library. Import it again.'); return; }
    if (node) { node.volume = Math.max(0, Math.min(1, scene.volume ?? 1)); if (node.readyState) void node.play().catch(() => setPlaying(false)); }
    const started = performance.now(), initialTime = playheadRef.current;
    let frame = 0, lastUI = 0, lastAudio = -Infinity;
    const tick = (now: number) => {
      const elapsed = scene.kind === 'video' ? node?.readyState ? prefix + Math.max(0, node.currentTime - (scene.trimStart || 0)) : playheadRef.current : initialTime + (now - started) / 1000;
      const time = Math.min(total, prefix + scene.duration, elapsed);
      playheadRef.current = time;
      if (now - lastUI > 32) { setPlayhead(time); lastUI = now; }
      if (now - lastAudio > 80) {
        for (const [index, track] of audio.entries()) {
          const sound = audioRefs.current.get(index), source = assetsRef.current.find(item => item.id === track.mediaId);
          if (!sound || sound.readyState < 1) continue;
          const trim = track.trimStart || 0, start = track.start || 0, duration = track.duration ?? Math.max(0, (source?.duration || 0) - trim);
          sound.volume = Math.max(0, Math.min(1, track.volume ?? .5));
          if (time < start || time >= start + duration) sound.pause();
          else { const desired = trim + time - start; if (Math.abs(sound.currentTime - desired) > .15) sound.currentTime = desired; if (sound.paused) void sound.play().catch(() => {}); }
        }
        lastAudio = now;
      }
      if (time >= prefix + scene.duration - .002 || node?.ended) {
        const next = Math.min(total, prefix + scene.duration); playheadRef.current = next; setPlayhead(next);
        if (selected < scenes.length - 1) setSelected(selected + 1); else setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); node?.pause(); audioRefs.current.forEach(item => item.pause()); };
  }, [playing, selected, scene, prefix, total, audio, scenes.length]);
  const work = async (operation: () => Promise<unknown>) => { setError(''); try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Media action failed.'); } };
  const importFiles = () => void work(async () => { if (!desktop || tab === 'captions') throw new Error('Import video and audio from the Visro Mac app.'); await desktop.importMedia(tab); setAssets(await desktop.listMedia()); });
  const addAsset = (item: MediaAsset) => {
    if (item.kind === 'audio') { if (audio.length >= 16) { setError('A timeline can contain up to 16 audio tracks.'); return; } updateAudio([...audio, { mediaId: item.id, start: 0, trimStart: 0, duration: item.duration, volume: .6 }]); }
    else { if (scenes.length >= 100) { setError('A timeline can contain up to 100 scenes.'); return; } updateScenes([...scenes, { id: crypto.randomUUID(), name: item.name, kind: 'video', mediaId: item.id, duration: Math.min(item.duration, 30), trimStart: 0, volume: 1, fit: 'cover', transition: 'none', thumbnail: item.thumbnail }]); }
  };
  const addPages = () => void work(async () => { const editor = getEditor(); if (!editor) return; const pages = await editor.exportPages(1); if (pages.length + scenes.length > 100) throw new Error('A timeline can contain up to 100 scenes.'); updateScenes([...scenes, ...pages.map((page, i) => ({ id: crypto.randomUUID(), name: `Page ${i + 1}`, kind: 'image' as const, image: page.dataURL, thumbnail: page.dataURL, pageId: page.id, duration: 5, transition: 'none' as const }))]); onNotify('Design pages added to your video timeline.'); });
  const exportVideo = () => void work(async () => { if (!desktop) throw new Error('Use the Mac app to render video.'); if (!scenes.length) throw new Error('Add a video clip or design page first.'); setExporting(true); setProgress(null); try { const result = await desktop.exportTimeline({ name, width, height, format, fps: 30, clips: scenes, audio, captions: burnCaptions ? captions.filter(cue => cue.text.trim()) : [], captionStyle }); if (result) onNotify(`Video exported: ${result.name}`); } finally { setExporting(false); } });
  const downloadCaptions = useCallback((captionFormat: 'srt' | 'vtt') => {
    const text = serializeCaptions(sequenceRef.current.captions, captionFormat), mime = captionFormat === 'srt' ? 'application/x-subrip' : 'text/vtt';
    const reader = new FileReader();
    reader.onload = () => { void saveExport(name, captionFormat, String(reader.result)).catch(e => setError(e instanceof Error ? e.message : 'Captions could not be exported.')); };
    reader.onerror = () => setError('Captions could not be exported.'); reader.readAsDataURL(new Blob([text], { type: mime }));
  }, [name]);
  const patch = (changes: Partial<Scene>) => { const next = scenes.map((item, i) => i === selected ? { ...item, ...changes } : item); if (Object.keys(changes).length === 1 && changes.volume !== undefined) persist({ scenes: next }); else updateScenes(next); };
  const selectScene = (index: number) => seek(scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0));
  const captionBackground = `${captionStyle.background}${Math.round(captionStyle.backgroundOpacity * 255).toString(16).padStart(2, '0')}`;
  const fade = scene?.transition === 'fade' ? Math.min(1, offset / Math.min(.4, scene.duration / 3)) : 1;
  return <div className="media-studio" onKeyDownCapture={event => { if (event.code === 'Space' && !(event.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) { event.preventDefault(); event.stopPropagation(); togglePlay(); } }}>
    <aside className="media-library"><div className="segmented"><button className={tab === 'video' ? 'active' : ''} onClick={() => setTab('video')}><Video size={15}/>Videos</button><button className={tab === 'audio' ? 'active' : ''} onClick={() => setTab('audio')}><Music size={15}/>Audio</button><button className={tab === 'captions' ? 'active' : ''} onClick={() => setTab('captions')}><Captions size={15}/>Captions</button></div>
      {tab === 'captions' ? <CaptionsPanel captions={captions} style={captionStyle} total={total} burn={burnCaptions} getTime={getTime} onChange={updateCaptions} onStyle={updateCaptionStyle} onSeek={seekPaused} onBurn={updateCaptionBurn} onError={reportError} onDownload={downloadCaptions}/> : <><button className="full-button coral" onClick={importFiles}><Upload size={18}/>Upload {tab}</button><button className="full-button" onClick={addPages}><Plus size={18}/>Add design pages</button><div className="media-assets">{assets.filter(item => item.kind === tab).map(item => <button className="media-asset" key={item.id} onClick={() => addAsset(item)}>{item.thumbnail ? <img src={item.thumbnail} alt=""/> : <Music size={28}/>}<strong>{item.name}</strong><span>{item.duration.toFixed(1)}s · click to add</span></button>)}</div><p className="small-hint">Imported media stays in your local library.</p></>}
    </aside>
    <div className="media-editing"><div className="media-preview" ref={previewRef}>{scene ? <div className="media-frame" ref={frameRef}>
      {scene.backgroundImage && <img className="media-visual" src={scene.backgroundImage} alt=""/>}
      {scene.kind === 'video' && asset ? <video key={scene.id} className={`media-visual ${scene.overlay ? 'media-overlay-video' : ''}`} ref={videoRef} src={asset.src} playsInline preload="auto" aria-label="Timeline video preview" style={{ objectFit: scene.fit || 'contain', opacity: fade, ...(scene.overlay ? { left: `${scene.overlay.x / width * 100}%`, top: `${scene.overlay.y / height * 100}%`, width: `${scene.overlay.width / width * 100}%`, height: `${scene.overlay.height / height * 100}%` } : {}) }} onLoadedMetadata={syncLoadedVideo} onPlay={() => { if (!playingRef.current) setPlaying(true); }} onTimeUpdate={() => { const node = videoRef.current; if (!playing && node) { const time = Math.max(prefix, Math.min(prefix + scene.duration, prefix + node.currentTime - (scene.trimStart || 0))); playheadRef.current = time; setPlayhead(time); } }}/>
        : scene.image ? <img className="media-visual" src={scene.image} alt={scene.name} style={{ objectFit: scene.fit || 'contain', opacity: fade }}/> : <p className="small-hint">This clip is missing from the local library.</p>}
      {activeCaptions.length > 0 && <div className="media-caption-overlay" aria-label="Caption preview" style={{ color: captionStyle.color, fontFamily: captionStyle.fontFamily, fontSize: `calc(${captionStyle.fontSize}px * var(--caption-scale))`, textAlign: captionStyle.align, ...(captionStyle.position === 'bottom' ? { bottom: `${captionStyle.margin}%` } : captionStyle.position === 'top' ? { top: `${captionStyle.margin}%` } : { top: '50%', transform: 'translateY(-50%)' }) }}>{activeCaptions.map(cue => <div className="media-caption-line" key={cue.id} style={{ alignSelf: captionStyle.align === 'left' ? 'flex-start' : captionStyle.align === 'right' ? 'flex-end' : 'center', background: captionStyle.box ? captionBackground : undefined, textShadow: captionStyle.box ? undefined : '0 1px 2px #000' }}>{cue.text}</div>)}</div>}
    </div> : <div className="media-empty"><Video size={42}/><h2>Make your next video</h2><p>Add clips, design pages, music and captions.</p><button className="primary-button" onClick={addPages}>Use design pages</button></div>}{audio.map((track, i) => { const source = assets.find(item => item.id === track.mediaId); return source ? <audio key={`${track.mediaId}-${i}`} ref={el => { if (el) audioRefs.current.set(i, el); else audioRefs.current.delete(i); }} src={source.src} preload="auto"/> : null; })}</div>
      <div className="media-scrubber"><time aria-label="Timeline current time">{captionTimestamp(playhead).slice(3)}</time><input aria-label="Timeline playhead" type="range" min={0} max={total || 0} step={.01} value={playhead} disabled={!scenes.length} onChange={e => seek(Number(e.target.value))}/><time>{captionTimestamp(total).slice(3)}</time></div>
      <div className="media-controls"><button aria-label="Previous clip" disabled={!scenes.length} onClick={() => selectScene(Math.max(0, selected - 1))}><ChevronLeft size={20}/></button><button aria-label={playing ? 'Pause timeline' : 'Play timeline'} disabled={!scenes.length} onClick={togglePlay}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button><button aria-label="Next clip" disabled={!scenes.length} onClick={() => selectScene(Math.min(scenes.length - 1, selected + 1))}><ChevronRight size={20}/></button><span>{scenes.length ? selected + 1 : 0}/{scenes.length} · {total.toFixed(1)}s</span><select aria-label="Video export format" value={format} onChange={e => setFormat(e.target.value as typeof format)}><option value="mp4">MP4 video</option><option value="webm">WebM video</option><option value="gif">Animated GIF</option></select><button className="primary-button" disabled={exporting || !scenes.length} onClick={exportVideo}><Download size={17}/>{exporting ? 'Rendering…' : 'Export video'}</button></div>
      {scene && <div className="clip-inspector"><label>Trim start<input aria-label="Clip trim start" type="number" step={.1} min={0} max={Math.max(0, (asset?.duration || 120) - scene.duration)} value={scene.trimStart || 0} onChange={e => patch({ trimStart: Math.max(0, Math.min(Math.max(0, (asset?.duration || 120) - scene.duration), Number(e.target.value))) })}/></label><label>Duration<input aria-label="Clip duration" type="number" min={.1} step={.1} max={asset ? asset.duration - (scene.trimStart || 0) : 120} value={scene.duration} onChange={e => patch({ duration: Math.max(.1, Math.min(asset ? asset.duration - (scene.trimStart || 0) : 120, Number(e.target.value))) })}/></label><label><Volume2 size={15}/>Volume<input aria-label="Clip volume" type="range" min={0} max={1} step={.05} value={scene.volume ?? 1} onChange={e => patch({ volume: Number(e.target.value) })}/></label><label>Fit<select value={scene.fit || 'contain'} onChange={e => patch({ fit: e.target.value as 'cover' | 'contain' })}><option>cover</option><option>contain</option></select></label><label>Transition<select aria-label="Clip transition" value={scene.transition || 'none'} onChange={e => patch({ transition: e.target.value as 'none' | 'fade' })}><option>none</option><option>fade</option></select></label><button title="Duplicate clip" disabled={scenes.length >= 100} onClick={() => updateScenes([...scenes.slice(0, selected + 1), { ...scene, id: crypto.randomUUID() }, ...scenes.slice(selected + 1)])}><Copy size={17}/></button><button title="Remove clip" onClick={() => updateScenes(scenes.filter((_, i) => i !== selected))}><Trash2 size={17}/></button></div>}
      <div className="timeline"><div className="timeline-track">{scenes.map((clip, i) => <button draggable className={`timeline-clip ${selected === i ? 'active' : ''}`} key={clip.id} style={{ width: Math.max(110, Math.min(300, clip.duration * 10)) }} onClick={() => selectScene(i)} onDragStart={e => e.dataTransfer.setData('text/visro-clip', String(i))} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/visro-clip')); if (!Number.isInteger(from) || from < 0 || from >= scenes.length) return; const next = [...scenes], item = next.splice(from, 1)[0]; next.splice(i, 0, item); updateScenes(next); seek(next.slice(0, i).reduce((sum, entry) => sum + entry.duration, 0)); }}>{clip.thumbnail && <img src={clip.thumbnail} alt=""/>}<strong>{clip.name}</strong><span>{clip.duration.toFixed(1)}s</span></button>)}<button className="timeline-add" onClick={addPages}><Plus size={22}/></button></div>{audio.map((track, i) => <div className="timeline-audio" key={`${track.mediaId}-${i}`}><Music size={16}/><span>{assets.find(item => item.id === track.mediaId)?.name || 'Audio track'}</span><label>Start<input type="number" aria-label={`Audio start ${i + 1}`} min={0} max={total} step={.5} value={track.start || 0} onChange={e => updateAudio(audio.map((item, j) => j === i ? { ...item, start: Math.max(0, Math.min(total, Number(e.target.value))) } : item))}/></label><label>Trim<input type="number" aria-label={`Audio trim ${i + 1}`} min={0} step={.1} value={track.trimStart || 0} onChange={e => updateAudio(audio.map((item, j) => j === i ? { ...item, trimStart: Math.max(0, Number(e.target.value)) } : item))}/></label><label>Duration<input type="number" aria-label={`Audio duration ${i + 1}`} min={.1} step={.1} value={track.duration || assets.find(item => item.id === track.mediaId)?.duration || 5} onChange={e => updateAudio(audio.map((item, j) => j === i ? { ...item, duration: Math.max(.1, Number(e.target.value)) } : item))}/></label><input aria-label={`Audio volume ${i + 1}`} type="range" min={0} max={1} step={.05} value={track.volume ?? .5} onChange={e => updateAudio(audio.map((item, j) => j === i ? { ...item, volume: Number(e.target.value) } : item))}/><button aria-label="Remove audio track" onClick={() => updateAudio(audio.filter((_, j) => j !== i))}><Trash2 size={16}/></button></div>)}</div>
      {exporting && <div className="media-progress"><div className="progress-track"><span style={{ width: `${progress?.percent || 0}%` }}/></div><span>{progress?.message || 'Preparing video…'} {Math.round(progress?.percent || 0)}%</span><button onClick={() => void desktop?.cancelMediaExport()}>Cancel</button></div>}{error && <p role="alert" className="error-message">{error}</p>}
    </div>
  </div>;
}
