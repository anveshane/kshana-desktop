import Store from 'electron-store';
import type { AppSettings } from '../shared/settingsTypes';

const FIXED_COMFYUI_TIMEOUT_SECONDS = 1800;

const defaults: AppSettings = {
  comfyuiUrl: 'http://localhost:8000',
  comfyuiTimeout: FIXED_COMFYUI_TIMEOUT_SECONDS,
};

const store = new Store<AppSettings>({
  name: 'kshana-settings',
  defaults,
  clearInvalidConfig: true,
});

export const getSettings = (): AppSettings => {
  return {
    ...store.store,
    comfyuiTimeout: FIXED_COMFYUI_TIMEOUT_SECONDS,
  };
};

export const updateSettings = (patch: Partial<AppSettings>): AppSettings => {
  store.set({
    ...patch,
    comfyuiTimeout: FIXED_COMFYUI_TIMEOUT_SECONDS,
  });
  return {
    ...store.store,
    comfyuiTimeout: FIXED_COMFYUI_TIMEOUT_SECONDS,
  };
};

/**
 * Legacy fallback for backend URL migration.
 * We no longer expose serverUrl in settings UI, but existing installs may
 * still have it persisted in electron-store.
 */
export const getStoredServerUrl = (): string | undefined => {
  const value = store.get('serverUrl');
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export type { AppSettings } from '../shared/settingsTypes';
