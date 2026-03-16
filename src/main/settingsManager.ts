import Store from 'electron-store';
import type { AppSettings, ComfyUIMode, ThemeId } from '../shared/settingsTypes';

const FIXED_COMFYUI_TIMEOUT_SECONDS = 1800;
const LEGACY_LOCAL_COMFYUI_URL = 'http://localhost:8000';
const DEFAULT_THEME_ID: ThemeId = 'studio-neutral';

const defaults: AppSettings = {
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyuiTimeout: FIXED_COMFYUI_TIMEOUT_SECONDS,
  themeId: DEFAULT_THEME_ID,
};

const store = new Store<AppSettings>({
  name: 'kshana-settings',
  defaults,
  clearInvalidConfig: true,
});

function normalizeComfyUIMode(value: unknown): ComfyUIMode | null {
  if (value === 'inherit' || value === 'custom') {
    return value;
  }
  return null;
}

function normalizeComfyUIUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeThemeId(value: unknown): ThemeId {
  if (
    value === 'studio-neutral' ||
    value === 'deep-forest-gold' ||
    value === 'petroleum-clay' ||
    value === 'paper-light' ||
    value === 'void-cut'
  ) {
    return value;
  }
  return DEFAULT_THEME_ID;
}

function normalizeSettings(value: Partial<AppSettings> | undefined): AppSettings {
  const comfyuiUrl = normalizeComfyUIUrl(value?.comfyuiUrl);
  const explicitMode = normalizeComfyUIMode(value?.comfyuiMode);
  const themeId = normalizeThemeId(value?.themeId);
  const projectDir = typeof value?.projectDir === 'string' && value.projectDir.trim().length > 0
    ? value.projectDir
    : undefined;

  // Backward compatibility:
  // - Missing mode + empty URL => inherit
  // - Missing mode + legacy localhost default => inherit
  // - Missing mode + non-empty URL => custom
  const derivedMode: ComfyUIMode = explicitMode ?? (
    !comfyuiUrl || comfyuiUrl === LEGACY_LOCAL_COMFYUI_URL ? 'inherit' : 'custom'
  );

  const normalizedMode: ComfyUIMode = derivedMode === 'custom' && !comfyuiUrl
    ? 'inherit'
    : derivedMode;

  const normalized: AppSettings = {
    comfyuiMode: normalizedMode,
    comfyuiUrl: normalizedMode === 'custom' ? comfyuiUrl : '',
    comfyuiTimeout: FIXED_COMFYUI_TIMEOUT_SECONDS,
    themeId,
  };

  if (projectDir) {
    normalized.projectDir = projectDir;
  }

  return normalized;
}

export const getSettings = (): AppSettings => {
  const normalized = normalizeSettings(store.store as Partial<AppSettings>);
  store.set(normalized);
  return normalized;
};

export const updateSettings = (patch: Partial<AppSettings>): AppSettings => {
  const current = store.store as Partial<AppSettings>;
  const merged = {
    ...current,
    ...patch,
  };
  const normalized = normalizeSettings(merged);
  store.set(normalized);
  return normalized;
};

export { normalizeSettings, normalizeThemeId, DEFAULT_THEME_ID };

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
