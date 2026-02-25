import { describe, expect, it } from '@jest/globals';
import {
  getAudioBlockWidthPx,
  MIN_AUDIO_BLOCK_WIDTH_PX,
} from './timelineAudioSizing';

describe('getAudioBlockWidthPx', () => {
  it('keeps a minimum width for zero-duration audio', () => {
    const width = getAudioBlockWidthPx({ duration: 0, zoomLevel: 1 });
    expect(width).toBe(MIN_AUDIO_BLOCK_WIDTH_PX);
  });

  it('scales width based on duration and zoom level', () => {
    const width = getAudioBlockWidthPx({ duration: 2, zoomLevel: 1.5 });
    expect(width).toBe(150);
  });
});
