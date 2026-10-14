import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ImageCropRect } from './editor-types';

export interface ImageCropSource { src: string; width: number; height: number; rect: ImageCropRect }
interface Props { source: ImageCropSource; onCancel: () => void; onDone: (rect: ImageCropRect) => Promise<void> }
type Corner = 'nw' | 'ne' | 'se' | 'sw';
interface Gesture { pointerId: number; capture: HTMLElement; mode: 'move' | Corner; x: number; y: number; rect: ImageCropRect; box: DOMRect }
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export default function ImageCropEditor({ source, onCancel, onDone }: Props) {
  const aspect = Math.max(0.0001, source.rect.width / Math.max(1, source.rect.height));
  const fitRect = (): ImageCropRect => {
    const width = Math.min(source.width, source.height * aspect), height = width / aspect;
    return { left: (source.width - width) / 2, top: (source.height - height) / 2, width, height };
  };
  const initial = (): ImageCropRect => {
    const width = clamp(source.rect.width, 1, Math.min(source.width, source.height * aspect)), height = width / aspect;
    return { left: clamp(source.rect.left, 0, source.width - width), top: clamp(source.rect.top, 0, source.height - height), width, height };
  };
  const [rect, setRect] = useState<ImageCropRect>(initial);
  const current = useRef(rect), gesture = useRef<Gesture | null>(null), frame = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null), imageBox = useRef<HTMLDivElement>(null), modal = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 640, height: 440 }), [busy, setBusy] = useState(false), [error, setError] = useState('');

  useEffect(() => {
    modal.current?.focus();
    const element = stage.current;
    if (!element) return;
    const fit = () => {
      const scale = Math.min((Math.min(688, element.clientWidth) - 48) / source.width, (Math.min(488, element.clientHeight || 488) - 48) / source.height);
      setSize({ width: Math.max(1, source.width * scale), height: Math.max(1, source.height * scale) });
    };
    fit(); const observer = new ResizeObserver(fit); observer.observe(element);
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [source.width, source.height]);

  const update = (next: ImageCropRect, immediate = false) => {
    current.current = next;
    if (immediate) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null; setRect(next); return;
    }
    frame.current ??= requestAnimationFrame(() => { frame.current = null; setRect(current.current); });
  };
  const begin = (event: React.PointerEvent<HTMLElement>, mode: Gesture['mode']) => {
    if (busy || event.button !== 0 || !imageBox.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, capture: event.currentTarget, mode, x: event.clientX, y: event.clientY, rect: current.current, box: imageBox.current.getBoundingClientRect() };
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - active.x) * source.width / active.box.width, dy = (event.clientY - active.y) * source.height / active.box.height;
    if (active.mode === 'move') {
      update({ ...active.rect, left: clamp(active.rect.left + dx, 0, source.width - active.rect.width), top: clamp(active.rect.top + dy, 0, source.height - active.rect.height) }); return;
    }
    const sx = active.mode.endsWith('e') ? 1 : -1, sy = active.mode.startsWith('s') ? 1 : -1;
    const anchorX = sx > 0 ? active.rect.left : active.rect.left + active.rect.width;
    const anchorY = sy > 0 ? active.rect.top : active.rect.top + active.rect.height;
    const delta = Math.abs(dx) > Math.abs(dy * aspect) ? dx * sx : dy * aspect * sy;
    const maximum = Math.min(sx > 0 ? source.width - anchorX : anchorX, (sy > 0 ? source.height - anchorY : anchorY) * aspect);
    const width = clamp(active.rect.width + delta, Math.min(2, maximum), maximum), height = width / aspect;
    update({ left: sx > 0 ? anchorX : anchorX - width, top: sy > 0 ? anchorY : anchorY - height, width, height });
  };
  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.capture.hasPointerCapture(event.pointerId)) active.capture.releasePointerCapture(event.pointerId);
    gesture.current = null; update(current.current, true);
  };
  const done = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onDone({ ...current.current }); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not apply this crop.'); setBusy(false); }
  };
  const left = rect.left / source.width * 100, top = rect.top / source.height * 100, width = rect.width / source.width * 100, height = rect.height / source.height * 100;
  return <div className="modal-backdrop crop-editor-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
    <section className="crop-editor" role="dialog" aria-modal="true" aria-labelledby="crop-editor-title" tabIndex={-1} ref={modal} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); onCancel(); }
      if (event.target instanceof HTMLElement && event.target.classList.contains('crop-selection') && event.key.startsWith('Arrow')) {
        event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? 10 : 1;
        update({ ...current.current, left: clamp(current.current.left + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), 0, source.width - current.current.width), top: clamp(current.current.top + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0), 0, source.height - current.current.height) }, true);
      }
    }}>
      <header className="crop-editor-header"><div><h2 id="crop-editor-title">Crop image</h2><p>Drag to position. Pull a corner to resize.</p></div><button className="icon-button" type="button" aria-label="Cancel crop" disabled={busy} onClick={onCancel}><X size={20}/></button></header>
      <div className="crop-editor-stage" ref={stage}>
        <div className="crop-editor-canvas" ref={imageBox} style={{ width: size.width, height: size.height }} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          <img src={source.src} alt="Photo to crop" draggable={false}/>
          <div className="crop-shade" style={{ left: 0, top: 0, width: '100%', height: `${top}%` }}/>
          <div className="crop-shade" style={{ left: 0, top: `${top + height}%`, width: '100%', bottom: 0 }}/>
          <div className="crop-shade" style={{ left: 0, top: `${top}%`, width: `${left}%`, height: `${height}%` }}/>
          <div className="crop-shade" style={{ left: `${left + width}%`, top: `${top}%`, right: 0, height: `${height}%` }}/>
          <div className="crop-selection" role="button" aria-label="Move crop selection" tabIndex={0} style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} onPointerDown={event => begin(event, 'move')}>
            <div className="crop-grid"><i/><i/><i/><i/></div>
            {(['nw', 'ne', 'se', 'sw'] as const).map(corner => <button key={corner} type="button" className={`crop-handle ${corner}`} aria-label={`Resize crop ${corner}`} onPointerDown={event => begin(event, corner)} disabled={busy}/>)}
          </div>
        </div>
      </div>
      {error && <p className="crop-editor-error" role="alert">{error}</p>}
      <footer className="crop-editor-footer"><button type="button" className="quiet-button" disabled={busy} onClick={() => update(fitRect(), true)}>Reset</button><span>Frame proportions stay the same</span><div><button type="button" className="quiet-button" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="full-button coral" disabled={busy} onClick={() => void done()}>{busy ? 'Applying…' : 'Done'}</button></div></footer>
    </section>
  </div>;
}
