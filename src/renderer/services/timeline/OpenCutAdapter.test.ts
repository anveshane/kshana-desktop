import { describe, expect, test } from '@jest/globals';
import type { KshanaTimelineState } from '../../types/kshana';
import {
  createTextPresetElement,
  fromOpenCutTimelineState,
  fromOpenCutTimelineTracks,
  toOpenCutTimelineState,
  toOpenCutTimelineTracks,
} from './OpenCutAdapter';
import { normalizeTimelineState } from '../../types/kshana';

function createLegacyState(): KshanaTimelineState {
  return {
    schema_version: '1',
    playhead_seconds: 4,
    zoom_level: 1.25,
    active_versions: {},
    markers: [],
    imported_clips: [
      {
        id: 'clip-a',
        path: '.kshana/assets/videos/a.mp4',
        duration_seconds: 8,
        start_time_seconds: 0,
        track: 'main',
      },
    ],
    image_timing_overrides: {},
    infographic_timing_overrides: {},
    video_split_overrides: {},
    tracks: [],
    bookmarks: [],
    view_state: {
      zoom_level: 1.25,
      scroll_left: 0,
      playhead_time: 4,
    },
    assets_version: 1,
  };
}

describe('OpenCutAdapter / timeline migration', () => {
  test('normalizes legacy state and synthesizes tracks', () => {
    const normalized = normalizeTimelineState(createLegacyState());
    expect(normalized.schema_version).toBe('2');
    expect(normalized.tracks.length).toBeGreaterThan(0);
    expect(normalized.tracks[0]?.type).toBe('video');
    expect(normalized.tracks[0]?.elements[0]?.id).toBe('clip-a');
    expect(normalized.imported_clips[0]?.path).toBe(
      '.kshana/assets/videos/a.mp4',
    );
  });

  test('round-trips track mapping to OpenCut-like shape and back', () => {
    const normalized = normalizeTimelineState(createLegacyState());
    const mapped = toOpenCutTimelineTracks(normalized.tracks);
    const restored = fromOpenCutTimelineTracks(mapped);

    expect(restored.length).toBe(normalized.tracks.length);
    expect(restored[0]?.elements[0]?.start_time_seconds).toBe(
      normalized.tracks[0]?.elements[0]?.start_time_seconds,
    );
    expect(restored[0]?.elements[0]?.duration_seconds).toBe(
      normalized.tracks[0]?.elements[0]?.duration_seconds,
    );
  });

  test('creates usable text presets', () => {
    const title = createTextPresetElement('title', 2);
    const caption = createTextPresetElement('caption', 3);

    expect(title.type).toBe('text');
    expect(title.content).toBe('Title');
    expect(title.start_time_seconds).toBe(2);
    expect(caption.font_size).toBe(24);
    expect(caption.start_time_seconds).toBe(3);
  });

  test('maps marker/version/override state through OpenCut adapter', () => {
    const normalized = normalizeTimelineState({
      ...createLegacyState(),
      markers: [
        {
          id: 'mk-1',
          position_seconds: 2.5,
          prompt: 'Test marker',
          status: 'pending',
          created_at: '2026-02-23T00:00:00.000Z',
        },
      ],
      active_versions: {
        'placement-001': { image: 2, video: 3 },
      },
      image_timing_overrides: {
        '1': { start_time_seconds: 0, end_time_seconds: 3 },
      },
      infographic_timing_overrides: {
        '2': { start_time_seconds: 4, end_time_seconds: 6 },
      },
      video_split_overrides: {
        '3': { split_offsets_seconds: [1, 2] },
      },
    });

    const mapped = toOpenCutTimelineState(normalized);
    const restored = fromOpenCutTimelineState(mapped);

    expect(restored.markers[0]?.id).toBe('mk-1');
    expect(restored.markers[0]?.position_seconds).toBe(2.5);
    expect(restored.active_versions['placement-001']).toEqual({
      image: 2,
      video: 3,
    });
    expect(restored.image_timing_overrides['1']?.end_time_seconds).toBe(3);
    expect(restored.video_split_overrides['3']?.split_offsets_seconds).toEqual([
      1,
      2,
    ]);
  });
});
