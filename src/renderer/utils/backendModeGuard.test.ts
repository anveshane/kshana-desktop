import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getBackendStateForSettings } from './backendModeGuard';
import type { BackendState } from '../../shared/backendTypes';
import type { AppSettings } from '../../shared/settingsTypes';

const baseSettings: AppSettings = {
  backendMode: 'local',
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyCloudApiKey: '',
  comfyuiTimeout: 1800,
  llmProvider: 'openai',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiModel: 'GLM-4.7',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
  themeId: 'studio-neutral',
};

describe('backendModeGuard', () => {
  const getState = jest.fn<() => Promise<BackendState>>();
  const restart = jest.fn<() => Promise<BackendState>>();

  beforeEach(() => {
    getState.mockReset();
    restart.mockReset();
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        backend: {
          getState,
          restart,
        },
      },
    });
  });

  it('restarts when local settings see a cloud backend state', async () => {
    getState.mockResolvedValue({
      status: 'ready',
      mode: 'cloud',
      serverUrl: 'https://kshana.example.com',
    });
    restart.mockResolvedValue({
      status: 'ready',
      mode: 'local',
      serverUrl: 'http://127.0.0.1:62377',
    });

    await expect(getBackendStateForSettings(baseSettings)).resolves.toEqual({
      status: 'ready',
      mode: 'local',
      serverUrl: 'http://127.0.0.1:62377',
    });
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('uses the current state when mode already matches settings', async () => {
    const localState: BackendState = {
      status: 'ready',
      mode: 'local',
      serverUrl: 'http://127.0.0.1:62377',
    };
    getState.mockResolvedValue(localState);

    await expect(getBackendStateForSettings(baseSettings)).resolves.toBe(
      localState,
    );
    expect(restart).not.toHaveBeenCalled();
  });
});
