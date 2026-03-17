import type { BackendState } from '../../../../shared/backendTypes';

export function getDisconnectBannerMessage(state?: BackendState | null): string {
  if (state?.status === 'ready') {
    return 'Chat connection interrupted. Attempting to reconnect...';
  }

  return 'Connection to backend lost. Attempting to reconnect...';
}
