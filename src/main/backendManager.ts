import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { ChildProcess, spawn } from 'child_process';
import log from 'electron-log';
import { app } from 'electron';
import {
  BackendEnvOverrides,
  BackendState,
  BackendStatus,
} from '../shared/backendTypes';

const DEFAULT_PORT = 8001;
const HEALTH_ENDPOINT = '/health';

function comfyWsUrl(httpUrl: string): string {
  try {
    const parsed = new URL(httpUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/ws';
    }
    return parsed.toString();
  } catch (error) {
    log.warn(
      `Failed to parse ComfyUI URL "${httpUrl}": ${(error as Error).message}`,
    );
    return 'ws://localhost:8000/ws';
  }
}

function executableName(): string {
  return process.platform === 'win32' ? 'kshana-backend.exe' : 'kshana-backend';
}

function resolveExecutablePath(): string | null {
  const binaryName = executableName();
  if (app.isPackaged) {
    const packagedPath = path.join(
      process.resourcesPath,
      'backend',
      binaryName,
    );
    return packagedPath;
  }

  const platformFolder =
    process.platform === 'darwin'
      ? 'kshana-backend-mac'
      : process.platform === 'win32'
        ? 'kshana-backend-win'
        : 'kshana-backend-linux';
  const devPath = path.join(
    __dirname,
    '../../backend-build/dist',
    platformFolder,
    binaryName,
  );
  return devPath;
}

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(start: number): Promise<number> {
  const maxTries = 25;
  for (let i = 0; i < maxTries; i += 1) {
    const port = start + i;
    // eslint-disable-next-line no-await-in-loop
    if (await portIsFree(port)) {
      return port;
    }
  }
  throw new Error('Unable to find an available port for backend server.');
}

async function waitForHealth(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let lastError: Error | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        log.info(`Health check passed for ${url}`);
        return;
      }
      lastError = new Error(`Health check returned status ${response.status}`);
    } catch (err) {
      lastError = err as Error;
      // intentional no-op; we'll retry until timeout
    }

    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      log.error(
        `Health check timed out after ${elapsed}ms. Last error: ${lastError?.message}`,
      );
      throw new Error(
        `Backend health check timed out after ${timeoutMs}ms: ${lastError?.message || 'Connection refused'}`,
      );
    }

    // Log progress every 10 seconds
    if (elapsed % 10_000 < 1000) {
      log.info(
        `Waiting for backend health check... (${Math.round(elapsed / 1000)}s)`,
      );
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

class BackendManager extends EventEmitter {
  private child?: ChildProcess;

  private state: BackendState = { status: 'idle', port: DEFAULT_PORT };

  private port: number = DEFAULT_PORT;

  get currentPort(): number {
    return this.port;
  }

  get status(): BackendState {
    return this.state;
  }

  private updateState(next: BackendState) {
    this.state = {
      port: this.port,
      ...next,
    };
    this.emit('state', this.state);
  }

  async start(overrides: BackendEnvOverrides = {}): Promise<number> {
    if (this.child) {
      log.info('Backend already running');
      return this.port;
    }

    const binaryPath = resolveExecutablePath();
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      throw new Error(
        `Backend executable not found at ${binaryPath}. Run backend-build/build.py first.`,
      );
    }

    this.port = overrides.port ?? (await findAvailablePort(DEFAULT_PORT));
    this.updateState({ status: 'starting' });

    const comfyHttp = overrides.comfyuiUrl ?? 'http://localhost:8000';
    const comfyWs = comfyWsUrl(comfyHttp);

    const env = {
      ...process.env,
      KSHANA_HOST: '127.0.0.1',
      KSHANA_PUBLIC_HOST: '127.0.0.1',
      KSHANA_PORT: String(this.port),
      COMFYUI_BASE_URL: comfyHttp,
      COMFYUI_WS_URL: comfyWs,
      LMSTUDIO_BASE_URL: overrides.lmStudioUrl ?? 'http://127.0.0.1:1234',
      LMSTUDIO_MODEL: overrides.lmStudioModel ?? 'qwen3',
      LLM_PROVIDER: overrides.llmProvider ?? 'lmstudio',
      GOOGLE_API_KEY: overrides.googleApiKey ?? '',
      KSHANA_PROJECT_DIR: overrides.projectDir ?? '',
      KSHANA_NO_RELOAD: '1',
    };

    log.info(
      `Starting backend on port ${this.port} with KSHANA_PORT=${env.KSHANA_PORT}`,
    );

    this.child = spawn(binaryPath, [], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      log.info(`[kshana-backend] ${output}`);
      // Check if backend is ready by looking for Uvicorn startup message
      if (
        output.includes('Uvicorn running on') ||
        output.includes('Application startup complete')
      ) {
        log.info('Backend startup detected in logs');
      }
    });
    this.child.stderr?.on('data', (data: Buffer) => {
      log.error(`[kshana-backend] ${data.toString()}`);
    });

    this.child.on('error', (error) => {
      log.error(`Kshana backend process error: ${error.message}`);
      this.updateState({ status: 'error', message: error.message });
    });

    this.child.on('exit', (code, signal) => {
      log.warn(`Kshana backend exited (code=${code}) signal=${signal}`);
      this.child = undefined;
      this.updateState({ status: 'stopped' });
    });

    try {
      const healthUrl = `http://127.0.0.1:${this.port}${HEALTH_ENDPOINT}`;
      await waitForHealth(healthUrl);
      this.updateState({ status: 'ready' });
      log.info(`Kshana backend ready on ${healthUrl}`);
    } catch (error) {
      this.updateState({ status: 'error', message: (error as Error).message });
      throw error;
    }

    return this.port;
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }

    const proc = this.child;
    this.child = undefined;
    this.updateState({ status: 'stopped' });

    const waitForExit = new Promise<void>((resolve) => {
      proc.once('exit', () => resolve());
    });

    if (process.platform === 'win32') {
      proc.kill();
    } else {
      proc.kill('SIGTERM');
    }

    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 4000);

    await waitForExit;
  }

  async restart(overrides: BackendEnvOverrides = {}): Promise<number> {
    await this.stop();
    return this.start(overrides);
  }
}

const backendManager = new BackendManager();

export default backendManager;
export type {
  BackendEnvOverrides,
  BackendState,
  BackendStatus,
} from '../shared/backendTypes';
