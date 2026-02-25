import { describe, expect, it } from '@jest/globals';
import {
  normalizePathForFFmpeg,
  stripFileProtocol,
} from './pathNormalizer';

describe('main pathNormalizer', () => {
  it('keeps unix file URLs absolute when stripping protocol', () => {
    const result = stripFileProtocol('file:///Users/dev/project/image.png');
    expect(result).toBe('/Users/dev/project/image.png');
  });

  it('normalizes windows file URLs when stripping protocol', () => {
    const result = stripFileProtocol('file:///C:/Users/dev/project/image.png');
    expect(result).toBe('C:/Users/dev/project/image.png');
  });

  it('normalizes relative paths against project directory', async () => {
    const result = await normalizePathForFFmpeg(
      'agent/video-placements/video1.mp4',
      '/Users/dev/project',
    );
    expect(result).toBe('/Users/dev/project/agent/video-placements/video1.mp4');
  });

  it('normalizes unix file URLs for ffmpeg paths', async () => {
    const result = await normalizePathForFFmpeg(
      'file:///Users/dev/project/video.mp4',
      '/Users/dev/project',
    );
    expect(result).toBe('/Users/dev/project/video.mp4');
  });
});
