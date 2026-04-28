/* eslint-disable compat/compat */
import type { BackendState } from '../../shared/backendTypes';
import type { AppSettings } from '../../shared/settingsTypes';

function normalizeUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function configuredCloudState(
  backendState: BackendState,
  configuredCloudUrl?: string,
): BackendState {
  const serverUrl = normalizeUrl(configuredCloudUrl);
  if (!serverUrl) {
    return backendState;
  }

  return {
    ...backendState,
    mode: 'cloud',
    serverUrl,
  };
}

export function isLikelyCloudUrl(serverUrl?: string): boolean {
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

export function shouldRestartForSettings(
  backendState: BackendState,
  settings: AppSettings | null,
  configuredCloudUrl?: string,
): boolean {
  if (!settings?.backendMode) {
    return false;
  }

  if (backendState.mode && backendState.mode !== settings.backendMode) {
    return true;
  }

  if (settings.backendMode === 'cloud') {
    const currentUrl = normalizeUrl(backendState.serverUrl);
    const expectedUrl = normalizeUrl(configuredCloudUrl);
    if (expectedUrl && currentUrl !== expectedUrl) {
      return true;
    }
    return false;
  }

  return (
    settings.backendMode === 'local' && isLikelyCloudUrl(backendState.serverUrl)
  );
}

export async function getBackendStateForSettings(
  settings: AppSettings | null,
): Promise<BackendState> {
  const backendState = await window.electron.backend.getState();
  const connectionInfo =
    settings?.backendMode === 'cloud'
      ? await window.electron.backend.getConnectionInfo().catch(() => null)
      : null;
  const configuredCloudUrl = connectionInfo?.cloudServerUrl;

  if (!shouldRestartForSettings(backendState, settings, configuredCloudUrl)) {
    return settings?.backendMode === 'cloud'
      ? configuredCloudState(backendState, configuredCloudUrl)
      : backendState;
  }

  const restartedState = await window.electron.backend.restart();
  return settings?.backendMode === 'cloud'
    ? configuredCloudState(restartedState, configuredCloudUrl)
    : restartedState;
}

export async function getBackendBaseUrlForSettings(
  settings: AppSettings | null,
  backendState: BackendState,
): Promise<string> {
  if (settings?.backendMode === 'cloud') {
    const connectionInfo = await window.electron.backend
      .getConnectionInfo()
      .catch(() => null);
    const cloudUrl = normalizeUrl(
      connectionInfo?.cloudServerUrl || connectionInfo?.effectiveServerUrl,
    );
    if (cloudUrl) {
      return cloudUrl;
    }
  }

  return (
    backendState.serverUrl || `http://localhost:${backendState.port ?? 8001}`
  );
}
