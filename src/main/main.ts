/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs/promises';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import backendManager, {
  BackendEnvOverrides,
  BackendState,
} from './backendManager';
import {
  AppSettings,
  getSettings,
  toBackendEnv,
  updateSettings,
} from './settingsManager';
import fileSystemManager from './fileSystemManager';
import type { FileChangeEvent } from '../shared/fileSystemTypes';

const buildBackendEnv = (
  overrides: BackendEnvOverrides = {},
): BackendEnvOverrides => {
  const base = toBackendEnv(getSettings());
  return {
    ...base,
    ...overrides,
  };
};

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

backendManager.on('state', (state: BackendState) => {
  if (mainWindow) {
    mainWindow.webContents.send('backend:state', state);
  }
});

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.handle('backend:get-state', async (): Promise<BackendState> => {
  return backendManager.status;
});

ipcMain.handle(
  'backend:start',
  async (
    _event,
    overrides: BackendEnvOverrides = {},
  ): Promise<BackendState> => {
    try {
      await backendManager.start(buildBackendEnv(overrides));
      return backendManager.status;
    } catch (error) {
      log.error(`Failed to start backend: ${(error as Error).message}`);
      return {
        status: 'error',
        message: (error as Error).message,
      };
    }
  },
);

ipcMain.handle(
  'backend:restart',
  async (_event, overrides: BackendEnvOverrides = {}) => {
    try {
      await backendManager.restart(buildBackendEnv(overrides));
      return backendManager.status;
    } catch (error) {
      log.error(`Failed to restart backend: ${(error as Error).message}`);
      return {
        status: 'error',
        message: (error as Error).message,
      };
    }
  },
);

ipcMain.handle('backend:stop', async () => {
  await backendManager.stop();
  return backendManager.status;
});

ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
  return getSettings();
});

ipcMain.handle(
  'settings:update',
  async (_event, patch: Partial<AppSettings>): Promise<AppSettings> => {
    const updated = updateSettings(patch);
    if (mainWindow) {
      mainWindow.webContents.send('settings:updated', updated);
    }
    return updated;
  },
);

// Project / File System IPC handlers
ipcMain.handle('project:select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('project:read-tree', async (_event, dirPath: string) => {
  return fileSystemManager.readDirectory(dirPath);
});

ipcMain.handle('project:watch-directory', async (_event, dirPath: string) => {
  fileSystemManager.watchDirectory(dirPath);
});

ipcMain.handle('project:unwatch-directory', async () => {
  fileSystemManager.unwatchDirectory();
});

ipcMain.handle('project:get-recent', async () => {
  return fileSystemManager.getRecentProjects();
});

ipcMain.handle('project:add-recent', async (_event, projectPath: string) => {
  fileSystemManager.addRecentProject(projectPath);
});

ipcMain.handle(
  'project:read-file',
  async (_event, filePath: string): Promise<string | null> => {
    try {
      // Check if file exists first to avoid noisy ENOENT errors
      await fs.access(filePath);
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        // Return null for missing files - frontend handles this gracefully
        return null;
      }
      throw error;
    }
  },
);

ipcMain.handle(
  'project:write-file',
  async (_event, filePath: string, content: string): Promise<void> => {
    return fs.writeFile(filePath, content, 'utf-8');
  },
);

ipcMain.handle(
  'project:create-file',
  async (
    _event,
    basePath: string,
    relativePath: string,
  ): Promise<string | null> => {
    const filePath = path.join(basePath, relativePath);
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, '', 'utf-8');
    return filePath;
  },
);

ipcMain.handle(
  'project:create-folder',
  async (
    _event,
    basePath: string,
    relativePath: string,
  ): Promise<string | null> => {
    const folderPath = path.join(basePath, relativePath);
    await fs.mkdir(folderPath, { recursive: true });
    return folderPath;
  },
);

ipcMain.handle(
  'project:rename',
  async (_event, oldPath: string, newName: string): Promise<string> => {
    return fileSystemManager.rename(oldPath, newName);
  },
);

ipcMain.handle(
  'project:delete',
  async (_event, targetPath: string): Promise<void> => {
    return fileSystemManager.delete(targetPath);
  },
);

ipcMain.handle(
  'project:move',
  async (_event, sourcePath: string, destDir: string): Promise<string> => {
    return fileSystemManager.move(sourcePath, destDir);
  },
);

ipcMain.handle(
  'project:copy',
  async (_event, sourcePath: string, destDir: string): Promise<string> => {
    return fileSystemManager.copy(sourcePath, destDir);
  },
);

ipcMain.handle(
  'project:reveal-in-finder',
  async (_event, targetPath: string) => {
    return fileSystemManager.revealInFinder(targetPath);
  },
);

// Forward file change events to renderer
fileSystemManager.on('file-change', (event: FileChangeEvent) => {
  if (mainWindow) {
    mainWindow.webContents.send('project:file-changed', event);
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      webSecurity: false, // Allow file:// protocol for media preview
    },
  });

  // Open DevTools to debug black screen
  mainWindow.webContents.openDevTools();

  const htmlPath = resolveHtmlPath('index.html');
  log.info(`Loading HTML from: ${htmlPath}`);
  log.info(`App is packaged: ${app.isPackaged}`);
  log.info(`Main process __dirname: ${__dirname}`);

  // In development, wait for dev server to be ready
  if (isDebug && htmlPath.startsWith('http://')) {
    const checkDevServer = async () => {
      const maxAttempts = 30;
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < maxAttempts; i += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const response = await fetch(htmlPath, { method: 'HEAD' });
          if (response.ok) {
            log.info('Dev server is ready');
            mainWindow?.loadURL(htmlPath);
            return;
          }
        } catch {
          // Dev server not ready yet
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 1000);
        });
      }
      log.warn('Dev server not ready after 30 seconds, loading anyway');
      mainWindow?.loadURL(htmlPath);
    };
    checkDevServer();
  } else {
    mainWindow.loadURL(htmlPath);
  }

  // Add error handlers for debugging
  mainWindow.webContents.on(
    'did-fail-load',
    (event, errorCode, errorDescription, validatedURL) => {
      log.error(`Failed to load: ${errorCode} - ${errorDescription}`);
      log.error(`URL: ${validatedURL || htmlPath}`);
    },
  );

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log.error(`Renderer process gone: ${details.reason}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Page finished loading');
  });

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    log.info('Window ready to show');
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  // new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  backendManager.stop().catch((error) => {
    log.error(`Failed to stop backend: ${(error as Error).message}`);
  });
});

const bootstrapBackend = async () => {
  try {
    await backendManager.start(buildBackendEnv());
  } catch (error) {
    log.error(`Failed to bootstrap backend: ${(error as Error).message}`);
  }
};

const handleBackendStartup = (error: Error) => {
  log.error(`Background backend startup failed: ${error.message}`);
};

const startBackendInBackground = () => {
  const backendPromise = bootstrapBackend();
  backendPromise.catch(handleBackendStartup);
};

app
  .whenReady()
  .then(async () => {
    // Create window first so UI appears immediately
    await createWindow();

    // Start backend in background (non-blocking)
    // UI will show loading state while backend starts
    startBackendInBackground();

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
