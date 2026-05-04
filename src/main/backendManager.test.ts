import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const localStart = jest.fn<() => Promise<{ status: string; serverUrl?: string }>>();
const localRestart = jest.fn<() => Promise<{ status: string; serverUrl?: string }>>();
const localStop = jest.fn<() => Promise<{ status: string }>>();
const localIsAvailable = jest.fn<() => Promise<boolean>>();
const localGetBundledVersionInfo = jest.fn<() => Promise<Record<string, string> | undefined>>();

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

import backendManager from './backendManager';
import type { AppSettings } from '../shared/settingsTypes';

const baseSettings: AppSettings = {
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyCloudApiKey: '',
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
  });

  it('starts the bundled local backend', async () => {
    localStart.mockResolvedValue({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:8001',
    });

    const state = await backendManager.start(baseSettings);

    expect(localStart).toHaveBeenCalledWith(baseSettings);
    expect(state.status).toBe('ready');
    expect(state.serverUrl).toBe('http://127.0.0.1:8001');
  });

  it('reports the local effective endpoint', async () => {
    localIsAvailable.mockResolvedValue(true);
    localGetBundledVersionInfo.mockResolvedValue({
      packageVersion: '0.1.0',
    });

    const info = await backendManager.getConnectionInfo(baseSettings);

    expect(info.effectiveServerUrl).toBe('http://127.0.0.1:8001');
    expect(info.localBackendAvailable).toBe(true);
  });
});
