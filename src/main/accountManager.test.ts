/* eslint-disable import/first */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let storedAccount: unknown = null;
const storeSet = jest.fn((key: string, value: unknown) => {
  if (key === 'account') storedAccount = value;
});
const storeGet = jest.fn((key: string, fallback: unknown) => {
  if (key === 'account') return storedAccount ?? fallback;
  return fallback;
});

jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => ({
    set: storeSet,
    get: storeGet,
  })),
);

import { getAccount, refreshBalance, setAccount } from './accountManager';

describe('accountManager', () => {
  let fetchMock: jest.MockedFunction<() => Promise<unknown>>;

  beforeEach(() => {
    storedAccount = null;
    storeSet.mockClear();
    storeGet.mockClear();
    fetchMock = jest.fn<() => Promise<unknown>>();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('clears the stored account when balance refresh returns 401', async () => {
    setAccount({
      userId: 'user-1',
      email: 'test@example.com',
      credits: 10,
      token: 'expired-token',
    });
    fetchMock.mockResolvedValue({
      status: 401,
      ok: false,
    });

    await expect(refreshBalance('https://kshana.example')).resolves.toBeNull();

    expect(getAccount()).toBeNull();
  });

  it('updates cached credits when balance refresh succeeds', async () => {
    setAccount({
      userId: 'user-1',
      email: 'test@example.com',
      credits: 10,
      token: 'valid-token',
    });
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ balance: 42 }),
    });

    await expect(refreshBalance('https://kshana.example')).resolves.toBe(42);

    expect(getAccount()?.credits).toBe(42);
  });
});
