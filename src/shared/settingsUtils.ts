import type { ServerConnectionConfig } from './backendTypes';
import type { AppSettings } from './settingsTypes';

/**
 * Extract server connection config from app settings.
 */
export const toServerConfig = (settings: AppSettings): ServerConnectionConfig => ({
  serverUrl: settings.serverUrl || 'http://localhost:8001',
});
