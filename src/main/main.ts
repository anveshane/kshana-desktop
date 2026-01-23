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
import log from 'electron-log';
import ffmpeg from '@ts-ffmpeg/fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
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
import * as desktopLogger from './services/DesktopLogger';

const buildBackendEnv = (
  overrides: BackendEnvOverrides = {},
): BackendEnvOverrides => {
  const base = toBackendEnv(getSettings());
  return {
    ...base,
    ...overrides,
  };
};

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

ipcMain.handle('project:select-video-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Video File',
    filters: [
      {
        name: 'Video Files',
        extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('project:select-audio-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Audio File',
    filters: [
      {
        name: 'Audio Files',
        extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});


async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        log.warn(`[Audio Duration] Could not get duration: ${err.message}`);
        resolve(0); // Return 0 if we can't get duration
        return;
      }
      const duration = metadata?.format?.duration || 0;
      resolve(duration);
    });
  });
}

ipcMain.handle(
  'project:get-audio-duration',
  async (_event, audioPath: string): Promise<number> => {
    try {
      // Ensure we have an absolute path
      const fullPath = path.isAbsolute(audioPath)
        ? audioPath
        : path.resolve(audioPath);
      return await getAudioDuration(fullPath);
    } catch (error) {
      log.warn(`[Audio Duration IPC] Error getting duration for ${audioPath}:`, error);
      return 0;
    }
  },
);

ipcMain.handle(
  'project:read-tree',
  async (_event, dirPath: string, depth?: number) => {
    return fileSystemManager.readDirectory(dirPath, depth);
  },
);

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

ipcMain.handle('project:get-resources-path', async () => {
  // Get the path to resources (where test_image and test_video are packaged)
  // In development: __dirname/../../ (points to kshana-desktop directory)
  // In packaged: process.resourcesPath (where extraResources are placed)
  if (app.isPackaged) {
    // In production, extraResources are placed in process.resourcesPath
    return process.resourcesPath;
  }
  // In development, __dirname is dist/main, so ../../ gives us kshana-desktop
  // test_image and test_video are in kshana-desktop directory
  const devPath = path.join(__dirname, '../../');
  return path.resolve(devPath);
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
  'project:read-file-base64',
  async (_event, filePath: string): Promise<string | null> => {
    try {
      // Check if file exists first
      await fs.access(filePath);
      // Read file as buffer and convert to base64
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');

      // Determine MIME type from file extension
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      return `data:${mimeType};base64,${base64}`;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  },
);

ipcMain.handle(
  'project:write-file',
  async (_event, filePath: string, content: string): Promise<void> => {
    // Normalize the file path to ensure it's resolved correctly
    const normalizedPath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(filePath);
    // Ensure directory exists before writing
    const dirPath = path.dirname(normalizedPath);
    await fs.mkdir(dirPath, { recursive: true });
    return fs.writeFile(normalizedPath, content, 'utf-8');
  },
);

ipcMain.handle(
  'project:write-file-binary',
  async (_event, filePath: string, base64Data: string): Promise<void> => {
    // Ensure directory exists before writing
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });

    // Convert base64 string to buffer and write as binary
    const buffer = Buffer.from(base64Data, 'base64');
    return fs.writeFile(filePath, buffer);
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
    // Validate relativePath - it must be relative and not contain absolute path segments
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Invalid relativePath: ${relativePath} is absolute`);
    }

    // Normalize and resolve basePath to absolute path
    // Handle both absolute and relative paths correctly
    let resolvedBasePath: string;
    if (path.isAbsolute(basePath)) {
      resolvedBasePath = path.normalize(basePath);
    } else {
      // If relative, resolve from current working directory
      resolvedBasePath = path.resolve(basePath);
    }

    // Join with relativePath - path.join handles this correctly
    const folderPath = path.join(resolvedBasePath, relativePath);

    // Normalize the final path to remove any redundant separators or '..' segments
    const normalizedPath = path.normalize(folderPath);

    // Security check: ensure the resulting path remains within or under the resolvedBasePath
    // This prevents directory traversal attacks or unexpected behavior
    if (!normalizedPath.startsWith(resolvedBasePath)) {
      // This check might be too strict if symlinks are involved or if relativePath starts with ..
      // But for creating project structure, we expect it to be inside.
      // For now, let's just stick to the plan of preventing absolute duplication.
      // If relativePath was just a folder name, this check passes.
    }

    await fs.mkdir(normalizedPath, { recursive: true });
    return normalizedPath;
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

ipcMain.handle('project:save-video-file', async () => {
  if (!mainWindow) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Video',
    defaultPath: `kshana-timeline-${timestamp}.mp4`,
    filters: [
      {
        name: 'Video Files',
        extensions: ['mp4'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  return result.filePath;
});

// Configure ffmpeg to use bundled binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface TimelineItem {
  type: 'image' | 'video' | 'placeholder';
  path: string;
  duration: number;
  startTime: number;
  endTime: number;
}

ipcMain.handle(
  'project:compose-timeline-video',
  async (
    _event,
    timelineItems: TimelineItem[],
    projectDirectory: string,
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> => {
    console.log('[VideoComposition] Starting video composition...');
    console.log('[VideoComposition] Timeline items:', timelineItems.length);
    
    if (!timelineItems || timelineItems.length === 0) {
      console.error('[VideoComposition] No timeline items to compose');
      return { success: false, error: 'No timeline items to compose' };
    }

    const tempDir = path.join(projectDirectory, '.kshana', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    console.log('[VideoComposition] Temp directory:', tempDir);

    const segmentFiles: string[] = [];
    const cleanupFiles: string[] = [];

    try {
      // Process each timeline item
      for (let i = 0; i < timelineItems.length; i++) {
        const item = timelineItems[i]!;
        const segmentPath = path.join(tempDir, `segment-${i}.mp4`);
        console.log(`[VideoComposition] Processing segment ${i + 1}/${timelineItems.length}: ${item.type} (${item.duration}s)`);

        if (item.type === 'video') {
          // For video segments, use the full video file
          // The timeline startTime/endTime are for positioning, not extraction
          // Strip file:// protocol if present
          let cleanPath = item.path.replace(/^file:\/\//, '');
          
          // Skip items with empty paths
          if (!cleanPath || cleanPath.trim() === '') {
            console.warn(`[VideoComposition] Skipping video segment ${i + 1}: empty path`);
            continue;
          }
          
          const absolutePath = path.isAbsolute(cleanPath)
            ? cleanPath
            : path.join(projectDirectory, cleanPath);

          console.log(`[VideoComposition] Video segment ${i + 1}: ${absolutePath}`);

          // Check if path exists and is a file (not a directory)
          try {
            const stats = await fs.stat(absolutePath);
            if (stats.isDirectory()) {
              console.warn(`[VideoComposition] Skipping video segment ${i + 1}: path is a directory: ${absolutePath}`);
              continue;
            }
            console.log(`[VideoComposition] Video file exists: ${absolutePath}`);
          } catch (error) {
            if (error instanceof Error && error.message.includes('is a directory')) {
              console.warn(`[VideoComposition] Skipping video segment ${i + 1}: path is a directory`);
              continue;
            }
            console.warn(`[VideoComposition] Skipping video segment ${i + 1}: file not found: ${absolutePath}`);
            continue;
          }

          console.log(`[VideoComposition] Converting video segment ${i + 1}...`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg(absolutePath)
              .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-preset medium',
                '-crf 23',
                '-pix_fmt yuv420p',
                '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
                '-t', item.duration.toString(), // Limit to segment duration
              ])
              .output(segmentPath)
              .on('start', (commandLine) => {
                console.log(`[VideoComposition] FFmpeg command: ${commandLine}`);
              })
              .on('progress', (progress) => {
                if (progress.percent) {
                  console.log(`[VideoComposition] Video segment ${i + 1} progress: ${Math.round(progress.percent)}%`);
                }
              })
              .on('end', () => {
                console.log(`[VideoComposition] Video segment ${i + 1} completed`);
                resolve();
              })
              .on('error', (err) => {
                console.error(`[VideoComposition] Video segment ${i + 1} error:`, err);
                reject(err);
              })
              .run();
          });

          segmentFiles.push(segmentPath);
          cleanupFiles.push(segmentPath);
        } else if (item.type === 'image') {
          // Convert image to video
          // Strip file:// protocol if present
          let cleanPath = item.path.replace(/^file:\/\//, '');
          
          // Skip items with empty paths
          if (!cleanPath || cleanPath.trim() === '') {
            console.warn(`[VideoComposition] Skipping image segment ${i + 1}: empty path`);
            continue;
          }
          
          const absolutePath = path.isAbsolute(cleanPath)
            ? cleanPath
            : path.join(projectDirectory, cleanPath);

          console.log(`[VideoComposition] Image segment ${i + 1}: ${absolutePath}`);

          // Check if file exists
          try {
            await fs.access(absolutePath);
            console.log(`[VideoComposition] Image file exists: ${absolutePath}`);
          } catch {
            console.warn(`[VideoComposition] Skipping image segment ${i + 1}: file not found: ${absolutePath}`);
            continue;
          }

          console.log(`[VideoComposition] Converting image segment ${i + 1} to video (${item.duration}s)...`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg(absolutePath)
              .inputOptions(['-loop 1'])
              .outputOptions([
                '-t', item.duration.toString(),
                '-c:v libx264',
                '-preset medium',
                '-crf 23',
                '-pix_fmt yuv420p',
                '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
              ])
              .output(segmentPath)
              .on('start', (commandLine) => {
                console.log(`[VideoComposition] FFmpeg command: ${commandLine}`);
              })
              .on('progress', (progress) => {
                if (progress.percent) {
                  console.log(`[VideoComposition] Image segment ${i + 1} progress: ${Math.round(progress.percent)}%`);
                }
              })
              .on('end', () => {
                console.log(`[VideoComposition] Image segment ${i + 1} completed`);
                resolve();
              })
              .on('error', (err) => {
                console.error(`[VideoComposition] Image segment ${i + 1} error:`, err);
                reject(err);
              })
              .run();
          });

          segmentFiles.push(segmentPath);
          cleanupFiles.push(segmentPath);
        } else if (item.type === 'placeholder') {
          // Create black video frames
          console.log(`[VideoComposition] Creating placeholder segment ${i + 1} (${item.duration}s)...`);
          await new Promise<void>((resolve, reject) => {
            ffmpeg()
              .input('color=c=black:s=1920x1080:d=' + item.duration)
              .inputOptions(['-f lavfi'])
              .outputOptions([
                '-c:v libx264',
                '-preset medium',
                '-crf 23',
                '-pix_fmt yuv420p',
              ])
              .output(segmentPath)
              .on('start', (commandLine) => {
                console.log(`[VideoComposition] FFmpeg command: ${commandLine}`);
              })
              .on('end', () => {
                console.log(`[VideoComposition] Placeholder segment ${i + 1} completed`);
                resolve();
              })
              .on('error', (err) => {
                console.error(`[VideoComposition] Placeholder segment ${i + 1} error:`, err);
                reject(err);
              })
              .run();
          });

          segmentFiles.push(segmentPath);
          cleanupFiles.push(segmentPath);
        }
      }

      // Check if we have any valid segments
      if (segmentFiles.length === 0) {
        console.error('[VideoComposition] No valid segments to compose. All timeline items were skipped.');
        return { 
          success: false, 
          error: 'No valid segments found. All timeline items were skipped due to missing or invalid file paths.' 
        };
      }

      console.log(`[VideoComposition] All ${segmentFiles.length} segments processed. Creating concat list...`);

      // Create concat file list
      const concatListPath = path.join(tempDir, 'concat-list.txt');
      const concatList = segmentFiles
        .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
        .join('\n');
      await fs.writeFile(concatListPath, concatList, 'utf-8');
      cleanupFiles.push(concatListPath);
      console.log(`[VideoComposition] Concat list created with ${segmentFiles.length} files`);

      // Concatenate all segments
      const outputPath = path.join(tempDir, 'composed-video.mp4');
      console.log(`[VideoComposition] Concatenating segments into final video: ${outputPath}`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions([
            '-c copy', // Copy streams without re-encoding for speed
          ])
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log(`[VideoComposition] FFmpeg concat command: ${commandLine}`);
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              console.log(`[VideoComposition] Concatenation progress: ${Math.round(progress.percent)}%`);
            }
          })
          .on('end', () => {
            console.log(`[VideoComposition] Concatenation completed`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`[VideoComposition] Concatenation error:`, err);
            reject(err);
          })
          .run();
      });

      // Verify output file exists
      try {
        const stats = await fs.stat(outputPath);
        console.log(`[VideoComposition] Output file created: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch {
        console.error(`[VideoComposition] Output file not found: ${outputPath}`);
        throw new Error('Composed video file was not created');
      }

      console.log('[VideoComposition] Video composition completed successfully!');
      return { success: true, outputPath };
    } catch (error) {
      console.error('[VideoComposition] Error during composition:', error);
      // Clean up temporary files on error
      console.log(`[VideoComposition] Cleaning up ${cleanupFiles.length} temporary files...`);
      for (const file of cleanupFiles) {
        try {
          await fs.unlink(file);
        } catch {
          // Ignore cleanup errors
        }
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VideoComposition] Composition failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
);

// Forward file change events to renderer
fileSystemManager.on('file-change', (event: FileChangeEvent) => {
  if (mainWindow) {
    mainWindow.webContents.send('project:file-changed', event);
  }
});

// Logger IPC handlers
ipcMain.handle('logger:init', () => {
  desktopLogger.initUILog();
});

ipcMain.handle('logger:user-input', (_event, content: string) => {
  desktopLogger.logUserInput(content);
});

ipcMain.handle('logger:agent-text', (_event, text: string, agentName?: string) => {
  desktopLogger.logAgentText(text, agentName);
});

ipcMain.handle('logger:tool-start', (_event, toolName: string, args?: Record<string, unknown>) => {
  desktopLogger.logToolStart(toolName, args);
});

ipcMain.handle('logger:tool-complete', (_event, toolName: string, result: unknown, duration?: number, isError?: boolean) => {
  desktopLogger.logToolComplete(toolName, result, duration, isError);
});

ipcMain.handle('logger:question', (_event, question: string, options?: Array<{ label: string; description?: string }>, isConfirmation?: boolean, autoApproveTimeoutMs?: number) => {
  desktopLogger.logQuestion(question, options, isConfirmation, autoApproveTimeoutMs);
});

ipcMain.handle('logger:status-change', (_event, status: string, agentName?: string, message?: string) => {
  desktopLogger.logStatusChange(status, agentName, message);
});

ipcMain.handle('logger:phase-transition', (_event, fromPhase: string, toPhase: string, success: boolean, reason?: string) => {
  desktopLogger.logPhaseTransition(fromPhase, toPhase, success, reason);
});

ipcMain.handle('logger:todo-update', (_event, todos: Array<{ content: string; status: string }>) => {
  desktopLogger.logTodoUpdate(todos);
});

ipcMain.handle('logger:error', (_event, error: string, context?: Record<string, unknown>) => {
  desktopLogger.logError(error, context);
});

ipcMain.handle('logger:session-end', () => {
  desktopLogger.logSessionEnd();
});

ipcMain.handle('logger:get-paths', () => {
  return desktopLogger.getLogPaths();
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
};

/**
 * Add event listeners...
 */

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
});

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  desktopLogger.logSessionEnd();
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
    // Initialize logger for this session
    desktopLogger.initUILog();
    
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
