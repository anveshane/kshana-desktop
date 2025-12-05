import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { FileNode } from '../../shared/fileSystemTypes';

export interface ClipboardItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
  operation: 'copy' | 'cut';
}

export interface ExplorerContextType {
  // Selection
  selectedPaths: Set<string>;
  focusedPath: string | null;
  lastSelectedPath: string | null;
  selectPath: (path: string, multi?: boolean, range?: boolean) => void;
  clearSelection: () => void;
  setFocusedPath: (path: string | null) => void;

  // Clipboard
  clipboard: ClipboardItem | null;
  cutPath: string | null;
  copyToClipboard: (node: FileNode) => void;
  cutToClipboard: (node: FileNode) => void;
  clearClipboard: () => void;

  // Rename
  renamingPath: string | null;
  startRename: (path: string) => void;
  cancelRename: () => void;

  // Inline create
  creatingInPath: string | null;
  creatingType: 'file' | 'folder' | null;
  startCreate: (parentPath: string, type: 'file' | 'folder') => void;
  cancelCreate: () => void;

  // Drag and drop
  draggedNode: FileNode | null;
  dropTargetPath: string | null;
  setDraggedNode: (node: FileNode | null) => void;
  setDropTargetPath: (path: string | null) => void;

  // Expanded folders
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  expandPath: (path: string) => void;

  // Flat node list for keyboard navigation
  flatNodes: FileNode[];
  setFlatNodes: (nodes: FileNode[]) => void;
}

const ExplorerContext = createContext<ExplorerContextType | null>(null);

interface ExplorerProviderProps {
  children: ReactNode;
}

export function ExplorerProvider({ children }: ExplorerProviderProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const [cutPath, setCutPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(
    null,
  );
  const [draggedNode, setDraggedNode] = useState<FileNode | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [flatNodes, setFlatNodes] = useState<FileNode[]>([]);

  const selectPath = useCallback(
    (path: string, multi = false, range = false) => {
      setSelectedPaths((prev) => {
        if (range && lastSelectedPath && flatNodes.length > 0) {
          // Range selection
          const startIdx = flatNodes.findIndex(
            (n) => n.path === lastSelectedPath,
          );
          const endIdx = flatNodes.findIndex((n) => n.path === path);
          if (startIdx !== -1 && endIdx !== -1) {
            const [from, to] =
              startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            const newSet = new Set(prev);
            for (let i = from; i <= to; i++) {
              newSet.add(flatNodes[i].path);
            }
            return newSet;
          }
        }
        if (multi) {
          const newSet = new Set(prev);
          if (newSet.has(path)) {
            newSet.delete(path);
          } else {
            newSet.add(path);
          }
          return newSet;
        }
        return new Set([path]);
      });
      setLastSelectedPath(path);
      setFocusedPath(path);
    },
    [lastSelectedPath, flatNodes],
  );

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setLastSelectedPath(null);
  }, []);

  const copyToClipboard = useCallback((node: FileNode) => {
    setClipboard({
      path: node.path,
      name: node.name,
      type: node.type,
      operation: 'copy',
    });
    setCutPath(null);
  }, []);

  const cutToClipboard = useCallback((node: FileNode) => {
    setClipboard({
      path: node.path,
      name: node.name,
      type: node.type,
      operation: 'cut',
    });
    setCutPath(node.path);
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
    setCutPath(null);
  }, []);

  const startRename = useCallback((path: string) => {
    setRenamingPath(path);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const startCreate = useCallback(
    (parentPath: string, type: 'file' | 'folder') => {
      setCreatingInPath(parentPath);
      setCreatingType(type);
      setExpandedPaths((prev) => new Set([...prev, parentPath]));
    },
    [],
  );

  const cancelCreate = useCallback(() => {
    setCreatingInPath(null);
    setCreatingType(null);
  }, []);

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const expandPath = useCallback((path: string) => {
    setExpandedPaths((prev) => new Set([...prev, path]));
  }, []);

  const value = useMemo<ExplorerContextType>(
    () => ({
      selectedPaths,
      focusedPath,
      lastSelectedPath,
      selectPath,
      clearSelection,
      setFocusedPath,
      clipboard,
      cutPath,
      copyToClipboard,
      cutToClipboard,
      clearClipboard,
      renamingPath,
      startRename,
      cancelRename,
      creatingInPath,
      creatingType,
      startCreate,
      cancelCreate,
      draggedNode,
      dropTargetPath,
      setDraggedNode,
      setDropTargetPath,
      expandedPaths,
      toggleExpanded,
      expandPath,
      flatNodes,
      setFlatNodes,
    }),
    [
      selectedPaths,
      focusedPath,
      lastSelectedPath,
      selectPath,
      clearSelection,
      clipboard,
      cutPath,
      copyToClipboard,
      cutToClipboard,
      clearClipboard,
      renamingPath,
      startRename,
      cancelRename,
      creatingInPath,
      creatingType,
      startCreate,
      cancelCreate,
      draggedNode,
      dropTargetPath,
      expandedPaths,
      toggleExpanded,
      expandPath,
      flatNodes,
    ],
  );

  return (
    <ExplorerContext.Provider value={value}>
      {children}
    </ExplorerContext.Provider>
  );
}

export function useExplorer(): ExplorerContextType {
  const context = useContext(ExplorerContext);
  if (!context) {
    throw new Error('useExplorer must be used within an ExplorerProvider');
  }
  return context;
}
