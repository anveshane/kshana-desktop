import { EventEmitter } from 'events';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { getRemotionInfographicsDir } from './utils/remotionPath';
import { pathToFileURL } from 'url';
import { app } from 'electron';
import log from 'electron-log';
import {
  BackendEnvOverrides,
  BackendState,
  BackendStatus,
} from '../shared/backendTypes';

const DEFAULT_PORT = 8001;
const HEALTH_ENDPOINT = '/api/v1/health';

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

/**
 * Set up environment variables for kshana-ink based on backend overrides.
 */
function setupEnvironment(overrides: BackendEnvOverrides): void {
  if (overrides.llmProvider) {
    process.env.LLM_PROVIDER = overrides.llmProvider;
  }
  if (overrides.lmStudioUrl) {
    // kshana-ink expects the /v1 suffix for LM Studio
    process.env.LMSTUDIO_BASE_URL = overrides.lmStudioUrl.endsWith('/v1')
      ? overrides.lmStudioUrl
      : `${overrides.lmStudioUrl}/v1`;
  }
  if (overrides.lmStudioModel) {
    process.env.LMSTUDIO_MODEL = overrides.lmStudioModel;
  }
  if (overrides.googleApiKey) {
    process.env.GOOGLE_API_KEY = overrides.googleApiKey;
  }
  if (overrides.geminiModel) {
    process.env.GEMINI_MODEL = overrides.geminiModel;
  }
  if (overrides.openaiApiKey) {
    process.env.OPENAI_API_KEY = overrides.openaiApiKey;
  }
  if (overrides.openaiBaseUrl) {
    process.env.OPENAI_BASE_URL = overrides.openaiBaseUrl;
  }
  if (overrides.openaiModel) {
    process.env.OPENAI_MODEL = overrides.openaiModel;
  }
  if (overrides.openRouterApiKey) {
    process.env.OPENROUTER_API_KEY = overrides.openRouterApiKey;
  }
  if (overrides.openRouterModel) {
    process.env.OPENROUTER_MODEL = overrides.openRouterModel;
  }
  if (overrides.comfyuiUrl) {
    process.env.COMFYUI_BASE_URL = overrides.comfyuiUrl;
  }
  if (overrides.projectDir) {
    process.env.KSHANA_PROJECT_DIR = overrides.projectDir;
  }
  // Set context directory to user workspace (not project directory)
  // This prevents context/index.json from being created in the project
  if (overrides.contextDir) {
    process.env.KSHANA_CONTEXT_DIR = overrides.contextDir;
  } else {
    // Default to userData/context for desktop app
    const userDataPath = app.getPath('userData');
    process.env.KSHANA_CONTEXT_DIR = path.join(userDataPath, 'context');
  }
  // Set workflows directory to kshana-desktop/workflows
  // In development: __dirname/../../workflows (points to kshana-desktop/workflows)
  // In packaged: process.resourcesPath/workflows or app.getAppPath()/workflows
  if (app.isPackaged) {
    // In production, try process.resourcesPath first, then app path
    const resourcesWorkflows = path.join(
      process.resourcesPath || '',
      'workflows',
    );
    if (fs.existsSync(resourcesWorkflows)) {
      process.env.KSHANA_WORKFLOWS_DIR = resourcesWorkflows;
    } else {
      // Fall back to app path
      const appPath = app.getAppPath();
      const appWorkflows = path.join(path.dirname(appPath), 'workflows');
      process.env.KSHANA_WORKFLOWS_DIR = appWorkflows;
    }
  } else {
    // In development, __dirname is dist/main, so ../../workflows gives us kshana-desktop/workflows
    const devWorkflows = path.join(__dirname, '../../workflows');
    process.env.KSHANA_WORKFLOWS_DIR = path.resolve(devWorkflows);
  }

  // Set remotion-infographics directory (shared with RemotionManager)
  try {
    process.env.KSHANA_REMOTION_INFographics_DIR = getRemotionInfographicsDir();
  } catch (err) {
    log.warn('remotion-infographics not found:', (err as Error).message);
  }
}

class BackendManager extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private server?: any;

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
    if (this.server) {
      log.info('Backend already running');
      return this.port;
    }

    this.port = overrides.port ?? (await findAvailablePort(DEFAULT_PORT));
    this.updateState({ status: 'starting' });

    try {
      // Set NODE_ENV to production for packaged apps to avoid dev-only dependencies like pino-pretty
      if (app.isPackaged) {
        // Use Reflect.set to avoid Terser issues with process.env.NODE_ENV assignment
        Reflect.set(process.env, 'NODE_ENV', 'production');
      }

      // Set up environment variables for kshana-ink
      setupEnvironment(overrides);

      log.info(
        `Starting kshana-ink backend on port ${this.port} with provider ${overrides.llmProvider || 'default'}`,
      );

      // Log module resolution paths for debugging
      const appPath = app.isPackaged ? app.getAppPath() : __dirname;
      log.info(`App path: ${appPath}`);
      log.info(`App is packaged: ${app.isPackaged}`);

      // In packaged apps, node_modules might be in app.asar or unpacked
      // Try to resolve the module path for diagnostics
      try {
        const Module = require('module');
        const nodeModulesPath = app.isPackaged
          ? path.join(process.resourcesPath, 'app.asar', 'node_modules')
          : path.join(appPath, '../../node_modules');
        log.info(`Node modules path: ${nodeModulesPath}`);

        // Check if kshana-ink exists
        const kshanaInkPath = path.join(nodeModulesPath, 'kshana-ink');
        const fs = require('fs');
        if (fs.existsSync(kshanaInkPath)) {
          log.info(`Found kshana-ink at: ${kshanaInkPath}`);
        } else {
          log.warn(`kshana-ink not found at: ${kshanaInkPath}`);
          // Try unpacked location
          const unpackedPath = path.join(
            process.resourcesPath,
            'app.asar.unpacked',
            'node_modules',
            'kshana-ink',
          );
          if (fs.existsSync(unpackedPath)) {
            log.info(`Found kshana-ink at unpacked location: ${unpackedPath}`);
          }
        }
      } catch (err) {
        log.warn(`Could not check module paths: ${(err as Error).message}`);
      }

      // Use dynamic import with package exports
      // kshana-ink now properly exports subpaths via package.json exports field
      const fs = require('fs');

      // Find the actual node_modules directory for proper module resolution
      let nodeModulesDir: string;
      if (app.isPackaged) {
        // In packaged app, try unpacked first (for native modules), then asar
        const unpackedKshanaInkPath = path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'kshana-ink',
        );
        const asarKshanaInkPath = path.join(
          process.resourcesPath,
          'app.asar',
          'node_modules',
          'kshana-ink',
        );

        log.info(`Checking unpacked path: ${unpackedKshanaInkPath}`);
        log.info(`Checking ASAR path: ${asarKshanaInkPath}`);
        log.info(`Unpacked exists: ${fs.existsSync(unpackedKshanaInkPath)}`);
        log.info(`ASAR exists: ${fs.existsSync(asarKshanaInkPath)}`);

        if (fs.existsSync(unpackedKshanaInkPath)) {
          nodeModulesDir = path.join(
            process.resourcesPath,
            'app.asar.unpacked',
            'node_modules',
          );
          log.info('Using unpacked node_modules directory');
        } else if (fs.existsSync(asarKshanaInkPath)) {
          nodeModulesDir = path.join(
            process.resourcesPath,
            'app.asar',
            'node_modules',
          );
          log.warn(
            'Using ASAR node_modules directory (kshana-ink should be unpacked!)',
          );
        } else {
          // Neither path exists - provide helpful error
          throw new Error(
            `kshana-ink not found in packaged app.\n` +
              `Checked unpacked: ${unpackedKshanaInkPath}\n` +
              `Checked ASAR: ${asarKshanaInkPath}\n` +
              `Please ensure kshana-ink is copied to release/app/node_modules/kshana-ink before packaging.`,
          );
        }
      } else {
        // In development, __dirname is .erb/dll, so project root is ../../
        // Go directly to the project root's node_modules
        const projectRoot = path.resolve(__dirname, '..', '..');
        const projectNodeModules = path.join(projectRoot, 'node_modules');
        const kshanaInkPath = path.join(projectNodeModules, 'kshana-ink');

        if (fs.existsSync(kshanaInkPath)) {
          nodeModulesDir = projectNodeModules;
        } else {
          // Fallback: search up the directory tree
          let searchDir = __dirname;
          nodeModulesDir = '';
          for (let i = 0; i < 5; i += 1) {
            const candidatePath = path.join(
              searchDir,
              'node_modules',
              'kshana-ink',
            );
            if (fs.existsSync(candidatePath)) {
              nodeModulesDir = path.join(searchDir, 'node_modules');
              break;
            }
            searchDir = path.dirname(searchDir);
          }
        }

        if (!nodeModulesDir) {
          throw new Error(
            'Could not find kshana-ink in node_modules. Please run npm install.',
          );
        }
      }

      log.info(`Resolved node_modules directory: ${nodeModulesDir}`);

      // Use absolute paths to the kshana-ink exports
      // This bypasses Node.js module resolution which looks relative to the bundle location
      const serverModulePath = path.join(
        nodeModulesDir,
        'kshana-ink',
        'dist',
        'server',
        'index.js',
      );
      const llmModulePath = path.join(
        nodeModulesDir,
        'kshana-ink',
        'dist',
        'core',
        'llm',
        'index.js',
      );

      log.info(`Loading kshana-ink server from: ${serverModulePath}`);
      log.info(`Loading kshana-ink llm from: ${llmModulePath}`);

      // Verify files exist
      if (!fs.existsSync(serverModulePath)) {
        throw new Error(
          `kshana-ink server module not found at: ${serverModulePath}. Run 'pnpm build' in kshana-ink directory.`,
        );
      }
      if (!fs.existsSync(llmModulePath)) {
        throw new Error(
          `kshana-ink llm module not found at: ${llmModulePath}. Run 'pnpm build' in kshana-ink directory.`,
        );
      }

      // Use Function constructor to create dynamic import that webpack can't analyze
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynamicImport = new Function(
        'specifier',
        'return import(specifier)',
      );

      // Convert absolute paths to file:// URLs for ES module imports
      // This is required for Node.js ES modules, especially in production
      const serverModuleUrl = pathToFileURL(serverModulePath).href;
      const llmModuleUrl = pathToFileURL(llmModulePath).href;
      const serverModule = await dynamicImport(serverModuleUrl);
      const llmModule = await dynamicImport(llmModuleUrl);

      log.info('Successfully loaded kshana-ink modules');

      const { createServer } = serverModule;
      const { getLLMConfig, validateLLMConfig } = llmModule;

      // Validate LLM configuration before proceeding
      const validation = validateLLMConfig();
      if (!validation.valid) {
        const validationErrors = validation.errors.join(', ');
        log.error(`LLM configuration validation failed: ${validationErrors}`);
        throw new Error(`LLM configuration invalid: ${validationErrors}`);
      }

      // Get LLM configuration (reads from environment variables we just set)
      const llmConfig = getLLMConfig();

      log.info(
        `LLM Config: provider=${process.env.LLM_PROVIDER}, model=${llmConfig.model}, baseUrl=${llmConfig.baseUrl}`,
      );

      // Create and start kshana-ink server
      log.info('Creating kshana-ink server instance...');
      this.server = await createServer(
        {
          llmConfig,
          apiPrefix: '/api/v1',
          taskType: 'video', // Use video task type for video generation features
        },
        {
          host: '127.0.0.1',
          port: this.port,
          cors: {
            origin: true,
            methods: ['GET', 'POST', 'DELETE'],
          },
        },
      );

      log.info('Starting kshana-ink server...');
      await this.server.start();
      log.info(`Kshana-ink server started, waiting for health check...`);

      // Verify health endpoint is responding
      const healthUrl = `http://127.0.0.1:${this.port}${HEALTH_ENDPOINT}`;
      await waitForHealth(healthUrl);

      this.updateState({ status: 'ready' });
      log.info(`Kshana-ink backend ready on ${healthUrl}`);

      return this.port;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      log.error(`Failed to start kshana-ink backend: ${errorMessage}`);
      if (errorStack) {
        log.error(`Error stack: ${errorStack}`);
      }

      this.updateState({ status: 'error', message: errorMessage });
      // Clean up server if partially started
      if (this.server) {
        try {
          await this.server.stop();
        } catch (cleanupError) {
          log.error(`Error during cleanup: ${(cleanupError as Error).message}`);
        }
        this.server = undefined;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const serverInstance = this.server;
    this.server = undefined;
    this.updateState({ status: 'stopped' });

    try {
      await serverInstance.stop();
      log.info('Kshana-ink backend stopped');
    } catch (error) {
      log.error(`Error stopping backend: ${(error as Error).message}`);
    }
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
