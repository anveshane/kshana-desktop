export type LlmProvider = 'gemini' | 'lmstudio' | 'openai' | 'openrouter';

export interface AppFeatureFlags {
  /** Enables side-by-side rich editor beta shell and vendored panels. */
  rich_editor_beta: boolean;
}

export interface AppSettings {
  /** URL of the kshana-ink server (default: http://localhost:8001) */
  serverUrl: string;
  comfyuiUrl: string;
  /** Video generation timeout in seconds (default: 1800 = 30 min). LTX-2 is compute-intensive. */
  comfyuiTimeout?: number;
  lmStudioUrl: string;
  lmStudioModel: string;
  llmProvider: LlmProvider;
  googleApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
  feature: AppFeatureFlags;
  projectDir?: string;
}
