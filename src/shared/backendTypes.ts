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
  llmProvider?: 'gemini' | 'lmstudio' | 'openai' | 'openrouter';
  googleApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  projectDir?: string;
  contextDir?: string; // User workspace context directory (defaults to app.getPath('userData')/context)
}
