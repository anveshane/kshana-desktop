export type BackendStatus = 'idle' | 'starting' | 'ready' | 'error' | 'stopped';

export interface BackendState {
  status: BackendStatus;
  message?: string;
  port?: number;
}

export interface BackendEnvOverrides {
  port?: number;
  comfyuiUrl?: string;
  lmStudioUrl?: string;
  lmStudioModel?: string;
  llmProvider?: 'gemini' | 'lmstudio';
  googleApiKey?: string;
  projectDir?: string;
  contextDir?: string; // User workspace context directory (defaults to app.getPath('userData')/context)
}
