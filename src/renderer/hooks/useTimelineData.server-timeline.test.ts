import { describe, expect, it } from '@jest/globals';
import {
  buildServerTimelineItems,
  getTimelineFileState,
} from './useTimelineData';
import { DEFAULT_TIMELINE_STATE } from '../types/kshana';

describe('useTimelineData server timeline helpers', () => {
  it('returns none state when timeline.json is missing', () => {
    const result = getTimelineFileState(null);

    expect(result.source).toBe('none');
    expect(result.timeline).toBeNull();
    expect(result.error).toBeNull();
  });

  it('returns none state when timeline.json is invalid JSON', () => {
    const result = getTimelineFileState('{nope');

    expect(result.source).toBe('none');
    expect(result.timeline).toBeNull();
    expect(result.error).toContain('invalid');
  });

  it('normalizes a filled segment through manifest artifact lookup', () => {
    const items = buildServerTimelineItems({
      timeline: {
        version: '1.0',
        totalDuration: 8,
        segments: [
          {
            id: 'segment_1',
            label: 'Intro',
            startTime: 0,
            endTime: 8,
            fillStatus: 'filled',
            layers: [
              {
                type: 'visual',
                artifactId: 'img_1',
              },
            ],
          },
        ],
      },
      assets: [
        {
          id: 'img_1',
          type: 'scene_image',
          path: 'assets/images/intro.png',
          version: 1,
          created_at: 1,
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'segment_1',
        segmentId: 'segment_1',
        sourceType: 'server_timeline',
        type: 'image',
        imagePath: 'assets/images/intro.png',
        startTime: 0,
        endTime: 8,
      }),
    ]);
  });

  it('normalizes a filled segment through direct filePath video resolution', () => {
    const items = buildServerTimelineItems({
      timeline: {
        version: '1.0',
        totalDuration: 4,
        segments: [
          {
            id: 'segment_2',
            label: 'Clip',
            startTime: 1,
            endTime: 4,
            fillStatus: 'filled',
            layers: [
              {
                type: 'visual',
                filePath: 'assets/videos/clip.mp4',
              },
            ],
          },
        ],
      },
      assets: [],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'segment_2',
        type: 'video',
        videoPath: 'assets/videos/clip.mp4',
        startTime: 1,
        endTime: 4,
      }),
    ]);
  });

  it('renders planned or unresolved segments as placeholders', () => {
    const items = buildServerTimelineItems({
      timeline: {
        version: '1.0',
        totalDuration: 10,
        segments: [
          {
            id: 'segment_planned',
            label: 'Planned',
            startTime: 0,
            endTime: 5,
            fillStatus: 'planned',
            layers: [],
          },
          {
            id: 'segment_unresolved',
            label: 'Broken',
            startTime: 5,
            endTime: 10,
            fillStatus: 'filled',
            layers: [
              {
                type: 'visual',
                artifactId: 'missing',
              },
            ],
          },
        ],
      },
      assets: [],
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'segment_planned',
        type: 'placeholder',
        label: 'Planned',
      }),
      expect.objectContaining({
        id: 'segment_unresolved',
        type: 'placeholder',
        label: 'Broken',
      }),
    ]);
  });

  it('applies segment timing overrides to server timeline visuals', () => {
    const items = buildServerTimelineItems({
      timeline: {
        version: '1.0',
        totalDuration: 8,
        segments: [
          {
            id: 'segment_3',
            label: 'Adjusted',
            startTime: 0,
            endTime: 4,
            fillStatus: 'filled',
            layers: [
              {
                type: 'visual',
                filePath: 'assets/images/adjusted.png',
              },
            ],
          },
        ],
      },
      assets: [],
      segmentOverrides: {
        segment_3: {
          start_time_seconds: 2,
          end_time_seconds: 6,
        },
      },
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: 'segment_3',
        startTime: 2,
        endTime: 6,
        duration: 4,
        sourceStartTime: 0,
        sourceEndTime: 4,
      }),
    ]);
  });

  it('includes segment timing overrides in the default timeline state', () => {
    expect(DEFAULT_TIMELINE_STATE.segment_timing_overrides).toEqual({});
  });
});
