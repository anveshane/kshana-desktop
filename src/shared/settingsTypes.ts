export type LlmProvider = 'gemini' | 'lmstudio' | 'openai' | 'openrouter';

export interface AppSettings {
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
  projectDir?: string;
  preferredPort?: number;
}
