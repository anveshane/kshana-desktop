import { describe, expect, it } from '@jest/globals';
import { normalizePathForExport, stripFileProtocol } from './pathNormalizer';

describe('renderer pathNormalizer', () => {
  it('keeps unix file URLs absolute when stripping protocol', () => {
    const result = stripFileProtocol('file:///Users/dev/project/image 1.png');
    expect(result).toBe('/Users/dev/project/image 1.png');
  });

  it('normalizes windows file URLs when stripping protocol', () => {
    const result = stripFileProtocol('file:///C:/Users/dev/project/image.png');
    expect(result).toBe('C:/Users/dev/project/image.png');
  });

  it('normalizes export path from unix file URL', () => {
    const result = normalizePathForExport('file:///Users/dev/project/video.mp4');
    expect(result).toBe('/Users/dev/project/video.mp4');
  });
});
