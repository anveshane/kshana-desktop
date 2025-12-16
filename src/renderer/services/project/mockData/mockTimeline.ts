/**
 * Mock Timeline State Data
 * Timeline configuration for the "Desert Survival Story" project
 */

import type {
  KshanaTimelineState,
  KshanaTimelineMarker,
  ImportedClip,
} from '../../../types/kshana';

/**
 * Mock timeline markers
 */
export const MOCK_MARKERS: KshanaTimelineMarker[] = [
  {
    id: 'marker_001',
    position_seconds: 0,
    prompt: 'Opening shot: sunrise over desert dunes',
    status: 'complete',
    generated_artifact_id: 'scene_001_video_v2',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'marker_002',
    position_seconds: 5.2,
    prompt: 'Marcus examines the artifact with concern',
    status: 'complete',
    generated_artifact_id: 'scene_002_video_v1',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: 'marker_003',
    position_seconds: 9.7,
    prompt: 'Fatima working late, surrounded by ancient texts',
    status: 'processing',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'marker_004',
    position_seconds: 15.5,
    prompt: 'Wide shot: expedition vehicles crossing dunes at golden hour',
    status: 'pending',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

/**
 * Mock imported clips (user-imported raw footage)
 */
export const MOCK_IMPORTED_CLIPS: ImportedClip[] = [
  {
    id: 'imported_001',
    path: 'videos/imported/b-roll-desert-sunset.mp4',
    duration_seconds: 12.5,
    start_time_seconds: 25.0,
    trim: {
      in_seconds: 2.0,
      out_seconds: 10.0,
    },
    track: 'overlay',
  },
  {
    id: 'imported_002',
    path: 'videos/imported/interview-clip.mp4',
    duration_seconds: 45.0,
    start_time_seconds: 35.0,
    track: 'main',
  },
];

/**
 * Active scene versions (which video version is selected for each scene)
 */
export const MOCK_ACTIVE_VERSIONS: Record<string, number> = {
  'scene-001': 2, // Using v2 for scene 1
  'scene-002': 1, // Using v1 for scene 2
  'scene-003': 3, // Using v3 for scene 3 (latest regeneration)
};

/**
 * Creates the full mock timeline state
 */
export function createMockTimelineState(): KshanaTimelineState {
  return {
    schema_version: '1',
    playhead_seconds: 5.2,
    zoom_level: 1.5,
    active_versions: { ...MOCK_ACTIVE_VERSIONS },
    markers: MOCK_MARKERS.map((marker) => ({
      ...marker,
      created_at: new Date(
        Date.now() - Math.random() * 86400000 * 7,
      ).toISOString(),
    })),
    imported_clips: [...MOCK_IMPORTED_CLIPS],
  };
}

/**
 * Creates an empty timeline state with defaults
 */
export function createEmptyTimelineState(): KshanaTimelineState {
  return {
    schema_version: '1',
    playhead_seconds: 0,
    zoom_level: 1.0,
    active_versions: {},
    markers: [],
    imported_clips: [],
  };
}

/**
 * Calculates the total duration of all content on the timeline
 */
export function calculateTimelineDuration(
  state: KshanaTimelineState,
  sceneDurations: Record<string, number>,
): number {
  // Calculate duration from scenes
  let maxSceneEnd = 0;
  let currentPosition = 0;

  Object.keys(state.active_versions).forEach((sceneFolder) => {
    const duration = sceneDurations[sceneFolder] || 5; // Default 5s per scene
    currentPosition += duration;
    maxSceneEnd = Math.max(maxSceneEnd, currentPosition);
  });

  // Calculate duration from imported clips
  let maxClipEnd = 0;
  state.imported_clips.forEach((clip) => {
    const clipDuration = clip.trim
      ? clip.trim.out_seconds - clip.trim.in_seconds
      : clip.duration_seconds;
    const clipEnd = clip.start_time_seconds + clipDuration;
    maxClipEnd = Math.max(maxClipEnd, clipEnd);
  });

  return Math.max(maxSceneEnd, maxClipEnd);
}

/**
 * Gets marker statistics
 */
export function getMarkerStats(markers: KshanaTimelineMarker[]): {
  total: number;
  pending: number;
  processing: number;
  complete: number;
  error: number;
} {
  return {
    total: markers.length,
    pending: markers.filter((m) => m.status === 'pending').length,
    processing: markers.filter((m) => m.status === 'processing').length,
    complete: markers.filter((m) => m.status === 'complete').length,
    error: markers.filter((m) => m.status === 'error').length,
  };
}

