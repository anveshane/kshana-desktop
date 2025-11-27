import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  WorkspaceContextType,
  WorkspaceState,
  SelectedFile,
  ConnectionStatus,
  ConnectionState,
} from '../types/workspace';
import type { FileNode } from '../../shared/fileSystemTypes';

const initialState: WorkspaceState = {
  projectDirectory: null,
  projectName: null,
  fileTree: null,
  selectedFile: null,
  activeContextFiles: [],
  recentProjects: [],
  connectionState: {
    lmStudio: 'disconnected',
    comfyUI: 'disconnected',
  },
  isLoading: false,
};

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [state, setState] = useState<WorkspaceState>(initialState);

  // Load recent projects on mount
  useEffect(() => {
    const loadRecentProjects = async () => {
      try {
        const recent = await window.electron.project.getRecent();
        setState((prev) => ({ ...prev, recentProjects: recent }));
      } catch {
        // Failed to load recent projects
      }
    };
    loadRecentProjects();
  }, []);

  // Subscribe to file changes
  useEffect(() => {
    if (!state.projectDirectory) return undefined;

    const unsubscribe = window.electron.project.onFileChange(() => {
      // Refresh file tree on any change
      window.electron.project
        .readTree(state.projectDirectory!)
        .then((tree: FileNode) => {
          setState((prev) => ({ ...prev, fileTree: tree }));
          return tree;
        })
        .catch(() => {});
    });

    return unsubscribe;
  }, [state.projectDirectory]);

  const openProject = useCallback(async (path: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const tree = await window.electron.project.readTree(path);
      const projectName = path.split('/').pop() || path;

      // Start watching the directory
      await window.electron.project.watchDirectory(path);

      // Add to recent projects
      await window.electron.project.addRecent(path);
      const recent = await window.electron.project.getRecent();

      setState((prev) => ({
        ...prev,
        projectDirectory: path,
        projectName,
        fileTree: tree,
        recentProjects: recent,
        isLoading: false,
        selectedFile: null,
        activeContextFiles: [],
      }));
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const closeProject = useCallback(() => {
    if (state.projectDirectory) {
      window.electron.project.unwatchDirectory(state.projectDirectory);
    }
    setState((prev) => ({
      ...prev,
      projectDirectory: null,
      projectName: null,
      fileTree: null,
      selectedFile: null,
      activeContextFiles: [],
    }));
  }, [state.projectDirectory]);

  const selectFile = useCallback((file: SelectedFile | null) => {
    setState((prev) => ({ ...prev, selectedFile: file }));
  }, []);

  const addToActiveContext = useCallback((file: SelectedFile) => {
    setState((prev) => {
      const exists = prev.activeContextFiles.some((f) => f.path === file.path);
      if (exists) return prev;
      return {
        ...prev,
        activeContextFiles: [...prev.activeContextFiles, file],
      };
    });
  }, []);

  const removeFromActiveContext = useCallback((path: string) => {
    setState((prev) => ({
      ...prev,
      activeContextFiles: prev.activeContextFiles.filter(
        (f) => f.path !== path,
      ),
    }));
  }, []);

  const refreshFileTree = useCallback(async () => {
    if (!state.projectDirectory) return;
    try {
      const tree = await window.electron.project.readTree(
        state.projectDirectory,
      );
      setState((prev) => ({ ...prev, fileTree: tree }));
    } catch {
      // Failed to refresh file tree
    }
  }, [state.projectDirectory]);

  const setConnectionStatus = useCallback(
    (service: keyof ConnectionState, status: ConnectionStatus) => {
      setState((prev) => ({
        ...prev,
        connectionState: {
          ...prev.connectionState,
          [service]: status,
        },
      }));
    },
    [],
  );

  const value = useMemo<WorkspaceContextType>(
    () => ({
      ...state,
      openProject,
      closeProject,
      selectFile,
      addToActiveContext,
      removeFromActiveContext,
      refreshFileTree,
      setConnectionStatus,
    }),
    [
      state,
      openProject,
      closeProject,
      selectFile,
      addToActiveContext,
      removeFromActiveContext,
      refreshFileTree,
      setConnectionStatus,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
