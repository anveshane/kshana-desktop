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
export type TrackType = 'main' | 'overlay';

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
  track?: TrackType;
}

/**
 * Timeline state persistence
 */
export interface TimelineState {
  /** Schema version for migration support */
  schema_version: '1';

  /** Current playhead position in seconds */
  playhead_seconds: number;

  /** Current zoom level (1.0 = 100%) */
  zoom_level: number;

  /** Active video version for each scene (scene folder -> version number) */
  active_versions: Record<string, number>;

  /** Timeline markers for prompt-based generation */
  markers: TimelineMarker[];

  /** Imported video clips */
  imported_clips: ImportedClip[];
}

/**
 * Default timeline state
 */
export const DEFAULT_TIMELINE_STATE: TimelineState = {
  schema_version: '1',
  playhead_seconds: 0,
  zoom_level: 1.0,
  active_versions: {},
  markers: [],
  imported_clips: [],
};

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
 */
export function setActiveVersion(
  state: TimelineState,
  sceneFolder: string,
  version: number,
): TimelineState {
  return {
    ...state,
    active_versions: {
      ...state.active_versions,
      [sceneFolder]: version,
    },
  };
}

/**
 * Gets the active version for a scene (defaults to 1)
 */
export function getActiveVersion(
  state: TimelineState,
  sceneFolder: string,
): number {
  return state.active_versions[sceneFolder] ?? 1;
}

