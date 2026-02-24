import type {
  KshanaTimelineState,
  TimelineTrack,
  TimelineTrackElement,
} from '../../types/kshana';
import { normalizeTimelineState } from '../../types/kshana';
import { createTextPresetElement } from './OpenCutAdapter';

export type TextPresetType = 'title' | 'subtitle' | 'lower-third' | 'caption';
export type ShapeInsertType =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'polygon';

function createElementId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureTrack(
  tracks: TimelineTrack[],
  options: {
    type: TimelineTrack['type'];
    name: string;
    isMain?: boolean;
  },
): TimelineTrack {
  const existing = tracks.find((track) => {
    if (track.type !== options.type) return false;
    if (options.isMain === undefined) return true;
    return Boolean(track.is_main) === Boolean(options.isMain);
  });
  if (existing) return existing;

  const created: TimelineTrack = {
    id: createElementId('track'),
    name: options.name,
    type: options.type,
    is_main: Boolean(options.isMain),
    muted: false,
    hidden: false,
    elements: [],
  };
  tracks.push(created);
  return created;
}

function appendElement(
  state: KshanaTimelineState,
  track: TimelineTrack,
  element: TimelineTrackElement,
): KshanaTimelineState {
  const nextTracks = state.tracks.map((candidate) => {
    if (candidate.id !== track.id) return candidate;
    return {
      ...candidate,
      elements: [...candidate.elements, element],
    };
  });
  return normalizeTimelineState({
    ...state,
    tracks: nextTracks,
  });
}

export function insertTextPreset(
  state: KshanaTimelineState,
  preset: TextPresetType,
  atSeconds: number,
): KshanaTimelineState {
  const normalized = normalizeTimelineState(state);
  const tracks = [...normalized.tracks];
  const textTrack = ensureTrack(tracks, {
    type: 'text',
    name: 'Text Track',
  });
  const seeded = normalizeTimelineState({
    ...normalized,
    tracks,
  });
  const textElement = createTextPresetElement(preset, atSeconds);
  return appendElement(seeded, textTrack, textElement);
}

export function insertSticker(
  state: KshanaTimelineState,
  stickerId: string,
  atSeconds: number,
): KshanaTimelineState {
  const normalized = normalizeTimelineState(state);
  const tracks = [...normalized.tracks];
  const stickerTrack = ensureTrack(tracks, {
    type: 'sticker',
    name: 'Sticker Track',
  });
  const seeded = normalizeTimelineState({
    ...normalized,
    tracks,
  });

  const element: TimelineTrackElement = {
    id: createElementId('sticker'),
    type: 'sticker',
    name: 'Sticker',
    duration_seconds: 5,
    start_time_seconds: atSeconds,
    trim: { in_seconds: 0, out_seconds: 0 },
    transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
    opacity: 1,
    blend_mode: 'normal',
    sticker_id: stickerId,
    metadata: {
      sourceRef: 'left-panel-sticker',
    },
  };

  return appendElement(seeded, stickerTrack, element);
}

export function insertShape(
  state: KshanaTimelineState,
  shapeType: ShapeInsertType,
  atSeconds: number,
): KshanaTimelineState {
  const normalized = normalizeTimelineState(state);
  const tracks = [...normalized.tracks];
  const graphicsTrack = ensureTrack(tracks, {
    type: 'graphics',
    name: 'Graphics Track',
  });
  const seeded = normalizeTimelineState({
    ...normalized,
    tracks,
  });

  const element: TimelineTrackElement = {
    id: createElementId('shape'),
    type: 'shape',
    name: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
    duration_seconds: 5,
    start_time_seconds: atSeconds,
    trim: { in_seconds: 0, out_seconds: 0 },
    transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
    opacity: 1,
    blend_mode: 'normal',
    shape_type: shapeType,
    fill_color: '#58C7FF',
    stroke_color: '#FFFFFF',
    stroke_width: 0,
    metadata: {
      sourceRef: 'left-panel-shape',
    },
  };

  return appendElement(seeded, graphicsTrack, element);
}

function buildFallbackSvg(label: string): string {
  const safeLabel = label.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#101318"/><text x="600" y="340" fill="#e6f2ff" font-size="48" text-anchor="middle" font-family="Arial">${safeLabel}</text></svg>`;
}

export function insertSvg(
  state: KshanaTimelineState,
  svgContentOrPath: string,
  atSeconds: number,
): KshanaTimelineState {
  const normalized = normalizeTimelineState(state);
  const tracks = [...normalized.tracks];
  const graphicsTrack = ensureTrack(tracks, {
    type: 'graphics',
    name: 'Graphics Track',
  });
  const seeded = normalizeTimelineState({
    ...normalized,
    tracks,
  });

  const trimmedInput = svgContentOrPath.trim();
  const looksLikeSvg =
    /<svg[\s>]/i.test(trimmedInput) ||
    /<\?xml/i.test(trimmedInput);

  const element: TimelineTrackElement = {
    id: createElementId('svg'),
    type: 'svg',
    name: looksLikeSvg ? 'SVG' : 'SVG Asset',
    duration_seconds: 5,
    start_time_seconds: atSeconds,
    trim: { in_seconds: 0, out_seconds: 0 },
    transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
    opacity: 1,
    blend_mode: 'normal',
    svg_content: looksLikeSvg ? trimmedInput : buildFallbackSvg(trimmedInput),
    metadata: {
      sourceRef: looksLikeSvg ? 'inline-svg' : trimmedInput,
    },
  };

  return appendElement(seeded, graphicsTrack, element);
}
