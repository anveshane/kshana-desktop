// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { BackendEnvOverrides, BackendState } from '../shared/backendTypes';
import type { AppSettings } from '../shared/settingsTypes';
import type {
  FileNode,
  RecentProject,
  FileChangeEvent,
} from '../shared/fileSystemTypes';

export type Channels = 'ipc-example';

const backendBridge = {
  start(overrides: BackendEnvOverrides = {}): Promise<BackendState> {
    return ipcRenderer.invoke('backend:start', overrides);
  },
  restart(overrides: BackendEnvOverrides = {}): Promise<BackendState> {
    return ipcRenderer.invoke('backend:restart', overrides);
  },
  stop(): Promise<BackendState> {
    return ipcRenderer.invoke('backend:stop');
  },
  getState(): Promise<BackendState> {
    return ipcRenderer.invoke('backend:get-state');
  },
  onStateChange(callback: (state: BackendState) => void) {
    const subscription = (_event: IpcRendererEvent, state: BackendState) => {
      callback(state);
    };
    ipcRenderer.on('backend:state', subscription);
    return () => {
      ipcRenderer.removeListener('backend:state', subscription);
    };
  },
};

const settingsBridge = {
  get(): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:get');
  },
  update(patch: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:update', patch);
  },
  onChange(callback: (settings: AppSettings) => void) {
    const subscription = (_event: IpcRendererEvent, settings: AppSettings) => {
      callback(settings);
    };
    ipcRenderer.on('settings:updated', subscription);
    return () => {
      ipcRenderer.removeListener('settings:updated', subscription);
    };
  },
};

const projectBridge = {
  selectDirectory(): Promise<string | null> {
    return ipcRenderer.invoke('project:select-directory');
  },
  selectVideoFile(): Promise<string | null> {
    return ipcRenderer.invoke('project:select-video-file');
  },
  readTree(dirPath: string): Promise<FileNode> {
    return ipcRenderer.invoke('project:read-tree', dirPath);
  },
  readFile(filePath: string): Promise<string | null> {
    return ipcRenderer.invoke('project:read-file', filePath);
  },
  readFileBase64(filePath: string): Promise<string | null> {
    return ipcRenderer.invoke('project:read-file-base64', filePath);
  },
  writeFile(filePath: string, content: string): Promise<void> {
    return ipcRenderer.invoke('project:write-file', filePath, content);
  },
  createFile(basePath: string, relativePath: string): Promise<string | null> {
    return ipcRenderer.invoke('project:create-file', basePath, relativePath);
  },
  createFolder(basePath: string, relativePath: string): Promise<string | null> {
    return ipcRenderer.invoke('project:create-folder', basePath, relativePath);
  },
  rename(oldPath: string, newName: string): Promise<string> {
    return ipcRenderer.invoke('project:rename', oldPath, newName);
  },
  delete(targetPath: string): Promise<void> {
    return ipcRenderer.invoke('project:delete', targetPath);
  },
  move(sourcePath: string, destDir: string): Promise<string> {
    return ipcRenderer.invoke('project:move', sourcePath, destDir);
  },
  copy(sourcePath: string, destDir: string): Promise<string> {
    return ipcRenderer.invoke('project:copy', sourcePath, destDir);
  },
  revealInFinder(targetPath: string): Promise<void> {
    return ipcRenderer.invoke('project:reveal-in-finder', targetPath);
  },
  watchDirectory(dirPath: string): Promise<void> {
    return ipcRenderer.invoke('project:watch-directory', dirPath);
  },
  unwatchDirectory(dirPath: string): Promise<void> {
    return ipcRenderer.invoke('project:unwatch-directory', dirPath);
  },
  getRecent(): Promise<RecentProject[]> {
    return ipcRenderer.invoke('project:get-recent');
  },
  addRecent(projectPath: string): Promise<void> {
    return ipcRenderer.invoke('project:add-recent', projectPath);
  },
  getResourcesPath(): Promise<string> {
    return ipcRenderer.invoke('project:get-resources-path');
  },
  onFileChange(callback: (event: FileChangeEvent) => void) {
    const subscription = (
      _event: IpcRendererEvent,
      fileEvent: FileChangeEvent,
    ) => {
      callback(fileEvent);
    };
    ipcRenderer.on('project:file-changed', subscription);
    return () => {
      ipcRenderer.removeListener('project:file-changed', subscription);
    };
  },
};

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...ipcArgs: unknown[]) =>
        func(...ipcArgs);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...ipcArgs) => func(...ipcArgs));
    },
  },
  backend: backendBridge,
  settings: settingsBridge,
  project: projectBridge,
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
