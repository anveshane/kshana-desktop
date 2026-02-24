/**
 * Timeline State (.kshana/ui/timeline.json)
 * Location: <ProjectName>/.kshana/ui/timeline.json
 * Owner: UI
 * Purpose: Persistence of timeline interaction state
 */

/**
 * Status of a timeline marker
 */
export type MarkerStatus = 'pending' | 'processing' | 'complete' | 'error';

/**
 * Track type for imported clips
 */
export type ImportedClipTrackType = 'main' | 'overlay';
export type TrackType = ImportedClipTrackType;

/**
 * Rich timeline track types (schema v2)
 */
export type TimelineTrackType =
  | 'video'
  | 'audio'
  | 'text'
  | 'sticker'
  | 'graphics';

export type TimelineElementType =
  | 'video'
  | 'image'
  | 'audio'
  | 'text'
  | 'sticker'
  | 'shape'
  | 'svg';

export type TimelineBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'exclusion';

export interface TimelineTransform {
  scale: number;
  position: {
    x: number;
    y: number;
  };
  rotate: number;
}

export interface TimelineElementTrim {
  in_seconds: number;
  out_seconds: number;
}

export interface TimelineKeyframePoint {
  time_seconds: number;
  value: number | string | boolean;
  easing?: string;
}

export interface TimelineKeyframeProperty {
  property: string;
  points: TimelineKeyframePoint[];
}

export interface TimelineElementMetadata {
  keyframes?: TimelineKeyframeProperty[];
  transition?: string;
  sourceRef?: string;
  [key: string]: unknown;
}

interface BaseTimelineElement {
  id: string;
  type: TimelineElementType;
  name: string;
  duration_seconds: number;
  start_time_seconds: number;
  trim: TimelineElementTrim;
  transform: TimelineTransform;
  opacity: number;
  blend_mode: TimelineBlendMode;
  hidden?: boolean;
  muted?: boolean;
  metadata?: TimelineElementMetadata;
}

export interface TimelineVideoElement extends BaseTimelineElement {
  type: 'video' | 'image';
  asset_id?: string;
  source_path: string;
}

export interface TimelineAudioElement extends BaseTimelineElement {
  type: 'audio';
  asset_id?: string;
  source_path: string;
  volume: number;
}

export interface TimelineTextElement extends BaseTimelineElement {
  type: 'text';
  content: string;
  font_size: number;
  font_family: string;
  color: string;
  background_color: string;
  text_align: 'left' | 'center' | 'right';
  font_weight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  font_style: 'normal' | 'italic';
  text_decoration: 'none' | 'underline' | 'line-through';
  letter_spacing: number;
  line_height: number;
}

export interface TimelineStickerElement extends BaseTimelineElement {
  type: 'sticker';
  sticker_id: string;
}

export interface TimelineShapeElement extends BaseTimelineElement {
  type: 'shape';
  shape_type:
    | 'rectangle'
    | 'circle'
    | 'triangle'
    | 'star'
    | 'arrow'
    | 'polygon';
  fill_color?: string;
  stroke_color?: string;
  stroke_width?: number;
}

export interface TimelineSvgElement extends BaseTimelineElement {
  type: 'svg';
  svg_content: string;
}

export type TimelineTrackElement =
  | TimelineVideoElement
  | TimelineAudioElement
  | TimelineTextElement
  | TimelineStickerElement
  | TimelineShapeElement
  | TimelineSvgElement;

export interface TimelineTrack {
  id: string;
  name: string;
  type: TimelineTrackType;
  is_main?: boolean;
  muted?: boolean;
  hidden?: boolean;
  elements: TimelineTrackElement[];
}

export interface TimelineBookmark {
  id: string;
  time_seconds: number;
  note?: string;
  color?: string;
  duration_seconds?: number;
}

export interface TimelineViewState {
  zoom_level: number;
  scroll_left: number;
  playhead_time: number;
}

/**
 * Timeline marker for prompt-based generation
 */
export interface TimelineMarker {
  /** Unique marker identifier */
  id: string;

  /** Position in seconds on the timeline */
  position_seconds: number;

  /** User prompt associated with this marker */
  prompt: string;

  /** Current processing status */
  status: MarkerStatus;

  /** Artifact ID of generated content (if complete) */
  generated_artifact_id?: string;

  /** ISO8601 timestamp of creation */
  created_at: string;
}

/**
 * Trim settings for imported clips
 */
export interface ClipTrim {
  /** In point in seconds */
  in_seconds: number;

  /** Out point in seconds */
  out_seconds: number;
}

/**
 * Imported video clip on the timeline
 */
export interface ImportedClip {
  /** Unique clip identifier */
  id: string;

  /** Path to the imported video file */
  path: string;

  /** Original duration in seconds */
  duration_seconds: number;

  /** Start time on the timeline in seconds */
  start_time_seconds: number;

  /** Optional trim settings */
  trim?: ClipTrim;

  /** Track assignment */
  track?: ImportedClipTrackType;
}

/**
 * Active versions for a scene (image and/or video)
 */
export interface SceneVersions {
  /** Active image version number */
  image?: number;
  /** Active video version number */
  video?: number;
}

/**
 * Per-video split settings (placement-based)
 */
export interface VideoSplitOverride {
  /** Split offsets in seconds from the source clip start */
  split_offsets_seconds: number[];
}

/**
 * Timeline state persistence
 */
export interface TimelineState {
  /** Schema version for migration support */
  schema_version: '1' | '2';

  /** Current playhead position in seconds */
  playhead_seconds: number;

  /** Current zoom level (1.0 = 100%) */
  zoom_level: number;

  /** Active versions for each scene (scene folder -> { image?: number, video?: number }) */
  active_versions: Record<string, SceneVersions | number>;

  /** Timeline markers for prompt-based generation */
  markers: TimelineMarker[];

  /** Imported video clips */
  imported_clips: ImportedClip[];

  /** Per-image timing overrides keyed by placement number string */
  image_timing_overrides: Record<
    string,
    {
      start_time_seconds: number;
      end_time_seconds: number;
    }
  >;

  /** Per-infographic timing overrides keyed by placement number string */
  infographic_timing_overrides: Record<
    string,
    {
      start_time_seconds: number;
      end_time_seconds: number;
    }
  >;

  /** Per-video split overrides keyed by placement number string */
  video_split_overrides: Record<string, VideoSplitOverride>;

  /** OpenCut-style timeline tracks (schema v2) */
  tracks: TimelineTrack[];

  /** Timeline bookmarks (schema v2) */
  bookmarks: TimelineBookmark[];

  /** Persisted timeline viewport state (schema v2) */
  view_state: TimelineViewState;

  /** Asset projection/cache version marker (schema v2) */
  assets_version: number;
}

export const DEFAULT_TIMELINE_VIEW_STATE: TimelineViewState = {
  zoom_level: 1.0,
  scroll_left: 0,
  playhead_time: 0,
};

/**
 * Default timeline state
 */
export const DEFAULT_TIMELINE_STATE: TimelineState = {
  schema_version: '2',
  playhead_seconds: 0,
  zoom_level: 1.0,
  active_versions: {},
  markers: [],
  imported_clips: [],
  image_timing_overrides: {},
  infographic_timing_overrides: {},
  video_split_overrides: {},
  tracks: [],
  bookmarks: [],
  view_state: { ...DEFAULT_TIMELINE_VIEW_STATE },
  assets_version: 1,
};

const DEFAULT_TRANSFORM: TimelineTransform = {
  scale: 1,
  position: { x: 0, y: 0 },
  rotate: 0,
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createVideoElementFromImportedClip(
  clip: ImportedClip,
): TimelineVideoElement {
  return {
    id: clip.id || createId('el'),
    type: 'video',
    name: clip.path.split('/').pop() || 'Imported video',
    duration_seconds: clip.duration_seconds,
    start_time_seconds: clip.start_time_seconds,
    trim: clip.trim
      ? {
          in_seconds: clip.trim.in_seconds,
          out_seconds: clip.trim.out_seconds,
        }
      : { in_seconds: 0, out_seconds: 0 },
    transform: { ...DEFAULT_TRANSFORM },
    opacity: 1,
    blend_mode: 'normal',
    source_path: clip.path,
    metadata: {
      sourceRef: clip.id,
    },
  };
}

/**
 * Build a minimal v2 track list from legacy imported clips.
 */
export function synthesizeTracksFromImportedClips(
  importedClips: ImportedClip[],
): TimelineTrack[] {
  if (importedClips.length === 0) return [];

  const mainTrack: TimelineTrack = {
    id: createId('track'),
    name: 'Main Track',
    type: 'video',
    is_main: true,
    muted: false,
    hidden: false,
    elements: importedClips.map(createVideoElementFromImportedClip),
  };

  return [mainTrack];
}

/**
 * Sync legacy imported clips from rich timeline tracks.
 * Keeps backward compatibility for existing placement/import code paths.
 */
export function deriveImportedClipsFromTracks(
  tracks: TimelineTrack[],
  fallback: ImportedClip[] = [],
): ImportedClip[] {
  const imported: ImportedClip[] = [];

  tracks.forEach((track) => {
    track.elements.forEach((element) => {
      if (
        (element.type === 'video' || element.type === 'image') &&
        element.source_path
      ) {
        imported.push({
          id: element.id,
          path: element.source_path,
          duration_seconds: element.duration_seconds,
          start_time_seconds: element.start_time_seconds,
          trim: {
            in_seconds: element.trim.in_seconds,
            out_seconds: element.trim.out_seconds,
          },
          track: track.is_main ? 'main' : 'overlay',
        });
      }
    });
  });

  return imported.length > 0 ? imported : fallback;
}

/**
 * Normalize/migrate timeline state to schema v2 while preserving legacy fields.
 */
export function normalizeTimelineState(state: Partial<TimelineState>): TimelineState {
  const tracks =
    state.tracks && state.tracks.length > 0
      ? state.tracks
      : synthesizeTracksFromImportedClips(state.imported_clips ?? []);

  const normalized: TimelineState = {
    ...DEFAULT_TIMELINE_STATE,
    ...state,
    schema_version: '2',
    active_versions: state.active_versions ?? {},
    markers: state.markers ?? [],
    imported_clips: deriveImportedClipsFromTracks(
      tracks,
      state.imported_clips ?? [],
    ),
    image_timing_overrides: state.image_timing_overrides ?? {},
    infographic_timing_overrides: state.infographic_timing_overrides ?? {},
    video_split_overrides: state.video_split_overrides ?? {},
    tracks,
    bookmarks: state.bookmarks ?? [],
    view_state: {
      zoom_level:
        state.view_state?.zoom_level ??
        state.zoom_level ??
        DEFAULT_TIMELINE_VIEW_STATE.zoom_level,
      scroll_left:
        state.view_state?.scroll_left ??
        DEFAULT_TIMELINE_VIEW_STATE.scroll_left,
      playhead_time:
        state.view_state?.playhead_time ??
        state.playhead_seconds ??
        DEFAULT_TIMELINE_VIEW_STATE.playhead_time,
    },
    assets_version: Math.max(1, state.assets_version ?? 1),
  };

  // Keep legacy fields in sync with view_state for old consumers.
  normalized.zoom_level = normalized.view_state.zoom_level;
  normalized.playhead_seconds = normalized.view_state.playhead_time;

  return normalized;
}

/**
 * Creates a new timeline marker
 */
export function createTimelineMarker(
  id: string,
  positionSeconds: number,
  prompt: string,
): TimelineMarker {
  return {
    id,
    position_seconds: positionSeconds,
    prompt,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

/**
 * Creates an imported clip
 */
export function createImportedClip(
  id: string,
  path: string,
  durationSeconds: number,
  startTimeSeconds: number = 0,
): ImportedClip {
  return {
    id,
    path,
    duration_seconds: durationSeconds,
    start_time_seconds: startTimeSeconds,
    track: 'main',
  };
}

/**
 * Updates the active version for a scene
 * Supports both old format (number) and new format (SceneVersions)
 */
export function setActiveVersion(
  state: TimelineState,
  sceneFolder: string,
  assetType: 'image' | 'video',
  version: number,
): TimelineState {
  const current = state.active_versions[sceneFolder];
  let updated: SceneVersions;

  // Handle migration from old format (number) to new format (SceneVersions)
  if (typeof current === 'number') {
    // Old format: migrate to new format
    updated =
      assetType === 'video'
        ? { video: version, image: current } // Preserve old video version as image if needed
        : { image: version, video: current }; // Preserve old video version
  } else if (current && typeof current === 'object') {
    // New format: update specific asset type
    updated = { ...current, [assetType]: version };
  } else {
    // No existing version: create new
    updated = { [assetType]: version };
  }

  return {
    ...state,
    active_versions: {
      ...state.active_versions,
      [sceneFolder]: updated,
    },
  };
}

/**
 * Gets the active version for a scene (defaults to 1)
 * Supports both old format (number) and new format (SceneVersions)
 */
export function getActiveVersion(
  state: TimelineState,
  sceneFolder: string,
  assetType: 'image' | 'video' = 'video',
): number {
  const versions = state.active_versions[sceneFolder];

  // Handle old format (number) - treat as video version
  if (typeof versions === 'number') {
    return assetType === 'video' ? versions : 1;
  }

  // Handle new format (SceneVersions)
  if (versions && typeof versions === 'object') {
    return versions[assetType] ?? 1;
  }

  return 1;
}
