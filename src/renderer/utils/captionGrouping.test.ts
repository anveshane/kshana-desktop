import { describe, it, expect } from '@jest/globals';
import {
  groupWordsIntoCues,
  sanitizeWordTimestamps,
} from './captionGrouping';
import type { WordTimestamp } from '../types/captions';

describe('captionGrouping', () => {
  it('sanitizes words and enforces monotonic time ordering', () => {
    const input: WordTimestamp[] = [
      { text: 'hello', startTime: 1.2, endTime: 1.1 },
      { text: 'world', startTime: 0.8, endTime: 1.0 },
      { text: ' ', startTime: 1.0, endTime: 1.2 },
      { text: 'again', startTime: 1.05, endTime: 1.3 },
    ];

    const result = sanitizeWordTimestamps(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('world');
    expect(result[1]?.text).toBe('again');
    expect(result[1]!.startTime).toBeGreaterThanOrEqual(result[0]!.endTime);
  });

  it('splits cues on punctuation and silence', () => {
    const words: WordTimestamp[] = [
      { text: 'This', startTime: 0.0, endTime: 0.2 },
      { text: 'is', startTime: 0.2, endTime: 0.35 },
      { text: 'great.', startTime: 0.35, endTime: 0.55 },
      { text: 'Now', startTime: 1.2, endTime: 1.35 }, // >450ms gap
      { text: 'continue', startTime: 1.35, endTime: 1.6 },
    ];

    const cues = groupWordsIntoCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe('This is great.');
    expect(cues[1]?.text).toBe('Now continue');
  });

  it('hard-splits cues at six words', () => {
    const words: WordTimestamp[] = new Array(8).fill(null).map((_, i) => ({
      text: `w${i + 1}`,
      startTime: i * 0.2,
      endTime: i * 0.2 + 0.15,
    }));

    const cues = groupWordsIntoCues(words);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.words).toHaveLength(6);
    expect(cues[1]?.words).toHaveLength(2);
  });
});
