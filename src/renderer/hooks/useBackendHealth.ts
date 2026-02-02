import { useEffect, useCallback } from 'react';
import type { ConnectionStatus } from '../types/workspace';
import type { AppSettings } from '../../shared/settingsTypes';
import { useWorkspace } from '../contexts/WorkspaceContext';

const CHECK_INTERVAL = 5000; // Check every 5 seconds
const COMFYUI_CHECK_TIMEOUT = 3000; // 3 second timeout for ComfyUI check

async function checkComfyUIHealth(comfyuiUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      COMFYUI_CHECK_TIMEOUT,
    );

    const response = await fetch(`${comfyuiUrl}/system_stats`, {
      signal: controller.signal,
      method: 'GET',
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkLLMProviderHealth(
  llmProvider: 'gemini' | 'lmstudio' | 'openai' | 'openrouter',
  lmStudioUrl?: string,
): Promise<boolean> {
  if (
    llmProvider === 'gemini' ||
    llmProvider === 'openai' ||
    llmProvider === 'openrouter'
  ) {
    // For cloud providers (Gemini, OpenAI, OpenRouter), assume connected if backend is healthy
    // The backend will handle API errors
    return true;
  }

  // For LM Studio, check if the server is accessible
  if (!lmStudioUrl) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      COMFYUI_CHECK_TIMEOUT,
    );

    // Normalize URL: remove trailing /v1 if present, then append /v1/models
    const baseUrl = lmStudioUrl.trim().replace(/\/v1\/?$/, '');
    const modelsUrl = `${baseUrl}/v1/models`;

    const response = await fetch(modelsUrl, {
      signal: controller.signal,
      method: 'GET',
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export function useBackendHealth(settings: AppSettings | null) {
  const { setConnectionStatus } = useWorkspace();

  const checkHealth = useCallback(async () => {
    if (!settings) return;

    try {
      // Get backend state to check if it's ready
      const backendState = await window.electron.backend.getState();

      if (backendState.status !== 'ready') {
        setConnectionStatus('lmStudio', 'disconnected');
        setConnectionStatus('comfyUI', 'disconnected');
        return;
      }

      // Check LLM provider health
      const llmHealthy = await checkLLMProviderHealth(
        settings.llmProvider,
        settings.lmStudioUrl,
      );

      setConnectionStatus(
        'lmStudio',
        llmHealthy ? 'connected' : 'disconnected',
      );

      // Check ComfyUI health
      const comfyuiHealthy = await checkComfyUIHealth(settings.comfyuiUrl);
      setConnectionStatus(
        'comfyUI',
        comfyuiHealthy ? 'connected' : 'disconnected',
      );
    } catch (error) {
      console.error('Health check failed:', error);
      setConnectionStatus('lmStudio', 'disconnected');
      setConnectionStatus('comfyUI', 'disconnected');
    }
  }, [settings, setConnectionStatus]);

  useEffect(() => {
    if (!settings) return;

    // Initial check
    checkHealth();

    // Set up periodic health checks
    const interval = setInterval(checkHealth, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [settings, checkHealth]);
}
