import { EventEmitter } from 'events';
import log from 'electron-log';
import localBackendManager from './localBackendManager';
import type {
  BackendConnectionInfo,
  BackendState,
} from '../shared/backendTypes';
import type { AppSettings } from '../shared/settingsTypes';

class BackendManager extends EventEmitter {
  private state: BackendState = { status: 'idle' };

  constructor() {
    super();

    localBackendManager.on('state', (state: BackendState) => {
      this.updateState(state);
    });
  }

  get status(): BackendState {
    return this.state;
  }

  private updateState(next: BackendState) {
    this.state = next;
    this.emit('state', this.state);
  }

  async start(settings: AppSettings): Promise<BackendState> {
    const state = await localBackendManager.start(settings);
    this.updateState(state);
    return state;
  }

  async restart(settings: AppSettings): Promise<BackendState> {
    const state = await localBackendManager.restart(settings);
    this.updateState(state);
    return state;
  }

  async stop(): Promise<BackendState> {
    const state = await localBackendManager.stop();
    this.updateState(state);
    return state;
  }

  async getConnectionInfo(
    _settings: AppSettings,
  ): Promise<BackendConnectionInfo> {
    const bundledVersion = await localBackendManager.getBundledVersionInfo();
    const localServerUrl =
      localBackendManager.currentServerUrl || this.state.serverUrl;
    const localBackendAvailable = await localBackendManager.isAvailable();

    return {
      effectiveServerUrl: localServerUrl,
      localServerUrl,
      localBackendAvailable,
      bundledVersion,
    };
  }
}

const backendManager = new BackendManager();

backendManager.on('error', (error) => {
  log.error('[BackendManager] Unhandled error event', error);
});

export default backendManager;
