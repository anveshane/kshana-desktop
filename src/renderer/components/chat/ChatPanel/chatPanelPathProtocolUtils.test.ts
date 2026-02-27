import { describe, expect, it } from '@jest/globals';
import { pathBasename } from '../../../utils/pathNormalizer';
import {
  extractFilePathTransport,
  extractIncomingFileOpPath,
  extractFilePathProtocolVersion,
  isAbsoluteWirePath,
  isFilePathProtocolCompatible,
  shouldShowFilePathProtocolWarning,
} from './chatPanelPathProtocolUtils';

describe('chatPanelPathProtocolUtils', () => {
  it('extracts protocol version and transport from status capabilities', () => {
    expect(
      extractFilePathProtocolVersion({
        capabilities: {
          filePathProtocolVersion: 3,
          filePathTransport: 'relative_posix',
        },
      }),
    ).toBe(3);
    expect(
      extractFilePathProtocolVersion({
        capabilities: { filePathProtocolVersion: '1' },
      }),
    ).toBe(1);
    expect(extractFilePathProtocolVersion({})).toBeNull();

    expect(
      extractFilePathTransport({
        capabilities: {
          filePathProtocolVersion: 3,
          filePathTransport: 'relative_posix',
        },
      }),
    ).toBe('relative_posix');
    expect(extractFilePathTransport({ capabilities: {} })).toBeNull();
  });

  it('determines compatibility from version and transport', () => {
    expect(isFilePathProtocolCompatible(3, 'relative_posix')).toBe(true);
    expect(isFilePathProtocolCompatible(2, 'relative_posix')).toBe(false);
    expect(isFilePathProtocolCompatible(3, 'legacy_path')).toBe(false);
  });

  it('dedupes compatibility warnings per session', () => {
    const warnedSessions = new Set<string>();

    const first = shouldShowFilePathProtocolWarning(
      false,
      'session-1',
      warnedSessions,
      false,
    );
    expect(first.shouldWarn).toBe(true);
    expect(warnedSessions.has('session-1')).toBe(true);

    const second = shouldShowFilePathProtocolWarning(
      false,
      'session-1',
      warnedSessions,
      false,
    );
    expect(second.shouldWarn).toBe(false);

    const third = shouldShowFilePathProtocolWarning(
      true,
      'session-2',
      warnedSessions,
      false,
    );
    expect(third.shouldWarn).toBe(false);
  });

  it('dedupes no-session warning and avoids duplicate when session arrives later', () => {
    const warnedSessions = new Set<string>();

    const first = shouldShowFilePathProtocolWarning(
      false,
      null,
      warnedSessions,
      false,
    );
    expect(first.shouldWarn).toBe(true);
    expect(first.warnedWithoutSession).toBe(true);

    const second = shouldShowFilePathProtocolWarning(
      false,
      null,
      warnedSessions,
      first.warnedWithoutSession,
    );
    expect(second.shouldWarn).toBe(false);

    const third = shouldShowFilePathProtocolWarning(
      false,
      'session-after-connect',
      warnedSessions,
      second.warnedWithoutSession,
    );
    expect(third.shouldWarn).toBe(false);
  });

  it('supports basename extraction for slash and backslash paths', () => {
    expect(pathBasename('/Users/dev/project/file.txt')).toBe('file.txt');
    expect(pathBasename('C:\\Users\\dev\\project\\file.txt')).toBe('file.txt');
  });

  it('prefers relativePath over legacy path for incoming file operations', () => {
    expect(
      extractIncomingFileOpPath({
        relativePath: 'agent/plans/content-plan.md',
        path: '/legacy/absolute/path.md',
      }),
    ).toBe('agent/plans/content-plan.md');
    expect(extractIncomingFileOpPath({ path: 'agent/plans/content-plan.md' })).toBe(
      'agent/plans/content-plan.md',
    );
  });

  it('detects unsafe absolute wire paths', () => {
    expect(isAbsoluteWirePath('/tmp/file.md')).toBe(true);
    expect(isAbsoluteWirePath('C:\\tmp\\file.md')).toBe(true);
    expect(isAbsoluteWirePath('agent/plans/content-plan.md')).toBe(false);
  });
});
