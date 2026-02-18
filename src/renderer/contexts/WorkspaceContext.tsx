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

// Helper to find and update a node in the tree
const updateNodeInTree = (
  root: FileNode,
  path: string,
  children: FileNode[],
): FileNode => {
  if (root.path === path) {
    return { ...root, children, type: 'directory' };
  }
  if (root.children) {
    return {
      ...root,
      children: root.children.map((child) =>
        updateNodeInTree(child, path, children),
      ),
    };
  }
  return root;
};

const initialState: WorkspaceState = {
  projectDirectory: null,
  projectName: null,
  fileTree: null,
  selectedFile: null,
  activeContextFiles: [],
  recentProjects: [],
  connectionState: {
    server: 'disconnected',
  },
  isLoading: false,
  pendingFileNavigation: null,
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
      // Refresh file tree on any change - shallow refresh of root
      window.electron.project
        .readTree(state.projectDirectory!, 1)
        .then((tree: FileNode) => {
          // TODO: Ideally we should merge with existing tree to preserve expanded folders
          // For now, we just refresh root to prevent freezing, UI will need to re-expand
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
      // Read only first level to prevent freeze
      const tree = await window.electron.project.readTree(path, 1);
      const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '');
      const projectName = normalizedPath.split('/').pop() || path;

      // Start watching the directory
      await window.electron.project.watchDirectory(path);

      // Add to recent projects
      await window.electron.project.addRecent(path);
      const recent = await window.electron.project.getRecent();

      setState((prev) => ({
        ...prev,
        projectDirectory: normalizedPath,
        projectName,
        fileTree: tree,
        recentProjects: recent,
        isLoading: false,
        selectedFile: null,
        activeContextFiles: [],
      }));

      console.log('[WorkspaceContext] Project opened:', {
        projectDirectory: normalizedPath,
        projectName,
      });
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
        1,
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

  const openFolderDialog = useCallback(async () => {
    const path = await window.electron.project.selectDirectory();
    if (path) {
      await openProject(path);
    }
  }, [openProject]);

  const loadDirectory = useCallback(async (path: string) => {
    try {
      // Read specific directory (depth 1)
      const node = await window.electron.project.readTree(path, 1);

      setState((prev) => {
        if (!prev.fileTree) return prev;

        // If we loaded the root (unlikely via this method), just replace
        if (prev.fileTree.path === path) {
          return { ...prev, fileTree: node };
        }

        // Otherwise graft the new children into the existing tree
        const newTree = updateNodeInTree(
          prev.fileTree,
          path,
          node.children || [],
        );
        return { ...prev, fileTree: newTree };
      });
    } catch (err) {
      console.error('Failed to load directory:', err);
    }
  }, []);

  const navigateToFile = useCallback((filePath: string) => {
    setState((prev) => ({ ...prev, pendingFileNavigation: filePath }));
  }, []);

  const clearFileNavigation = useCallback(() => {
    setState((prev) => ({ ...prev, pendingFileNavigation: null }));
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 'o' && !e.shiftKey) {
        e.preventDefault();
        openFolderDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFolderDialog]);

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
      loadDirectory,
      navigateToFile,
      clearFileNavigation,
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
      loadDirectory,
      navigateToFile,
      clearFileNavigation,
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
