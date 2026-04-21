import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { app } from 'electron';
import log from 'electron-log';
import type { BackendState, BundledVersionInfo } from '../shared/backendTypes';
import type { AppSettings } from '../shared/settingsTypes';

const HEALTH_ENDPOINT = '/api/v1/health';
const DEFAULT_COMFYUI_URL = 'http://localhost:8000';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const COMFY_CLOUD_HOST = 'cloud.comfy.org';

async function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(0));
    server.once('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.listen(0, '127.0.0.1');
  });
}

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
        cache: 'no-store',
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for local backend health at ${url}`);
}

function normalizePathValue(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getComfyUiUrl(settings: AppSettings): string {
  if (settings.comfyuiMode === 'custom' && settings.comfyuiUrl.trim()) {
    return settings.comfyuiUrl.trim();
  }

  if (settings.comfyuiUrl.trim()) {
    return settings.comfyuiUrl.trim();
  }

  return DEFAULT_COMFYUI_URL;
}

function isComfyCloudUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === COMFY_CLOUD_HOST;
  } catch {
    return false;
  }
}

function withV1Suffix(url: string): string {
  return /\/v1\/?$/.test(url) ? url : `${url.replace(/\/$/, '')}/v1`;
}

export function buildLocalBackendEnv(settings: AppSettings, port: number): NodeJS.ProcessEnv {
  const comfyUiUrl = getComfyUiUrl(settings);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KSHANA_HOST: '127.0.0.1',
    KSHANA_PUBLIC_HOST: '127.0.0.1',
    KSHANA_PORT: String(port),
    COMFYUI_BASE_URL: comfyUiUrl,
  };

  if (isComfyCloudUrl(comfyUiUrl) && settings.comfyCloudApiKey.trim()) {
    env['COMFY_CLOUD_API_KEY'] = settings.comfyCloudApiKey.trim();
  } else {
    delete env['COMFY_CLOUD_API_KEY'];
  }

  const projectDir = normalizePathValue(settings.projectDir);
  if (projectDir) {
    env['KSHANA_PROJECT_DIR'] = projectDir;
  }

  // The desktop dev process runs with ts-node preload flags in NODE_OPTIONS.
  // Those should not leak into the bundled backend child process.
  delete env['NODE_OPTIONS'];
  delete env['TS_NODE_PROJECT'];
  delete env['TS_NODE_TRANSPILE_ONLY'];
  delete env['TS_NODE_COMPILER_OPTIONS'];

  switch (settings.llmProvider) {
    case 'gemini':
      env['LLM_PROVIDER'] = 'gemini';
      env['GOOGLE_API_KEY'] = settings.googleApiKey.trim();
      env['GEMINI_MODEL'] = settings.geminiModel.trim() || 'gemini-2.5-flash';
      break;
    case 'openai':
      env['LLM_PROVIDER'] = 'openai';
      env['OPENAI_API_KEY'] = settings.openaiApiKey.trim();
      env['OPENAI_BASE_URL'] =
        settings.openaiBaseUrl.trim() || 'https://api.openai.com/v1';
      env['OPENAI_MODEL'] = settings.openaiModel.trim() || 'gpt-4o';
      break;
    case 'openrouter':
      env['LLM_PROVIDER'] = 'openrouter';
      env['OPENROUTER_API_KEY'] = settings.openRouterApiKey.trim();
      env['OPENROUTER_BASE_URL'] = DEFAULT_OPENROUTER_BASE_URL;
      env['OPENROUTER_MODEL'] =
        settings.openRouterModel.trim() || 'z-ai/glm-4.7-flash';
      break;
    case 'lmstudio':
    default:
      env['LLM_PROVIDER'] = 'lmstudio';
      env['LMSTUDIO_BASE_URL'] = withV1Suffix(
        settings.lmStudioUrl.trim() || 'http://127.0.0.1:1234',
      );
      env['LMSTUDIO_MODEL'] = settings.lmStudioModel.trim() || 'qwen3';
      break;
  }

  if (app.isPackaged) {
    env['NODE_ENV'] = 'production';
    env['ELECTRON_RUN_AS_NODE'] = '1';
  }

  return env;
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function tryExecGitCommand(repoPath: string, command: string): string | undefined {
  try {
    const value = execSync(command, {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

class LocalBackendManager extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;

  private state: BackendState = { status: 'idle', mode: 'local' };

  private port = 0;

  private stopping = false;

  get status(): BackendState {
    return this.state;
  }

  get currentServerUrl(): string | undefined {
    return this.state.serverUrl;
  }

  private updateState(next: BackendState) {
    this.state = { ...next, mode: 'local' };
    this.emit('state', this.state);
  }

  private getDevRepoPath(): string {
    return path.resolve(__dirname, '../../../kshana-core');
  }

  private getVersionMetadataCandidates(): string[] {
    const packagedAppPath = app.getAppPath();
    const devRepoPath = this.getDevRepoPath();

    return app.isPackaged
      ? [path.join(packagedAppPath, '.kshana-core-version.json')]
      : [path.join(devRepoPath, 'package.json')];
  }

  private getEntryPathCandidates(): string[] {
    const devRepoPath = this.getDevRepoPath();
    const packagedUnpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'kshana-core',
      'dist',
      'server',
      'cli.cjs',
    );

    return app.isPackaged
      ? [packagedUnpackedPath]
      : [
          path.join(devRepoPath, 'dist', 'server', 'cli.cjs'),
        ];
  }

  resolveEntryPath(): string | undefined {
    return this.getEntryPathCandidates().find((candidate) => fs.existsSync(candidate));
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.resolveEntryPath());
  }

  async getBundledVersionInfo(): Promise<BundledVersionInfo | undefined> {
    const [primaryCandidate] = this.getVersionMetadataCandidates();
    if (!primaryCandidate) return undefined;

    if (primaryCandidate.endsWith('.json') && app.isPackaged) {
      return readJsonFile<BundledVersionInfo>(primaryCandidate);
    }

    const packageJson = await readJsonFile<{ version?: string }>(primaryCandidate);
    const repoPath = this.getDevRepoPath();
    return {
      packageVersion: packageJson?.version,
      gitBranch: tryExecGitCommand(repoPath, 'git rev-parse --abbrev-ref HEAD'),
      gitCommit: tryExecGitCommand(repoPath, 'git rev-parse HEAD'),
      commitDate: tryExecGitCommand(repoPath, 'git log -1 --format=%cI'),
    };
  }

  async start(settings: AppSettings): Promise<BackendState> {
    if (this.child) {
      return this.status;
    }

    const entryPath = this.resolveEntryPath();
    if (!entryPath) {
      const devHint = app.isPackaged
        ? 'Bundled kshana-core runtime is missing from the packaged app.'
        : 'Build ../kshana-core so dist/server/cli.cjs exists before starting the desktop app.';
      const errorMessage = `Local backend entry not found. ${devHint}`;
      this.updateState({ status: 'error', message: errorMessage });
      throw new Error(errorMessage);
    }

    this.port = await allocateLoopbackPort();
    if (!this.port) {
      const errorMessage = 'Could not allocate a local loopback port for the bundled backend.';
      this.updateState({ status: 'error', message: errorMessage });
      throw new Error(errorMessage);
    }
    const serverUrl = `http://127.0.0.1:${this.port}`;
    const healthUrl = `${serverUrl}${HEALTH_ENDPOINT}`;
    const env = buildLocalBackendEnv(settings, this.port);

    this.updateState({
      status: 'starting',
      port: this.port,
      serverUrl,
      message: 'Starting bundled local backend…',
    });

    this.stopping = false;
    log.info(`[LocalBackend] Starting ${entryPath} on ${serverUrl}`);

    const runtimeExecutable = app.isPackaged
      ? process.execPath
      : process.env['npm_node_execpath'] || process.env['NODE'] || 'node';
    const child = spawn(
      runtimeExecutable,
      [entryPath, '--host', '127.0.0.1', '--port', String(this.port), '--mode', 'local'],
      {
        env,
        cwd: path.resolve(path.dirname(entryPath), '../..'),
        stdio: 'pipe',
      },
    );

    this.child = child;

    child.stdout.on('data', (data) => {
      log.info(`[kshana-core] ${data.toString().trimEnd()}`);
    });
    child.stderr.on('data', (data) => {
      log.error(`[kshana-core] ${data.toString().trimEnd()}`);
    });
    child.on('error', (error) => {
      log.error(`[LocalBackend] Process error: ${error.message}`);
      this.updateState({
        status: 'error',
        port: this.port,
        serverUrl,
        message: error.message,
      });
    });
    child.on('exit', (code, signal) => {
      this.child = undefined;
      const baseState: BackendState = {
        status: this.stopping ? 'stopped' : 'error',
        port: this.port,
        serverUrl,
      };

      if (!this.stopping) {
        baseState.message = `Bundled local backend exited (code=${code}, signal=${signal})`;
        log.warn(`[LocalBackend] Process exited unexpectedly code=${code} signal=${signal}`);
      } else {
        log.info('[LocalBackend] Process stopped');
      }

      this.updateState(baseState);
    });

    try {
      await waitForHealth(healthUrl);
      this.updateState({
        status: 'ready',
        port: this.port,
        serverUrl,
      });
      return this.status;
    } catch (error) {
      await this.stop();
      const message =
        error instanceof Error ? error.message : 'Failed to start bundled local backend';
      this.updateState({
        status: 'error',
        port: this.port,
        serverUrl,
        message,
      });
      throw error;
    }
  }

  async stop(): Promise<BackendState> {
    if (!this.child) {
      this.updateState({
        status: 'stopped',
        port: this.port,
        serverUrl: this.currentServerUrl,
      });
      return this.status;
    }

    this.stopping = true;
    const child = this.child;

    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    });

    if (process.platform === 'win32') {
      child.kill();
    } else {
      child.kill('SIGTERM');
    }

    const killTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 4_000);

    await exited.finally(() => clearTimeout(killTimer));

    this.stopping = false;
    return this.status;
  }

  async restart(settings: AppSettings): Promise<BackendState> {
    await this.stop();
    return this.start(settings);
  }
}

const localBackendManager = new LocalBackendManager();

export default localBackendManager;
