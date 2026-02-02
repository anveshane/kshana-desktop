export type LlmProvider = 'gemini' | 'lmstudio' | 'openai' | 'openrouter';

export interface AppSettings {
  comfyuiUrl: string;
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
