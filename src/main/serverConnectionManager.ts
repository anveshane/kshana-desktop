import { EventEmitter } from 'events';
import log from 'electron-log';
import type { BackendState, ServerConnectionConfig } from '../shared/backendTypes';

const DEFAULT_SERVER_URL = 'http://localhost:8001';
const HEALTH_ENDPOINT = '/api/v1/health';
const HEALTH_POLL_INTERVAL_MS = 3_000;

class ServerConnectionManager extends EventEmitter {
  private serverUrl: string = DEFAULT_SERVER_URL;

  private state: BackendState = { status: 'idle' };

  private healthTimer: ReturnType<typeof setTimeout> | null = null;

  private autoReconnect = true;

  get status(): BackendState {
    return this.state;
  }

  get currentServerUrl(): string {
    return this.serverUrl;
  }

  private updateState(next: BackendState) {
    this.state = next;
    this.emit('state', this.state);
  }

  /**
   * Connect to an external kshana-ink server.
   * Polls until the server becomes ready, then stops polling.
   */
  async connect(config: ServerConnectionConfig = { serverUrl: DEFAULT_SERVER_URL }): Promise<BackendState> {
    this.serverUrl = config.serverUrl || DEFAULT_SERVER_URL;
    this.autoReconnect = config.autoReconnect !== false;
    this.stopHealthPolling();

    // Derive port from URL for backward compat
    let port: number | undefined;
    try {
      port = parseInt(new URL(this.serverUrl).port, 10) || undefined;
    } catch {
      // ignore
    }

    this.updateState({ status: 'connecting', serverUrl: this.serverUrl, port });
    log.info(`Connecting to kshana-ink server at ${this.serverUrl}`);

    const healthy = await this.checkHealth();
    if (healthy) {
      this.updateState({ status: 'ready', serverUrl: this.serverUrl, port });
      log.info(`Connected to kshana-ink server at ${this.serverUrl}`);
      return this.state;
    }

    // Only poll while the backend is still starting. Once it reaches ready we
    // stop background checks so long-running work cannot be marked disconnected
    // by a later health timeout.
    if (this.autoReconnect) {
      this.updateState({ status: 'connecting', message: 'Waiting for server...', serverUrl: this.serverUrl, port });
      this.startHealthPolling();
    } else {
      this.updateState({ status: 'error', message: `Server not reachable at ${this.serverUrl}`, serverUrl: this.serverUrl, port });
    }

    return this.state;
  }

  /**
   * Disconnect and stop polling.
   */
  async disconnect(): Promise<BackendState> {
    this.stopHealthPolling();
    this.updateState({ status: 'stopped', serverUrl: this.serverUrl });
    log.info('Disconnected from kshana-ink server');
    return this.state;
  }

  /**
   * Reconnect (disconnect then connect with same config).
   */
  async reconnect(): Promise<BackendState> {
    await this.disconnect();
    return this.connect({ serverUrl: this.serverUrl, autoReconnect: this.autoReconnect });
  }

  /**
   * Single health check.
   */
  private async checkHealth(): Promise<boolean> {
    const url = `${this.serverUrl}${HEALTH_ENDPOINT}`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private startHealthPolling(): void {
    this.stopHealthPolling();

    const poll = async () => {
      const currentState = this.state.status;
      if (currentState !== 'connecting' && currentState !== 'starting') {
        this.stopHealthPolling();
        return;
      }

      const healthy = await this.checkHealth();
      if (healthy) {
        let port: number | undefined;
        try {
          port = parseInt(new URL(this.serverUrl).port, 10) || undefined;
        } catch {
          // ignore
        }

        this.updateState({ status: 'ready', serverUrl: this.serverUrl, port });
        log.info(`Connected to kshana-ink server at ${this.serverUrl}`);
        this.stopHealthPolling();
        return;
      }

      this.healthTimer = setTimeout(() => {
        this.healthTimer = null;
        void poll();
      }, HEALTH_POLL_INTERVAL_MS);
    };

    this.healthTimer = setTimeout(() => {
      this.healthTimer = null;
      void poll();
    }, HEALTH_POLL_INTERVAL_MS);
  }

  private stopHealthPolling(): void {
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = null;
    }
  }
}

const serverConnectionManager = new ServerConnectionManager();

export default serverConnectionManager;
export type { BackendState, ServerConnectionConfig } from '../shared/backendTypes';
