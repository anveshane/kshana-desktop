export type BackendStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  // Keep legacy aliases so existing renderer code still compiles
  | 'starting'
  | 'ready'
  | 'stopped';

export interface BackendState {
  status: BackendStatus;
  message?: string;
  port?: number;
  serverUrl?: string;
}

export interface BundledVersionInfo {
  packageVersion?: string;
  gitBranch?: string;
  gitCommit?: string;
  commitDate?: string;
}

export interface BackendConnectionInfo {
  effectiveServerUrl?: string;
  localServerUrl?: string;
  localBackendAvailable: boolean;
  bundledVersion?: BundledVersionInfo;
  note?: string;
}
