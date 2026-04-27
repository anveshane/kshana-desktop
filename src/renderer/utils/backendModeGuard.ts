import type { BackendState } from '../../shared/backendTypes';
import type { AppSettings } from '../../shared/settingsTypes';

function isLikelyCloudUrl(serverUrl?: string): boolean {
  if (!serverUrl) {
    return false;
  }

  try {
    const { hostname, protocol } = new URL(serverUrl);
    return (
      protocol === 'https:' ||
      (hostname !== 'localhost' &&
        hostname !== '127.0.0.1' &&
        hostname !== '::1')
    );
  } catch {
    return false;
  }
}

function shouldRestartForSettings(
  backendState: BackendState,
  settings: AppSettings | null,
): boolean {
  if (!settings?.backendMode) {
    return false;
  }

  if (backendState.mode && backendState.mode !== settings.backendMode) {
    return true;
  }

  return (
    settings.backendMode === 'local' &&
    isLikelyCloudUrl(backendState.serverUrl)
  );
}

export async function getBackendStateForSettings(
  settings: AppSettings | null,
): Promise<BackendState> {
  const backendState = await window.electron.backend.getState();

  if (!shouldRestartForSettings(backendState, settings)) {
    return backendState;
  }

  return window.electron.backend.restart();
}
