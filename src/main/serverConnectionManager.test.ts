import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('electron-log', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import serverConnectionManager from './serverConnectionManager';

describe('serverConnectionManager', () => {
  const originalFetch = globalThis.fetch;
  const originalAbortTimeout = AbortSignal.timeout;
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn(async () => ({ ok: true } as Response));
    globalThis.fetch = (fetchMock as unknown) as typeof fetch;
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: jest.fn(() => new AbortController().signal),
    });
  });

  afterEach(async () => {
    await serverConnectionManager.disconnect();
    globalThis.fetch = originalFetch;
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: originalAbortTimeout,
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('performs a single health check on connect without background polling', async () => {
    await serverConnectionManager.connect({ serverUrl: 'http://localhost:8001' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serverConnectionManager.status.status).toBe('ready');

    jest.advanceTimersByTime(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(serverConnectionManager.status.status).toBe('ready');
  });

  it('keeps polling while connecting and stops after the backend becomes ready', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false } as Response));
    fetchMock.mockImplementationOnce(async () => ({ ok: true } as Response));

    await serverConnectionManager.connect({ serverUrl: 'http://localhost:8001' });

    expect(serverConnectionManager.status.status).toBe('connecting');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(serverConnectionManager.status.status).toBe('ready');

    jest.advanceTimersByTime(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reconnect performs a fresh one-time health check', async () => {
    await serverConnectionManager.connect({ serverUrl: 'http://localhost:8001' });
    await serverConnectionManager.reconnect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(serverConnectionManager.status.status).toBe('ready');
  });
});
