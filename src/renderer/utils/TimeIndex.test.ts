import { describe, expect, test } from '@jest/globals';
import { TimeIndex } from './TimeIndex';
import type { TimelineItem } from '../hooks/useTimelineData';

function createItem(
  overrides: Partial<TimelineItem> &
    Pick<
      TimelineItem,
      'id' | 'type' | 'startTime' | 'endTime' | 'duration' | 'label'
    >,
): TimelineItem {
  return {
    ...overrides,
  };
}

describe('TimeIndex', () => {
  test('resolves an exact clip boundary to the next item', () => {
    const items: TimelineItem[] = [
      createItem({
        id: 'clip-a',
        type: 'video',
        startTime: 0,
        endTime: 4,
        duration: 4,
        label: 'Clip A',
      }),
      createItem({
        id: 'clip-b',
        type: 'video',
        startTime: 4,
        endTime: 7,
        duration: 3,
        label: 'Clip B',
      }),
    ];

    const index = new TimeIndex(items);

    expect(index.findItemAtTime(4)?.id).toBe('clip-b');
    expect(index.getItemIndexAtTime(4)).toBe(1);
  });

  test('returns placeholders across gaps instead of dropping playback to null', () => {
    const items: TimelineItem[] = [
      createItem({
        id: 'clip-a',
        type: 'video',
        startTime: 0,
        endTime: 3,
        duration: 3,
        label: 'Clip A',
      }),
      createItem({
        id: 'gap',
        type: 'placeholder',
        startTime: 3,
        endTime: 5,
        duration: 2,
        label: 'Gap',
      }),
      createItem({
        id: 'clip-b',
        type: 'image',
        startTime: 5,
        endTime: 8,
        duration: 3,
        label: 'Clip B',
      }),
    ];

    const index = new TimeIndex(items);

    expect(index.findItemAtTime(3.5)?.id).toBe('gap');
    expect(index.getNextItemAfterTime(3)?.id).toBe('gap');
    expect(index.getNextItemAfterTime(5)?.id).toBe('clip-b');
  });

  test('skips audio-only adjacency when selecting the next visual item', () => {
    const items: TimelineItem[] = [
      createItem({
        id: 'clip-a',
        type: 'video',
        startTime: 0,
        endTime: 4,
        duration: 4,
        label: 'Clip A',
      }),
      createItem({
        id: 'audio-bed',
        type: 'audio',
        startTime: 0,
        endTime: 10,
        duration: 10,
        label: 'Audio Bed',
        audioPath: 'bed.mp3',
      }),
      createItem({
        id: 'clip-b',
        type: 'video',
        startTime: 4,
        endTime: 8,
        duration: 4,
        label: 'Clip B',
      }),
    ];

    const index = new TimeIndex(items);

    expect(index.getNextItemAfterTime(4)?.id).toBe('clip-b');
    expect(index.getNextItemIndexAfterTime(4)).toBe(2);
  });
});
