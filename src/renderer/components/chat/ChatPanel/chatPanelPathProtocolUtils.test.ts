import { describe, expect, it } from '@jest/globals';
import { pathBasename } from '../../../utils/pathNormalizer';
import {
  applyDesktopRemotionQueryParams,
  extractIncomingFileOpPath,
  isAbsoluteWirePath,
} from './chatPanelPathProtocolUtils';

describe('chatPanelPathProtocolUtils', () => {
  it('supports basename extraction for slash and backslash paths', () => {
    expect(pathBasename('/Users/dev/project/file.txt')).toBe('file.txt');
    expect(pathBasename('C:\\Users\\dev\\project\\file.txt')).toBe('file.txt');
  });

  it('prefers relativePath over legacy path for incoming file operations', () => {
    expect(
      extractIncomingFileOpPath({
        relativePath: 'plans/content-plan.md',
        path: '/legacy/absolute/path.md',
      }),
    ).toBe('plans/content-plan.md');
    expect(extractIncomingFileOpPath({ path: 'plans/content-plan.md' })).toBe(
      'plans/content-plan.md',
    );
  });

  it('detects unsafe absolute wire paths', () => {
    expect(isAbsoluteWirePath('/tmp/file.md')).toBe(true);
    expect(isAbsoluteWirePath('C:\\tmp\\file.md')).toBe(true);
    expect(isAbsoluteWirePath('plans/content-plan.md')).toBe(false);
  });

  it('applies desktop remotion websocket query params with optional version', () => {
    const withVersion = new URL('ws://localhost:8001/api/v1/ws/chat');
    applyDesktopRemotionQueryParams(withVersion, '1.0.9');
    expect(withVersion.searchParams.get('desktop_remotion')).toBe('1');
    expect(withVersion.searchParams.get('desktop_version')).toBe('1.0.9');

    const withoutVersion = new URL('ws://localhost:8001/api/v1/ws/chat');
    applyDesktopRemotionQueryParams(withoutVersion, '');
    expect(withoutVersion.searchParams.get('desktop_remotion')).toBe('1');
    expect(withoutVersion.searchParams.get('desktop_version')).toBeNull();
  });
});
