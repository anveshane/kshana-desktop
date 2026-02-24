import Store from 'electron-store';
import type { AppSettings } from '../shared/settingsTypes';

const defaults: AppSettings = {
  serverUrl: 'http://localhost:8001',
  comfyuiUrl: 'http://localhost:8000',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  llmProvider: 'lmstudio',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
  feature: {
    rich_editor_beta: false,
  },
};

const store = new Store<AppSettings>({
  name: 'kshana-settings',
  defaults,
  clearInvalidConfig: true,
});

export const getSettings = (): AppSettings => {
  return store.store;
};

export const updateSettings = (patch: Partial<AppSettings>): AppSettings => {
  store.set(patch);
  return store.store;
};

export type { AppSettings } from '../shared/settingsTypes';
