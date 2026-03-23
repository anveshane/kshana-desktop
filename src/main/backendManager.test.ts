import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const localStart = jest.fn<() => Promise<{ status: string; serverUrl?: string }>>();
const localRestart = jest.fn<() => Promise<{ status: string; serverUrl?: string }>>();
const localStop = jest.fn<() => Promise<{ status: string }>>();
const localIsAvailable = jest.fn<() => Promise<boolean>>();
const localGetBundledVersionInfo = jest.fn<() => Promise<Record<string, string> | undefined>>();

const cloudConnect = jest.fn<() => Promise<{ status: string; serverUrl?: string }>>();
const cloudDisconnect = jest.fn<() => Promise<{ status: string }>>();

jest.mock('./localBackendManager', () => ({
  __esModule: true,
  default: {
    on: jest.fn(),
    start: localStart,
    restart: localRestart,
    stop: localStop,
    isAvailable: localIsAvailable,
    getBundledVersionInfo: localGetBundledVersionInfo,
    currentServerUrl: 'http://127.0.0.1:8001',
  },
}));

jest.mock('./serverConnectionManager', () => ({
  __esModule: true,
  default: {
    on: jest.fn(),
    connect: cloudConnect,
    disconnect: cloudDisconnect,
  },
}));

import backendManager from './backendManager';
import type { AppSettings } from '../shared/settingsTypes';

const baseSettings: AppSettings = {
  backendMode: 'local',
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyuiTimeout: 1800,
  llmProvider: 'lmstudio',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
  themeId: 'studio-neutral',
};

describe('backendManager', () => {
  beforeEach(() => {
    localStart.mockReset();
    localRestart.mockReset();
    localStop.mockReset();
    localIsAvailable.mockReset();
    localGetBundledVersionInfo.mockReset();
    cloudConnect.mockReset();
    cloudDisconnect.mockReset();
  });

  it('starts the bundled local backend when local mode is selected', async () => {
    localStart.mockResolvedValue({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:8001',
    });
    cloudDisconnect.mockResolvedValue({ status: 'stopped' });

    const state = await backendManager.start(baseSettings, 'https://cloud.example.com');

    expect(localStart).toHaveBeenCalledWith(baseSettings);
    expect(cloudConnect).not.toHaveBeenCalled();
    expect(state.mode).toBe('local');
  });

  it('connects to the cloud backend when cloud mode is selected', async () => {
    localStop.mockResolvedValue({ status: 'stopped' });
    cloudConnect.mockResolvedValue({
      status: 'ready',
      serverUrl: 'https://cloud.example.com',
    });

    const state = await backendManager.start(
      { ...baseSettings, backendMode: 'cloud' },
      'https://cloud.example.com',
    );

    expect(localStart).not.toHaveBeenCalled();
    expect(cloudConnect).toHaveBeenCalledWith({
      serverUrl: 'https://cloud.example.com',
    });
    expect(state.mode).toBe('cloud');
  });

  it('reports the local effective endpoint when local mode is selected', async () => {
    localIsAvailable.mockResolvedValue(true);
    localGetBundledVersionInfo.mockResolvedValue({
      packageVersion: '0.1.0',
    });

    const info = await backendManager.getConnectionInfo(baseSettings, 'https://cloud.example.com');

    expect(info.effectiveServerUrl).toBe('http://127.0.0.1:8001');
    expect(info.cloudServerUrl).toBe('https://cloud.example.com');
    expect(info.selectedMode).toBe('local');
  });
});
