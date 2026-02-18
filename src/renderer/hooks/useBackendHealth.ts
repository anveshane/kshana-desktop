import { useEffect, useCallback } from 'react';
import type { AppSettings } from '../../shared/settingsTypes';
import { useWorkspace } from '../contexts/WorkspaceContext';

const CHECK_INTERVAL = 5000;

export function useBackendHealth(settings: AppSettings | null) {
  const { setConnectionStatus } = useWorkspace();

  const checkHealth = useCallback(async () => {
    if (!settings) return;

    try {
      const backendState = await window.electron.backend.getState();

      if (backendState.status === 'ready') {
        setConnectionStatus('server', 'connected');
      } else if (
        backendState.status === 'connecting' ||
        backendState.status === 'starting'
      ) {
        setConnectionStatus('server', 'connecting');
      } else {
        setConnectionStatus('server', 'disconnected');
      }
    } catch (error) {
      console.error('Health check failed:', error);
      setConnectionStatus('server', 'disconnected');
    }
  }, [settings, setConnectionStatus]);

  useEffect(() => {
    if (!settings) return;

    checkHealth();

    const interval = setInterval(checkHealth, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [settings, checkHealth]);
}
