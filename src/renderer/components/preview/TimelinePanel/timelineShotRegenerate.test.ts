import { describe, expect, it } from '@jest/globals';
import type { TimelineItem } from '../../../hooks/useTimelineData';
import {
  buildShotRegenerateDraft,
  buildShotRegenerateMessage,
  isServerTimelineShotItem,
} from './timelineShotRegenerate';

describe('timelineShotRegenerate', () => {
  it('identifies server timeline shot items and rejects non-shot items', () => {
    const shotItem: TimelineItem = {
      id: 'segment_2_shot_1',
      type: 'image',
      startTime: 0,
      endTime: 4,
      duration: 4,
      label: 'Shot 1',
      sourceType: 'server_timeline',
      sceneNumber: 3,
      shotNumber: 1,
      segmentId: 'segment_2_shot_1',
    };

    const nonShotItem: TimelineItem = {
      id: 'segment_2',
      type: 'video',
      startTime: 0,
      endTime: 4,
      duration: 4,
      label: 'Scene 3',
      sourceType: 'server_timeline',
      segmentId: 'segment_2',
    };

    expect(isServerTimelineShotItem(shotItem)).toBe(true);
    expect(isServerTimelineShotItem(nonShotItem)).toBe(false);
    expect(isServerTimelineShotItem(null)).toBe(false);
  });

  it('builds a regenerate draft with the current shot prompt when available', () => {
    const draft = buildShotRegenerateDraft({
      id: 'segment_2_shot_1',
      type: 'image',
      startTime: 0,
      endTime: 4,
      duration: 4,
      label: 'Shot 1',
      sourceType: 'server_timeline',
      sceneNumber: 3,
      shotNumber: 1,
      segmentId: 'segment_2_shot_1',
      prompt: 'A cinematic close-up with strong backlight.',
    });

    expect(draft).toContain('Regenerate Scene 3 Shot 1');
    expect(draft).toContain('Segment ID: segment_2_shot_1');
    expect(draft).toContain('Current shot prompt:');
    expect(draft).toContain('A cinematic close-up with strong backlight.');
  });

  it('builds a fallback regenerate draft when prompt metadata is missing', () => {
    const draft = buildShotRegenerateDraft({
      id: 'segment_2_shot_1',
      type: 'video',
      startTime: 0,
      endTime: 4,
      duration: 4,
      label: 'Shot 1',
      sourceType: 'server_timeline',
      sceneNumber: 3,
      shotNumber: 1,
      segmentId: 'segment_2_shot_1',
    });

    expect(draft).toContain('Current shot prompt: unavailable');
    expect(draft).toContain('Inspect the current shot context for this segment');
  });

  it('builds a regenerate message from the edited modal prompt', () => {
    const message = buildShotRegenerateMessage(
      {
        id: 'segment_2_shot_1',
        type: 'image',
        startTime: 0,
        endTime: 4,
        duration: 4,
        label: 'Shot 1',
        sourceType: 'server_timeline',
        sceneNumber: 3,
        shotNumber: 1,
        segmentId: 'segment_2_shot_1',
      },
      'Edited prompt from modal',
    );

    expect(message).toContain('Regenerate Scene 3 Shot 1');
    expect(message).toContain('Current shot prompt:');
    expect(message).toContain('Edited prompt from modal');
  });
});
