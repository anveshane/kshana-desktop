import { EventEmitter } from 'events';
import log from 'electron-log';
import serverConnectionManager from './serverConnectionManager';
import localBackendManager from './localBackendManager';
import type {
  BackendConnectionInfo,
  BackendState,
  CloudBackendRuntimeConfig,
} from '../shared/backendTypes';
import type { AppSettings } from '../shared/settingsTypes';

function annotateState(state: BackendState, mode: AppSettings['backendMode']): BackendState {
  return {
    ...state,
    mode,
  };
}

class BackendManager extends EventEmitter {
  private state: BackendState = { status: 'idle', mode: 'local' };

  private selectedMode: AppSettings['backendMode'] = 'local';

  constructor() {
    super();

    localBackendManager.on('state', (state: BackendState) => {
      if (this.selectedMode !== state.mode) {
        return;
      }

      this.updateState(annotateState(state, this.selectedMode));
    });

    serverConnectionManager.on('state', (state: BackendState) => {
      if (this.selectedMode !== 'cloud') {
        return;
      }

      this.updateState(annotateState(state, 'cloud'));
    });
  }

  get status(): BackendState {
    return this.state;
  }

  private updateState(next: BackendState) {
    this.state = next;
    this.emit('state', this.state);
  }

  async start(
    settings: AppSettings,
    cloudRuntime?: CloudBackendRuntimeConfig,
  ): Promise<BackendState> {
    this.selectedMode = settings.backendMode;

    if (settings.backendMode === 'local') {
      await serverConnectionManager.disconnect();
      const state =
        localBackendManager.status?.mode === 'cloud'
          ? await localBackendManager.restart(settings)
          : await localBackendManager.start(settings);
      const nextState = annotateState(state, 'local');
      this.updateState(nextState);
      return nextState;
    }

    await serverConnectionManager.disconnect();
    if (!cloudRuntime?.proxyBaseUrl || !cloudRuntime.desktopToken) {
      const nextState: BackendState = {
        status: 'error',
        mode: 'cloud',
        message: 'Kshana Cloud proxy URL and desktop token are required for cloud mode.',
      };
      this.updateState(nextState);
      return nextState;
    }

    const state =
      localBackendManager.status?.mode === 'local'
        ? await localBackendManager.restart(settings, cloudRuntime)
        : await localBackendManager.start(settings, cloudRuntime);
    const nextState = annotateState(state, 'cloud');
    this.updateState(nextState);
    return nextState;
  }

  async restart(
    settings: AppSettings,
    cloudRuntime?: CloudBackendRuntimeConfig,
  ): Promise<BackendState> {
    if (settings.backendMode === 'local') {
      await serverConnectionManager.disconnect();
      this.selectedMode = 'local';
      const state = await localBackendManager.restart(settings);
      const nextState = annotateState(state, 'local');
      this.updateState(nextState);
      return nextState;
    }

    this.selectedMode = 'cloud';
    await serverConnectionManager.disconnect();
    if (!cloudRuntime?.proxyBaseUrl || !cloudRuntime.desktopToken) {
      const nextState: BackendState = {
        status: 'error',
        mode: 'cloud',
        message: 'Kshana Cloud proxy URL and desktop token are required for cloud mode.',
      };
      this.updateState(nextState);
      return nextState;
    }

    const state = await localBackendManager.restart(settings, cloudRuntime);
    const nextState = annotateState(state, 'cloud');
    this.updateState(nextState);
    return nextState;
  }

  async stop(): Promise<BackendState> {
    if (this.selectedMode === 'local' || this.selectedMode === 'cloud') {
      await serverConnectionManager.disconnect();
      const state = await localBackendManager.stop();
      const nextState = annotateState(state, this.selectedMode);
      this.updateState(nextState);
      return nextState;
    }

    const state = await serverConnectionManager.disconnect();
    const nextState = annotateState(state, 'cloud');
    this.updateState(nextState);
    return nextState;
  }

  async getConnectionInfo(
    settings: AppSettings,
    cloudRuntime?: CloudBackendRuntimeConfig,
  ): Promise<BackendConnectionInfo> {
    const selectedMode = settings.backendMode;
    const bundledVersion = await localBackendManager.getBundledVersionInfo();
    const localServerUrl =
      localBackendManager.currentServerUrl || (
        selectedMode === 'local' || selectedMode === 'cloud' ? this.state.serverUrl : undefined
      );
    const effectiveServerUrl = selectedMode === 'cloud'
      ? localServerUrl || this.state.serverUrl
      : localServerUrl || this.state.serverUrl;
    const localBackendAvailable = await localBackendManager.isAvailable();

    return {
      selectedMode,
      effectiveServerUrl,
      cloudServerUrl: cloudRuntime?.websiteUrl,
      cloudWebsiteUrl: cloudRuntime?.websiteUrl,
      proxyBaseUrl: cloudRuntime?.proxyBaseUrl,
      legacyCoreUrl: cloudRuntime?.legacyCoreUrl,
      localServerUrl,
      localBackendAvailable,
      bundledVersion,
      note:
        selectedMode === 'cloud'
          ? 'Kshana Cloud credits run through the authenticated proxy while the bundled core runs locally.'
          : undefined,
    };
  }
}

const backendManager = new BackendManager();

backendManager.on('error', (error) => {
  log.error('[BackendManager] Unhandled error event', error);
});

export default backendManager;
