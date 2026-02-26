import { describe, expect, it } from '@jest/globals';
import { pathBasename } from '../../../utils/pathNormalizer';
import {
  extractFilePathProtocolVersion,
  shouldShowFilePathProtocolWarning,
} from './chatPanelPathProtocolUtils';

describe('chatPanelPathProtocolUtils', () => {
  it('extracts protocol version from status capabilities', () => {
    expect(
      extractFilePathProtocolVersion({
        capabilities: { filePathProtocolVersion: 2 },
      }),
    ).toBe(2);
    expect(
      extractFilePathProtocolVersion({
        capabilities: { filePathProtocolVersion: '1' },
      }),
    ).toBe(1);
    expect(extractFilePathProtocolVersion({})).toBeNull();
  });

  it('dedupes compatibility warnings per session', () => {
    const warnedSessions = new Set<string>();

    const first = shouldShowFilePathProtocolWarning(
      1,
      'session-1',
      warnedSessions,
      false,
    );
    expect(first.shouldWarn).toBe(true);
    expect(warnedSessions.has('session-1')).toBe(true);

    const second = shouldShowFilePathProtocolWarning(
      1,
      'session-1',
      warnedSessions,
      false,
    );
    expect(second.shouldWarn).toBe(false);

    const third = shouldShowFilePathProtocolWarning(
      2,
      'session-2',
      warnedSessions,
      false,
    );
    expect(third.shouldWarn).toBe(false);
  });

  it('dedupes no-session warning and avoids duplicate when session arrives later', () => {
    const warnedSessions = new Set<string>();

    const first = shouldShowFilePathProtocolWarning(
      null,
      null,
      warnedSessions,
      false,
    );
    expect(first.shouldWarn).toBe(true);
    expect(first.warnedWithoutSession).toBe(true);

    const second = shouldShowFilePathProtocolWarning(
      null,
      null,
      warnedSessions,
      first.warnedWithoutSession,
    );
    expect(second.shouldWarn).toBe(false);

    const third = shouldShowFilePathProtocolWarning(
      null,
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
});
