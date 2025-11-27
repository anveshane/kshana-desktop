import Store from 'electron-store';
import type { BackendEnvOverrides } from '../shared/backendTypes';
import type { AppSettings } from '../shared/settingsTypes';

const defaults: AppSettings = {
  comfyuiUrl: 'http://localhost:8000',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  llmProvider: 'lmstudio',
  googleApiKey: '',
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

export const toBackendEnv = (settings: AppSettings): BackendEnvOverrides => ({
  port: settings.preferredPort,
  comfyuiUrl: settings.comfyuiUrl,
  lmStudioUrl: settings.lmStudioUrl,
  lmStudioModel: settings.lmStudioModel,
  llmProvider: settings.llmProvider,
  googleApiKey: settings.googleApiKey,
  projectDir: settings.projectDir,
});

export type { AppSettings } from '../shared/settingsTypes';
