import { EventEmitter } from 'events';
import log from 'electron-log';
import serverConnectionManager from './serverConnectionManager';
import localBackendManager from './localBackendManager';
import type {
  BackendConnectionInfo,
  BackendState,
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
      if (this.selectedMode !== 'local') {
        return;
      }

      this.updateState(annotateState(state, 'local'));
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
    cloudServerUrl?: string,
  ): Promise<BackendState> {
    this.selectedMode = settings.backendMode;

    if (settings.backendMode === 'local') {
      await serverConnectionManager.disconnect();
      const state = await localBackendManager.start(settings);
      const nextState = annotateState(state, 'local');
      this.updateState(nextState);
      return nextState;
    }

    await localBackendManager.stop();
    if (!cloudServerUrl) {
      const nextState: BackendState = {
        status: 'error',
        mode: 'cloud',
        message: 'Cloud backend URL is not configured for this build.',
      };
      this.updateState(nextState);
      return nextState;
    }

    await serverConnectionManager.disconnect();
    const state = await serverConnectionManager.connect({
      serverUrl: cloudServerUrl,
    });
    const nextState = annotateState(state, 'cloud');
    this.updateState(nextState);
    return nextState;
  }

  async restart(
    settings: AppSettings,
    cloudServerUrl?: string,
  ): Promise<BackendState> {
    if (settings.backendMode === 'local') {
      await serverConnectionManager.disconnect();
      this.selectedMode = 'local';
      const state = await localBackendManager.restart(settings);
      const nextState = annotateState(state, 'local');
      this.updateState(nextState);
      return nextState;
    }

    await localBackendManager.stop();
    this.selectedMode = 'cloud';
    if (!cloudServerUrl) {
      const nextState: BackendState = {
        status: 'error',
        mode: 'cloud',
        message: 'Cloud backend URL is not configured for this build.',
      };
      this.updateState(nextState);
      return nextState;
    }

    await serverConnectionManager.disconnect();
    const state = await serverConnectionManager.connect({
      serverUrl: cloudServerUrl,
    });
    const nextState = annotateState(state, 'cloud');
    this.updateState(nextState);
    return nextState;
  }

  async stop(): Promise<BackendState> {
    if (this.selectedMode === 'local') {
      const state = await localBackendManager.stop();
      const nextState = annotateState(state, 'local');
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
    cloudServerUrl?: string,
  ): Promise<BackendConnectionInfo> {
    const selectedMode = settings.backendMode;
    const bundledVersion = await localBackendManager.getBundledVersionInfo();
    const localServerUrl =
      localBackendManager.currentServerUrl || (
        selectedMode === 'local' ? this.state.serverUrl : undefined
      );
    const effectiveServerUrl = selectedMode === 'cloud'
      ? cloudServerUrl || this.state.serverUrl
      : localServerUrl || this.state.serverUrl;
    const localBackendAvailable = await localBackendManager.isAvailable();

    return {
      selectedMode,
      effectiveServerUrl,
      cloudServerUrl,
      localServerUrl,
      localBackendAvailable,
      bundledVersion,
      note:
        selectedMode === 'cloud'
          ? 'Provider and model configuration is managed by the remote cloud backend.'
          : undefined,
    };
  }
}

const backendManager = new BackendManager();

backendManager.on('error', (error) => {
  log.error('[BackendManager] Unhandled error event', error);
});

export default backendManager;
