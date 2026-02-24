import { describe, expect, test } from '@jest/globals';
import {
  DEFAULT_TIMELINE_STATE,
  normalizeTimelineState,
} from '../../types/kshana';
import {
  insertShape,
  insertSticker,
  insertSvg,
  insertTextPreset,
} from './elementInsertService';

describe('elementInsertService', () => {
  test('inserts text preset into text track on empty timeline', () => {
    const state = normalizeTimelineState({ ...DEFAULT_TIMELINE_STATE });
    const next = insertTextPreset(state, 'title', 2);
    const textTrack = next.tracks.find((track) => track.type === 'text');

    expect(textTrack).toBeDefined();
    expect(textTrack?.elements.length).toBe(1);
    expect(textTrack?.elements[0]?.type).toBe('text');
    expect(textTrack?.elements[0]?.start_time_seconds).toBe(2);
  });

  test('inserts sticker and shape elements with default timing', () => {
    const state = normalizeTimelineState({ ...DEFAULT_TIMELINE_STATE });
    const withSticker = insertSticker(state, 'emoji:star', 1);
    const withShape = insertShape(withSticker, 'circle', 3);

    const stickerTrack = withShape.tracks.find((track) => track.type === 'sticker');
    const graphicsTrack = withShape.tracks.find(
      (track) => track.type === 'graphics',
    );

    expect(stickerTrack?.elements[0]?.type).toBe('sticker');
    expect(stickerTrack?.elements[0]?.start_time_seconds).toBe(1);
    expect(graphicsTrack?.elements[0]?.type).toBe('shape');
    expect(graphicsTrack?.elements[0]?.start_time_seconds).toBe(3);
  });

  test('inserts svg and preserves imported clip sync', () => {
    const state = normalizeTimelineState({
      ...DEFAULT_TIMELINE_STATE,
      imported_clips: [
        {
          id: 'clip-1',
          path: '.kshana/assets/videos/test.mp4',
          duration_seconds: 8,
          start_time_seconds: 0,
          track: 'main',
        },
      ],
    });

    const next = insertSvg(
      state,
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
      5,
    );

    const svgTrack = next.tracks.find((track) => track.type === 'graphics');
    expect(svgTrack).toBeDefined();
    expect(svgTrack?.elements[0]?.type).toBe('svg');
    expect(next.imported_clips.length).toBe(1);
    expect(next.imported_clips[0]?.path).toBe('.kshana/assets/videos/test.mp4');
  });
});
