import type { BackendEnvOverrides } from './backendTypes';
import type { AppSettings } from './settingsTypes';

// Single source of truth for mapping saved settings to backend env overrides.
export const toBackendEnv = (settings: AppSettings): BackendEnvOverrides => ({
  port: settings.preferredPort,
  comfyuiUrl: settings.comfyuiUrl,
  lmStudioUrl: settings.lmStudioUrl,
  lmStudioModel: settings.lmStudioModel,
  llmProvider: settings.llmProvider,
  googleApiKey: settings.googleApiKey,
  geminiModel: settings.geminiModel,
  openaiApiKey: settings.openaiApiKey,
  openaiBaseUrl: settings.openaiBaseUrl,
  openaiModel: settings.openaiModel,
  openRouterApiKey: settings.openRouterApiKey,
  openRouterModel: settings.openRouterModel,
  projectDir: settings.projectDir,
});

// Alias kept for renderer/main callers that might prefer the previous name.
export const mapSettingsToEnv = toBackendEnv;

