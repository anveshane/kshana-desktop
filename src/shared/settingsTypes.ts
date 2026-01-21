export type LlmProvider = 'gemini' | 'lmstudio' | 'openrouter';

export interface AppSettings {
  comfyuiUrl: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  llmProvider: LlmProvider;
  googleApiKey: string;
  geminiModel: string;
  openRouterApiKey: string;
  openRouterModel: string;
  projectDir?: string;
  preferredPort?: number;
}
