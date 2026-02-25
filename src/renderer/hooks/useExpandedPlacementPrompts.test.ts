import { describe, expect, it } from '@jest/globals';
import { parseExpandedPlacementPrompts } from './useExpandedPlacementPrompts';

describe('parseExpandedPlacementPrompts', () => {
  it('parses valid expanded prompt file', () => {
    const parsed = parseExpandedPlacementPrompts(
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-02-25T12:34:56.000Z',
        image: [
          {
            placementNumber: 1,
            startTime: '0:08',
            endTime: '0:24',
            originalPrompt: 'short placement prompt',
            expandedPrompt: 'full expanded prompt',
            negativePrompt: 'no text',
            isExpanded: true,
          },
        ],
        video: [
          {
            placementNumber: 2,
            startTime: '0:24',
            endTime: '0:33',
            originalPrompt: 'short video prompt',
            expandedPrompt: 'full video prompt',
            isExpanded: false,
          },
        ],
      }),
    );

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.image).toHaveLength(1);
    expect(parsed.video).toHaveLength(1);
    expect(parsed.image[0]?.negativePrompt).toBe('no text');
  });

  it('drops malformed entries and keeps valid ones', () => {
    const parsed = parseExpandedPlacementPrompts(
      JSON.stringify({
        image: [
          {
            placementNumber: '1',
            startTime: '0:08',
            endTime: '0:24',
            originalPrompt: 'bad',
            expandedPrompt: 'bad',
            isExpanded: true,
          },
          {
            placementNumber: 2,
            startTime: '0:24',
            endTime: '0:33',
            originalPrompt: 'ok',
            expandedPrompt: 'ok expanded',
            isExpanded: true,
          },
        ],
        video: 'not-an-array',
      }),
    );

    expect(parsed.image).toHaveLength(1);
    expect(parsed.image[0]?.placementNumber).toBe(2);
    expect(parsed.video).toHaveLength(0);
  });

  it('returns empty arrays when arrays are missing', () => {
    const parsed = parseExpandedPlacementPrompts(
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-02-25T12:34:56.000Z',
      }),
    );

    expect(parsed.image).toEqual([]);
    expect(parsed.video).toEqual([]);
  });
});
