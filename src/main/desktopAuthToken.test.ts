import { describe, expect, it } from '@jest/globals';
import { parseDesktopAuthToken } from './desktopAuthToken';

function makeToken(payload: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}

describe('parseDesktopAuthToken', () => {
  it('accepts a valid unexpired desktop token payload', () => {
    const token = makeToken({
      type: 'desktop',
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(parseDesktopAuthToken(token)).toEqual({
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
    });
  });

  it('rejects expired, malformed, or non-desktop tokens', () => {
    expect(parseDesktopAuthToken('not-a-token')).toBeNull();
    expect(
      parseDesktopAuthToken(
        makeToken({
          type: 'web',
          sub: 'user-1',
          email: 'test@example.com',
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      ),
    ).toBeNull();
    expect(
      parseDesktopAuthToken(
        makeToken({
          type: 'desktop',
          sub: 'user-1',
          email: 'test@example.com',
          exp: Math.floor(Date.now() / 1000) - 1,
        }),
      ),
    ).toBeNull();
  });
});
