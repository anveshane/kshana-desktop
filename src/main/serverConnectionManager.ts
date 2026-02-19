import { EventEmitter } from 'events';
import log from 'electron-log';
import type { BackendState, ServerConnectionConfig } from '../shared/backendTypes';

const DEFAULT_SERVER_URL = 'http://localhost:8001';
const HEALTH_ENDPOINT = '/api/v1/health';
const HEALTH_POLL_INTERVAL_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

class ServerConnectionManager extends EventEmitter {
  private serverUrl: string = DEFAULT_SERVER_URL;

  private state: BackendState = { status: 'idle' };

  private healthTimer: ReturnType<typeof setInterval> | null = null;

  private reconnectAttempts = 0;

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
   * Polls the health endpoint until the server responds.
   */
  async connect(config: ServerConnectionConfig = { serverUrl: DEFAULT_SERVER_URL }): Promise<BackendState> {
    this.serverUrl = config.serverUrl || DEFAULT_SERVER_URL;
    this.autoReconnect = config.autoReconnect !== false;
    this.reconnectAttempts = 0;

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
      this.reconnectAttempts = 0;
      this.updateState({ status: 'ready', serverUrl: this.serverUrl, port });
      log.info(`Connected to kshana-ink server at ${this.serverUrl}`);
      this.startHealthPolling();
      return this.state;
    }

    // Server not reachable yet — keep polling if autoReconnect
    if (this.autoReconnect) {
      this.startHealthPolling();
      this.updateState({ status: 'connecting', message: 'Waiting for server...', serverUrl: this.serverUrl, port });
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

  /**
   * Background health polling with exponential backoff on failure.
   */
  private startHealthPolling() {
    this.stopHealthPolling();

    const poll = async () => {
      const healthy = await this.checkHealth();
      const wasConnected = this.state.status === 'ready';

      if (healthy) {
        this.reconnectAttempts = 0;
        if (this.state.status !== 'ready') {
          let port: number | undefined;
          try {
            port = parseInt(new URL(this.serverUrl).port, 10) || undefined;
          } catch {
            // ignore
          }
          this.updateState({ status: 'ready', serverUrl: this.serverUrl, port });
          log.info(`Connected to kshana-ink server at ${this.serverUrl}`);
        }
      } else if (wasConnected) {
        // Lost connection
        this.reconnectAttempts += 1;
        this.updateState({
          status: 'disconnected',
          message: `Lost connection to server (attempt ${this.reconnectAttempts})`,
          serverUrl: this.serverUrl,
        });
        log.warn(`Lost connection to kshana-ink server at ${this.serverUrl}`);
      } else {
        // Still trying to connect
        this.reconnectAttempts += 1;
      }

      // Schedule next poll with backoff on failures
      const delay = healthy
        ? HEALTH_POLL_INTERVAL_MS
        : Math.min(
            HEALTH_POLL_INTERVAL_MS * Math.pow(1.5, this.reconnectAttempts),
            MAX_RECONNECT_DELAY_MS,
          );

      this.healthTimer = setTimeout(poll, delay);
    };

    this.healthTimer = setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
  }

  private stopHealthPolling() {
    if (this.healthTimer) {
      clearTimeout(this.healthTimer);
      this.healthTimer = null;
    }
  }
}

const serverConnectionManager = new ServerConnectionManager();

export default serverConnectionManager;
export type { BackendState, ServerConnectionConfig } from '../shared/backendTypes';
