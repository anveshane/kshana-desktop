// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  BackendEnvOverrides,
  BackendState,
} from '../shared/backendTypes';
import type { AppSettings } from '../shared/settingsTypes';

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
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
