import { useEffect, useCallback } from 'react';
import type { AppSettings } from '../../shared/settingsTypes';
import { useWorkspace } from '../contexts/WorkspaceContext';

function applyBackendState(
  status: string | undefined,
  setConnectionStatus: ReturnType<typeof useWorkspace>['setConnectionStatus'],
) {
  if (status === 'ready') {
    setConnectionStatus('server', 'connected');
    return;
  }

  if (status === 'connecting' || status === 'starting') {
    setConnectionStatus('server', 'connecting');
    return;
  }

  setConnectionStatus('server', 'disconnected');
}

export function useBackendHealth(settings: AppSettings | null) {
  const { setConnectionStatus } = useWorkspace();

  const checkHealth = useCallback(async () => {
    if (!settings) return;

    try {
      const backendState = await window.electron.backend.getState();
      applyBackendState(backendState.status, setConnectionStatus);
    } catch (error) {
      console.error('Health check failed:', error);
      setConnectionStatus('server', 'disconnected');
    }
  }, [settings, setConnectionStatus]);

  useEffect(() => {
    if (!settings) return;

    checkHealth();
    return window.electron.backend.onStateChange((backendState) => {
      applyBackendState(backendState.status, setConnectionStatus);
    });
  }, [settings, checkHealth]);
}

export { applyBackendState };
