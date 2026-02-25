import { describe, expect, it } from '@jest/globals';
import {
  buildPromptOverlayCues,
  buildTimelineExportItem,
} from './promptOverlayExport';

describe('promptOverlayExport', () => {
  it('buildPromptOverlayCues prefers expanded prompt and falls back to prompt', () => {
    const cues = buildPromptOverlayCues([
      {
        id: 'PLM-1',
        type: 'image',
        startTime: 8,
        endTime: 24,
        expandedPrompt: 'expanded image prompt',
        prompt: 'original image prompt',
      },
      {
        id: 'vd-placement-2',
        type: 'video',
        startTime: 24,
        endTime: 33,
        prompt: 'original video prompt',
      },
      {
        id: 'placeholder-1',
        type: 'placeholder',
        startTime: 0,
        endTime: 8,
        prompt: 'should be ignored',
      },
    ]);

    expect(cues).toEqual([
      {
        id: 'prompt-overlay-PLM-1',
        startTime: 8,
        endTime: 24,
        text: 'expanded image prompt',
      },
      {
        id: 'prompt-overlay-vd-placement-2',
        startTime: 24,
        endTime: 33,
        text: 'original video prompt',
      },
    ]);
  });

  it('buildTimelineExportItem converts missing media path to placeholder', () => {
    const exportItem = buildTimelineExportItem(
      {
        type: 'image',
        duration: 6,
        startTime: 12,
        endTime: 18,
        label: 'PLM-3',
      },
      '',
      '',
    );

    expect(exportItem.type).toBe('placeholder');
    expect(exportItem.path).toBe('');
    expect(exportItem.startTime).toBe(12);
    expect(exportItem.endTime).toBe(18);
    expect(exportItem.duration).toBe(6);
    expect(exportItem.usedPlaceholderForMissingMedia).toBe(true);
  });

  it('buildTimelineExportItem keeps video type and source offset when media exists', () => {
    const exportItem = buildTimelineExportItem(
      {
        type: 'video',
        duration: 5,
        startTime: 18,
        endTime: 23,
        sourceOffsetSeconds: 2.5,
        label: 'vd-placement-4',
      },
      '/tmp/video.mp4',
      '',
    );

    expect(exportItem.type).toBe('video');
    expect(exportItem.path).toBe('/tmp/video.mp4');
    expect(exportItem.sourceOffsetSeconds).toBe(2.5);
    expect(exportItem.usedPlaceholderForMissingMedia).toBe(false);
  });
});
