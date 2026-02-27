import type { ServerConnectionConfig } from './backendTypes';
import type { AppSettings } from './settingsTypes';

/**
 * Build server connection config from a concrete backend URL.
 */
const toServerConfig = (
  _settings: AppSettings,
  serverUrl: string,
): ServerConnectionConfig => ({
  serverUrl: serverUrl || 'http://localhost:8001',
});

export default toServerConfig;
