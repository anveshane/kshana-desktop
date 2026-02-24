import type { AppSettings } from '../../shared/settingsTypes';

export const RICH_EDITOR_BETA_STORAGE_KEY = 'feature.rich_editor_beta';

export function readRichEditorBetaFromStorage(): boolean | null {
  try {
    const value = window.localStorage.getItem(RICH_EDITOR_BETA_STORAGE_KEY);
    if (value === null) {
      return null;
    }
    return value === 'true';
  } catch {
    return null;
  }
}

export function writeRichEditorBetaToStorage(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      RICH_EDITOR_BETA_STORAGE_KEY,
      enabled ? 'true' : 'false',
    );
  } catch {
    // Ignore localStorage failures in restricted environments.
  }
}

export function isRichEditorBetaEnabled(
  settings: AppSettings | null,
): boolean {
  if (settings?.feature?.rich_editor_beta !== undefined) {
    return Boolean(settings.feature.rich_editor_beta);
  }

  const fromStorage = readRichEditorBetaFromStorage();
  return fromStorage ?? false;
}
