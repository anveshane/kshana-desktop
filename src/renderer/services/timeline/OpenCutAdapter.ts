import type {
  KshanaTimelineState,
  KshanaTimelineMarker,
  ImportedClip,
  TimelineTrack,
  TimelineTrackElement,
  TimelineTrackType,
} from '../../types/kshana';
import type {
  TimelineTextElement,
  TimelineElementTrim,
  TimelineTransform,
} from '../../types/kshana/timeline';
import { normalizeTimelineState } from '../../types/kshana';

export interface OpenCutLikeElement {
  id: string;
  type: string;
  name: string;
  duration: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  transform: TimelineTransform;
  opacity: number;
  blendMode: string;
  hidden?: boolean;
  muted?: boolean;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCutLikeTrack {
  id: string;
  name: string;
  type: TimelineTrackType;
  isMain?: boolean;
  muted?: boolean;
  hidden?: boolean;
  elements: OpenCutLikeElement[];
}

export interface OpenCutLikeMarker {
  id: string;
  position: number;
  prompt: string;
  status: KshanaTimelineMarker['status'];
  generatedArtifactId?: string;
  createdAt: string;
}

export interface OpenCutLikeTimelineState {
  tracks: OpenCutLikeTrack[];
  markers: OpenCutLikeMarker[];
  activeVersions: KshanaTimelineState['active_versions'];
  importedClips: ImportedClip[];
  imageTimingOverrides: KshanaTimelineState['image_timing_overrides'];
  infographicTimingOverrides: KshanaTimelineState['infographic_timing_overrides'];
  videoSplitOverrides: KshanaTimelineState['video_split_overrides'];
  viewState: KshanaTimelineState['view_state'];
  bookmarks: KshanaTimelineState['bookmarks'];
}

function toOpenCutElement(element: TimelineTrackElement): OpenCutLikeElement {
  return {
    ...element,
    duration: element.duration_seconds,
    startTime: element.start_time_seconds,
    trimStart: element.trim.in_seconds,
    trimEnd: element.trim.out_seconds,
    blendMode: element.blend_mode,
    metadata: element.metadata,
  };
}

function toKshanaTrim(element: OpenCutLikeElement): TimelineElementTrim {
  return {
    in_seconds: Number.isFinite(element.trimStart)
      ? Number(element.trimStart)
      : 0,
    out_seconds: Number.isFinite(element.trimEnd) ? Number(element.trimEnd) : 0,
  };
}

function toKshanaElement(element: OpenCutLikeElement): TimelineTrackElement {
  const base = {
    id: element.id,
    type: element.type as TimelineTrackElement['type'],
    name: element.name,
    duration_seconds: Number(element.duration ?? 0),
    start_time_seconds: Number(element.startTime ?? 0),
    trim: toKshanaTrim(element),
    transform: element.transform ?? {
      scale: 1,
      position: { x: 0, y: 0 },
      rotate: 0,
    },
    opacity: Number.isFinite(element.opacity) ? Number(element.opacity) : 1,
    blend_mode:
      (typeof element.blendMode === 'string'
        ? element.blendMode
        : 'normal') as TimelineTrackElement['blend_mode'],
    hidden: Boolean(element.hidden),
    muted: Boolean(element.muted),
    metadata: element.metadata,
  };

  if (element.type === 'text') {
    return {
      ...base,
      type: 'text',
      content: String(element.content ?? 'Text'),
      font_size: Number(element.font_size ?? element.fontSize ?? 42),
      font_family: String(element.font_family ?? element.fontFamily ?? 'Arial'),
      color: String(element.color ?? '#FFFFFF'),
      background_color: String(
        element.background_color ?? element.backgroundColor ?? 'transparent',
      ),
      text_align: (element.text_align ?? element.textAlign ?? 'center') as
        | 'left'
        | 'center'
        | 'right',
      font_weight: String(
        element.font_weight ?? element.fontWeight ?? 'normal',
      ) as TimelineTextElement['font_weight'],
      font_style: (element.font_style ?? element.fontStyle ?? 'normal') as
        | 'normal'
        | 'italic',
      text_decoration: (
        element.text_decoration ??
        element.textDecoration ??
        'none'
      ) as 'none' | 'underline' | 'line-through',
      letter_spacing: Number(
        element.letter_spacing ?? element.letterSpacing ?? 0,
      ),
      line_height: Number(element.line_height ?? element.lineHeight ?? 1.2),
    };
  }

  if (element.type === 'audio') {
    return {
      ...base,
      type: 'audio',
      source_path: String(element.source_path ?? element.sourcePath ?? ''),
      asset_id:
        typeof element.asset_id === 'string' ? element.asset_id : undefined,
      volume: Number(element.volume ?? 1),
    };
  }

  if (element.type === 'sticker') {
    return {
      ...base,
      type: 'sticker',
      sticker_id: String(element.sticker_id ?? element.stickerId ?? ''),
    };
  }

  if (element.type === 'shape') {
    return {
      ...base,
      type: 'shape',
      shape_type: (element.shape_type ?? element.shapeType ?? 'rectangle') as
        | 'rectangle'
        | 'circle'
        | 'triangle'
        | 'star'
        | 'arrow'
        | 'polygon',
      fill_color:
        typeof element.fill_color === 'string'
          ? element.fill_color
          : undefined,
      stroke_color:
        typeof element.stroke_color === 'string'
          ? element.stroke_color
          : undefined,
      stroke_width:
        typeof element.stroke_width === 'number'
          ? element.stroke_width
          : undefined,
    };
  }

  if (element.type === 'svg') {
    return {
      ...base,
      type: 'svg',
      svg_content: String(element.svg_content ?? element.svgContent ?? ''),
    };
  }

  return {
    ...base,
    type: element.type === 'image' ? 'image' : 'video',
    source_path: String(element.source_path ?? element.sourcePath ?? ''),
    asset_id:
      typeof element.asset_id === 'string' ? element.asset_id : undefined,
  };
}

export function toOpenCutTimelineTracks(
  tracks: TimelineTrack[],
): OpenCutLikeTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    type: track.type,
    isMain: track.is_main,
    muted: track.muted,
    hidden: track.hidden,
    elements: track.elements.map(toOpenCutElement),
  }));
}

export function fromOpenCutTimelineTracks(
  tracks: OpenCutLikeTrack[],
): TimelineTrack[] {
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    type: track.type,
    is_main: Boolean(track.isMain),
    muted: Boolean(track.muted),
    hidden: Boolean(track.hidden),
    elements: track.elements.map(toKshanaElement),
  }));
}

export function ensureAdaptedTimelineState(
  state: KshanaTimelineState,
): KshanaTimelineState {
  return normalizeTimelineState(state);
}

function toOpenCutMarker(marker: KshanaTimelineMarker): OpenCutLikeMarker {
  return {
    id: marker.id,
    position: marker.position_seconds,
    prompt: marker.prompt,
    status: marker.status,
    generatedArtifactId: marker.generated_artifact_id,
    createdAt: marker.created_at,
  };
}

function fromOpenCutMarker(marker: OpenCutLikeMarker): KshanaTimelineMarker {
  return {
    id: marker.id,
    position_seconds: marker.position,
    prompt: marker.prompt,
    status: marker.status,
    generated_artifact_id: marker.generatedArtifactId,
    created_at: marker.createdAt,
  };
}

export function toOpenCutTimelineState(
  state: KshanaTimelineState,
): OpenCutLikeTimelineState {
  const normalized = normalizeTimelineState(state);
  return {
    tracks: toOpenCutTimelineTracks(normalized.tracks),
    markers: normalized.markers.map(toOpenCutMarker),
    activeVersions: normalized.active_versions,
    importedClips: normalized.imported_clips,
    imageTimingOverrides: normalized.image_timing_overrides,
    infographicTimingOverrides: normalized.infographic_timing_overrides,
    videoSplitOverrides: normalized.video_split_overrides,
    viewState: normalized.view_state,
    bookmarks: normalized.bookmarks,
  };
}

export function fromOpenCutTimelineState(
  state: OpenCutLikeTimelineState,
  fallback?: KshanaTimelineState,
): KshanaTimelineState {
  const normalizedFallback = fallback
    ? normalizeTimelineState(fallback)
    : normalizeTimelineState({} as Partial<KshanaTimelineState>);

  return normalizeTimelineState({
    ...normalizedFallback,
    tracks: fromOpenCutTimelineTracks(state.tracks),
    markers: state.markers.map(fromOpenCutMarker),
    active_versions: state.activeVersions,
    imported_clips: state.importedClips,
    image_timing_overrides: state.imageTimingOverrides,
    infographic_timing_overrides: state.infographicTimingOverrides,
    video_split_overrides: state.videoSplitOverrides,
    view_state: state.viewState,
    bookmarks: state.bookmarks,
  });
}

function createTextElementId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTextPresetElement(
  preset: 'title' | 'subtitle' | 'lower-third' | 'caption',
  startTimeSeconds: number,
): TimelineTextElement {
  const common: Omit<
    TimelineTextElement,
    | 'id'
    | 'content'
    | 'font_size'
    | 'font_weight'
    | 'text_align'
    | 'background_color'
    | 'line_height'
    | 'letter_spacing'
  > = {
    type: 'text',
    name: 'Text',
    duration_seconds: 5,
    start_time_seconds: startTimeSeconds,
    trim: { in_seconds: 0, out_seconds: 0 },
    transform: {
      scale: 1,
      position: { x: 0, y: 0 },
      rotate: 0,
    },
    opacity: 1,
    blend_mode: 'normal',
    font_family: 'Arial',
    color: '#FFFFFF',
    font_style: 'normal',
    text_decoration: 'none',
  };

  switch (preset) {
    case 'title':
      return {
        ...common,
        id: createTextElementId('title'),
        content: 'Title',
        font_size: 72,
        font_weight: '700',
        text_align: 'center',
        background_color: 'transparent',
        letter_spacing: 0,
        line_height: 1.2,
      };
    case 'subtitle':
      return {
        ...common,
        id: createTextElementId('subtitle'),
        content: 'Subtitle',
        font_size: 36,
        font_weight: '400',
        text_align: 'center',
        background_color: 'transparent',
        letter_spacing: 0,
        line_height: 1.2,
      };
    case 'lower-third':
      return {
        ...common,
        id: createTextElementId('lower-third'),
        content: 'Name Here',
        font_size: 32,
        font_weight: '600',
        text_align: 'left',
        background_color: 'rgba(0,0,0,0.7)',
        letter_spacing: 0,
        line_height: 1.2,
      };
    default:
      return {
        ...common,
        id: createTextElementId('caption'),
        content: 'Caption',
        font_size: 24,
        font_weight: '400',
        text_align: 'center',
        background_color: 'transparent',
        letter_spacing: 0,
        line_height: 1.2,
      };
  }
}
