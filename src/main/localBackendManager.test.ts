import { describe, expect, it, jest } from '@jest/globals';
import { buildLocalBackendEnv } from './localBackendManager';
import type { AppSettings } from '../shared/settingsTypes';

jest.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}));

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

describe('buildLocalBackendEnv', () => {
  it('forwards COMFY_CLOUD_API_KEY for cloud.comfy.org', () => {
    const env = buildLocalBackendEnv(
      {
        ...baseSettings,
        comfyuiMode: 'custom',
        comfyuiUrl: 'https://cloud.comfy.org',
        comfyCloudApiKey: 'cloud-key',
      },
      8001,
    );

    expect(env['COMFYUI_BASE_URL']).toBe('https://cloud.comfy.org');
    expect(env['COMFY_CLOUD_API_KEY']).toBe('cloud-key');
  });

  it('does not forward COMFY_CLOUD_API_KEY for local ComfyUI urls', () => {
    const env = buildLocalBackendEnv(
      {
        ...baseSettings,
        comfyuiMode: 'custom',
        comfyuiUrl: 'http://localhost:8188',
        comfyCloudApiKey: 'cloud-key',
      },
      8001,
    );

    expect(env['COMFYUI_BASE_URL']).toBe('http://localhost:8188');
    expect(env['COMFY_CLOUD_API_KEY']).toBeUndefined();
  });
});
