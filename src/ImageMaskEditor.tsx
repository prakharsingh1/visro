import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, Eraser, LoaderCircle, Minus, Plus, RotateCcw, Undo2, X, ZoomIn } from 'lucide-react';

export interface ImageMaskEditorProps {
  original: string;
  current: string;
  onDone: (dataURL: string) => void | Promise<void>;
  onCancel: () => void;
}

/** A local alpha editor. Restore uses the retained source photo, never AI pixels. */
export default function ImageMaskEditor({ original, current, onDone, onCancel }: ImageMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const originalPixels = useRef<Uint8ClampedArray | null>(null);
  const initialPixels = useRef<ImageData | null>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const [mode, setMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState(60);
  const [opacity, setOpacity] = useState(1);
  const [zoom, setZoom] = useState(.7);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [edited, setEdited] = useState(false);

  const fit = () => {
    const stage = stageRef.current, canvas = canvasRef.current;
    if (stage && canvas?.width) setZoom(Math.max(.05, Math.min((stage.clientWidth - 70) / canvas.width, (stage.clientHeight - 70) / canvas.height, 1)));
  };

  useEffect(() => {
    let alive = true;
    const load = async (src: string) => {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = src;
      await image.decode(); return image;
    };
    (async () => {
      try {
        const [source, masked] = await Promise.all([load(original), load(current)]);
        if (!alive || !canvasRef.current) return;
        const scale = Math.min(1, 4096 / Math.max(masked.naturalWidth, masked.naturalHeight), Math.sqrt(16_000_000 / (masked.naturalWidth * masked.naturalHeight)));
        const width = Math.max(1, Math.round(masked.naturalWidth * scale)), height = Math.max(1, Math.round(masked.naturalHeight * scale));
        const canvas = canvasRef.current; canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.clearRect(0, 0, width, height); context.drawImage(masked, 0, 0, width, height);
        initialPixels.current = context.getImageData(0, 0, width, height);
        const originalCanvas = document.createElement('canvas'); originalCanvas.width = width; originalCanvas.height = height;
        const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true })!;
        originalContext.drawImage(source, 0, 0, width, height);
        originalPixels.current = originalContext.getImageData(0, 0, width, height).data;
        setSize({ width, height }); setLoading(false); setEdited(false);
        requestAnimationFrame(() => { if (alive) fit(); });
      } catch (reason) {
        if (alive) { setError(reason instanceof Error ? reason.message : 'Could not open this image.'); setLoading(false); }
      }
    })();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelRef.current(); };
    window.addEventListener('keydown', escape);
    return () => { alive = false; window.removeEventListener('keydown', escape); originalPixels.current = null; initialPixels.current = null; };
  }, [original, current]);

  const paint = (x: number, y: number) => {
    const canvas = canvasRef.current, source = originalPixels.current;
    if (!canvas || !source) return;
    const context = canvas.getContext('2d', { willReadFrequently: true })!, radius = brushSize / 2;
    const left = Math.max(0, Math.floor(x - radius)), top = Math.max(0, Math.floor(y - radius));
    const width = Math.min(canvas.width, Math.ceil(x + radius)) - left, height = Math.min(canvas.height, Math.ceil(y + radius)) - top;
    if (width <= 0 || height <= 0) return;
    const area = context.getImageData(left, top, width, height), pixels = area.data;
    for (let yy = 0; yy < height; yy += 1) {
      for (let xx = 0; xx < width; xx += 1) {
        const distance = Math.hypot(left + xx + .5 - x, top + yy + .5 - y) / radius;
        if (distance >= 1) continue;
        const strength = opacity * Math.min(1, (1 - distance) / .15), index = (yy * width + xx) * 4;
        const sourceIndex = ((top + yy) * canvas.width + left + xx) * 4, oldAlpha = pixels[index + 3];
        if (mode === 'erase') pixels[index + 3] = Math.round(oldAlpha * (1 - strength));
        else {
          const newAlpha = Math.max(oldAlpha, Math.round(oldAlpha + (source[sourceIndex + 3] - oldAlpha) * strength));
          const added = newAlpha - oldAlpha;
          if (added > 0) {
            for (let channel = 0; channel < 3; channel += 1) pixels[index + channel] = Math.round((pixels[index + channel] * oldAlpha + source[sourceIndex + channel] * added) / newAlpha);
            pixels[index + 3] = newAlpha;
          }
        }
      }
    }
    context.putImageData(area, left, top);
  };

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!, rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };

  const cursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stage = stageRef.current, element = cursorRef.current;
    if (!stage || !element) return;
    const rect = stage.getBoundingClientRect();
    element.style.left = `${event.clientX - rect.left + stage.scrollLeft}px`;
    element.style.top = `${event.clientY - rect.top + stage.scrollTop}px`;
    element.style.width = `${brushSize * zoom}px`; element.style.height = `${brushSize * zoom}px`; element.style.opacity = '1';
  };

  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    cursor(event);
    if (!drawing.current || loading || saving || error) return;
    const currentPoint = point(event), previous = lastPoint.current ?? currentPoint;
    const distance = Math.hypot(currentPoint.x - previous.x, currentPoint.y - previous.y), steps = Math.max(1, Math.ceil(distance / Math.max(1, brushSize * .18)));
    for (let step = 1; step <= steps; step += 1) paint(previous.x + (currentPoint.x - previous.x) * step / steps, previous.y + (currentPoint.y - previous.y) * step / steps);
    lastPoint.current = currentPoint; setEdited(true);
  };

  const reset = () => {
    if (canvasRef.current && initialPixels.current) canvasRef.current.getContext('2d')!.putImageData(initialPixels.current, 0, 0);
    setEdited(false);
  };

  const done = async () => {
    if (!canvasRef.current || loading || saving) return;
    setSaving(true); setError('');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await onDone(canvasRef.current.toDataURL('image/png'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not apply the mask.'); }
    finally { setSaving(false); }
  };

  return <div className="image-mask-backdrop" role="presentation">
    <section className="image-mask-modal" role="dialog" aria-modal="true" aria-label="Refine image mask">
      <header className="image-mask-header"><div><span className="eyebrow">THE FINISHING TOUCH</span><h2>Keep the good parts.</h2><p>Erase the background. Restore the edges. Every stroke stays on this Mac.</p></div><button className="icon-button" title="Close mask editor" onClick={onCancel} disabled={saving}><X size={20}/></button></header>
      <div className="image-mask-body">
        <aside className="image-mask-tools">
          <div className="image-mask-mode"><button className={mode === 'erase' ? 'active' : ''} onClick={() => setMode('erase')}><Eraser size={18}/><span>Erase</span></button><button className={mode === 'restore' ? 'active' : ''} onClick={() => setMode('restore')}><Undo2 size={18}/><span>Restore</span></button></div>
          <label className="image-mask-slider">Brush size <strong>{brushSize}px</strong><input aria-label="Mask brush size" type="range" min="2" max="240" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))}/></label>
          <label className="image-mask-slider">Opacity <strong>{Math.round(opacity * 100)}%</strong><input aria-label="Mask brush opacity" type="range" min=".05" max="1" step=".05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))}/></label>
          <div className="image-mask-tip"><strong>A little closer helps.</strong><p>Zoom in for hair, soft edges, and small details. Restore brings back pixels from your original photo.</p></div>
          <button className="full-button" onClick={reset} disabled={!edited || saving}><RotateCcw size={16}/>Reset strokes</button>
        </aside>
        <div className="image-mask-stage" ref={stageRef}>
          <div className="image-mask-canvas-wrap" style={{ width: size.width * zoom || 1, height: size.height * zoom || 1 }}>
            <canvas ref={canvasRef} aria-label="Image mask canvas" style={{ width: size.width * zoom || 1, height: size.height * zoom || 1, touchAction: 'none' }} onPointerDown={(event) => { if (loading || saving || error) return; event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; lastPoint.current = point(event); paint(lastPoint.current.x, lastPoint.current.y); setEdited(true); cursor(event); }} onPointerMove={draw} onPointerUp={(event) => { drawing.current = false; lastPoint.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drawing.current = false; lastPoint.current = null; }} onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.opacity = '0'; }}/>
          </div>
          <div className={`image-mask-cursor ${mode}`} ref={cursorRef}/>
          {loading && <div className="image-mask-loading"><LoaderCircle className="spin" size={26}/><span>Preparing your pixels…</span></div>}
        </div>
      </div>
      {error && <div className="image-mask-error" role="alert">{error}</div>}
      <footer className="image-mask-footer"><div className="image-mask-zoom"><ZoomIn size={16}/><button className="icon-button" title="Zoom out mask" onClick={() => setZoom((value) => Math.max(.05, value / 1.2))}><Minus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button className="icon-button" title="Zoom in mask" onClick={() => setZoom((value) => Math.min(4, value * 1.2))}><Plus size={16}/></button><button className="image-mask-fit" onClick={fit}>Fit</button><span className="image-mask-size">{size.width} × {size.height}</span></div><div className="image-mask-actions"><button className="full-button" onClick={onCancel} disabled={saving}>Cancel</button><button className="full-button coral" onClick={() => void done()} disabled={loading || saving || Boolean(error)}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}Apply mask</button></div></footer>
    </section>
  </div>;
}
