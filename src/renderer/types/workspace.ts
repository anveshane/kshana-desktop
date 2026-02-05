import type {
  FileNode,
  RecentProject,
  FileType,
} from '../../shared/fileSystemTypes';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface ConnectionState {
  lmStudio: ConnectionStatus;
  comfyUI: ConnectionStatus;
}

export interface SelectedFile {
  path: string;
  name: string;
  type: FileType;
}

export interface WorkspaceState {
  projectDirectory: string | null;
  projectName: string | null;
  fileTree: FileNode | null;
  selectedFile: SelectedFile | null;
  activeContextFiles: SelectedFile[];
  recentProjects: RecentProject[];
  connectionState: ConnectionState;
  isLoading: boolean;
  pendingFileNavigation: string | null;
}

export interface WorkspaceActions {
  openProject: (path: string) => Promise<void>;
  closeProject: () => void;
  selectFile: (file: SelectedFile | null) => void;
  addToActiveContext: (file: SelectedFile) => void;
  removeFromActiveContext: (path: string) => void;
  refreshFileTree: () => Promise<void>;
  setConnectionStatus: (
    service: keyof ConnectionState,
    status: ConnectionStatus,
  ) => void;
  loadDirectory: (path: string) => Promise<void>;
  navigateToFile: (filePath: string) => void;
  clearFileNavigation: () => void;
}

export type WorkspaceContextType = WorkspaceState & WorkspaceActions;
