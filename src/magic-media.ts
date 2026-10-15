import type { AIResult, MediaAsset, TimelineAudio, TimelineClip, CaptionCue, CaptionStyle } from './bridge';
import type { VisroProject } from './editor-types';

export type MediaScene = TimelineClip & { id: string; name: string; thumbnail?: string; pageId?: string };
export interface MediaSequence { scenes: MediaScene[]; audio: TimelineAudio[]; captions?: CaptionCue[]; captionStyle?: CaptionStyle; burnCaptions?: boolean }

/** Send the editable primitives on the active page, with their actual dimensions. */
export function editableDesign(project: VisroProject): NonNullable<AIResult['design']> {
  const page = project.pages.find((p) => p.id === project.activePageId) || project.pages[0];
  const objects = (page.canvas.objects || []) as Record<string, unknown>[];
  const elements = objects.flatMap((object) => {
    const type = String(object.type).toLowerCase();
    const kind = type.includes('text') ? 'text' : type;
    if (!['text', 'rect', 'circle'].includes(kind)) return [];
    return [{ type: kind, text: object.text, x: Number(object.left) || 0, y: Number(object.top) || 0,
      width: (Number(object.width) || 100) * (Number(object.scaleX) || 1), height: (Number(object.height) || 100) * (Number(object.scaleY) || 1),
      fill: typeof object.fill === 'string' ? object.fill : '#8b3dff', fontSize: Number(object.fontSize) || 32,
      fontFamily: object.fontFamily, fontWeight: object.fontWeight, align: object.textAlign || 'left', opacity: object.opacity ?? 1, angle: Number(object.angle) || 0 }];
  });
  if (!elements.length) throw new Error('Add editable text or shapes to this page before adapting it.');
  return { name: project.name, width: project.width, height: project.height, background: page.background, elements };
}

export function documentParagraphs(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return text.trim().split(/\n\s*\n/).map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
}

export function existingSequence(kind: string | undefined, content: unknown): MediaSequence {
  if (kind !== 'video' || !content || typeof content !== 'object') return { scenes: [], audio: [] };
  const candidate = content as Partial<MediaSequence>;
  return { scenes: Array.isArray(candidate.scenes) ? [...candidate.scenes] : [], audio: Array.isArray(candidate.audio) ? [...candidate.audio] : [],
    ...(Array.isArray(candidate.captions) ? { captions: candidate.captions.map(cue => ({ ...cue })) } : {}),
    ...(candidate.captionStyle && typeof candidate.captionStyle === 'object' ? { captionStyle: { ...candidate.captionStyle } } : {}),
    ...(typeof candidate.burnCaptions === 'boolean' ? { burnCaptions: candidate.burnCaptions } : {}),
  };
}

/** Preserve existing edits; supply an actual design scene when speech needs a visual. */
export function withGeneratedMedia(sequence: MediaSequence, asset: MediaAsset, image?: string, id = () => crypto.randomUUID()): MediaSequence {
  const scenes = [...sequence.scenes], audio = [...sequence.audio];
  if (!Number.isFinite(asset.duration) || asset.duration <= 0) throw new Error('The generated media has no playable duration.');
  if (asset.duration > 3600) throw new Error('Generated media can be up to 1 hour long.');
  if (scenes.length > 100) throw new Error('This timeline already has more than 100 scenes.');
  if (asset.kind === 'video') {
    if (scenes.length >= 100) throw new Error('Keep this timeline to 100 scenes; remove a scene before adding this video.');
    if (scenes.reduce((sum, scene) => sum + scene.duration, 0) + Math.min(120, asset.duration) > 3600) throw new Error('Keep this timeline to 1 hour.');
    scenes.push({ id: id(), name: asset.name, kind: 'video', mediaId: asset.id, duration: Math.min(120, asset.duration), trimStart: 0, volume: 1, fit: 'cover', transition: 'none', thumbnail: asset.thumbnail });
  } else {
    if (audio.length >= 16) throw new Error('Keep this timeline to 16 audio tracks; remove a track before adding this voiceover.');
    const length = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    let remaining = Math.max(0, asset.duration - length);
    if (remaining > 0 && !image) throw new Error('A design preview is needed to show your voiceover in the timeline.');
    if (Math.max(length, asset.duration) > 3600) throw new Error('Keep this timeline to 1 hour.');
    if (scenes.length + Math.ceil(remaining / 120) > 100) throw new Error('This voiceover needs more than 100 scenes. Use a shorter script.');
    while (remaining > 0) {
      const duration = Math.min(120, remaining);
      scenes.push({ id: id(), name: 'Voiceover design', kind: 'image', image, thumbnail: image, duration, transition: 'none' });
      remaining -= duration;
    }
    audio.push({ mediaId: asset.id, start: 0, trimStart: 0, duration: asset.duration, volume: 1 });
  }
  return { ...sequence, scenes, audio };
}
