export type LlmProvider = 'gemini' | 'lmstudio';

export interface AppSettings {
  comfyuiUrl: string;
  lmStudioUrl: string;
  lmStudioModel: string;
  llmProvider: LlmProvider;
  googleApiKey: string;
  projectDir?: string;
  preferredPort?: number;
}
