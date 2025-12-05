import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileAudio,
  FileVideo,
  FileImage,
  File,
} from 'lucide-react';
import type { FileNode } from '../../../../shared/fileSystemTypes';
import { getFileType } from '../../../../shared/fileSystemTypes';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useExplorer } from '../../../contexts/ExplorerContext';
import ContextMenu from '../ContextMenu/ContextMenu';
import InlineInput from '../InlineInput/InlineInput';
import styles from './FileTreeNode.module.scss';

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
}

function getFileIcon(node: FileNode) {
  if (node.type === 'directory') return null;
  const fileType = getFileType(node.extension);
  switch (fileType) {
    case 'audio':
      return <FileAudio size={16} className={styles.fileIcon} />;
    case 'video':
      return <FileVideo size={16} className={styles.fileIcon} />;
    case 'image':
      return <FileImage size={16} className={styles.fileIcon} />;
    case 'script':
      return <FileText size={16} className={styles.fileIcon} />;
    default:
      return <File size={16} className={styles.fileIcon} />;
  }
}

export default function FileTreeNode({ node, depth }: FileTreeNodeProps) {
  const { projectDirectory, selectFile, addToActiveContext, refreshFileTree } =
    useWorkspace();
  const {
    selectedPaths,
    focusedPath,
    selectPath,
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
  } = useExplorer();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const isDirectory = node.type === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPaths.has(node.path);
  const isFocused = focusedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const isCut = cutPath === node.path;
  const isDropTarget = dropTargetPath === node.path && isDirectory;
  const isCreatingHere = creatingInPath === node.path;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const multiKey = isMac ? e.metaKey : e.ctrlKey;
      const rangeKey = e.shiftKey;

      selectPath(node.path, multiKey, rangeKey);

      if (isDirectory) {
        toggleExpanded(node.path);
      } else {
        const fileType = getFileType(node.extension);
        selectFile({ path: node.path, name: node.name, type: fileType });
        addToActiveContext({
          path: node.path,
          name: node.name,
          type: fileType,
        });
      }
    },
    [
      isDirectory,
      node,
      selectPath,
      toggleExpanded,
      selectFile,
      addToActiveContext,
    ],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDirectory) {
        startRename(node.path);
      }
    },
    [isDirectory, node.path, startRename],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      selectPath(node.path);
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [node.path, selectPath],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', node.path);
      setDraggedNode(node);
    },
    [node, setDraggedNode],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
    setDropTargetPath(null);
  }, [setDraggedNode, setDropTargetPath]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDirectory || draggedNode?.path === node.path) return;
      // Prevent dropping into itself or its children
      if (draggedNode && node.path.startsWith(`${draggedNode.path}/`)) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
      setDropTargetPath(node.path);
    },
    [isDirectory, draggedNode, node.path, setDropTargetPath],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dropTargetPath === node.path) {
        setDropTargetPath(null);
      }
    },
    [dropTargetPath, node.path, setDropTargetPath],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetPath(null);

      if (!draggedNode || !isDirectory) return;
      if (draggedNode.path === node.path) return;
      if (node.path.startsWith(`${draggedNode.path}/`)) return;

      try {
        if (e.altKey) {
          await window.electron.project.copy(draggedNode.path, node.path);
        } else {
          await window.electron.project.move(draggedNode.path, node.path);
        }
        await refreshFileTree();
        expandPath(node.path);
      } catch (err) {
        console.error('Drop failed:', err);
      }
      setDraggedNode(null);
    },
    [
      draggedNode,
      isDirectory,
      node.path,
      refreshFileTree,
      expandPath,
      setDraggedNode,
      setDropTargetPath,
    ],
  );

  // Context menu actions
  const handleNewFile = useCallback(() => {
    console.log('handleNewFile called for:', node.path);
    startCreate(node.path, 'file');
  }, [node.path, startCreate]);

  const handleNewFolder = useCallback(() => {
    console.log('handleNewFolder called for:', node.path);
    startCreate(node.path, 'folder');
  }, [node.path, startCreate]);

  const handleRename = useCallback(() => {
    startRename(node.path);
  }, [node.path, startRename]);

  const handleDelete = useCallback(async () => {
    if (window.confirm(`Delete "${node.name}"?`)) {
      try {
        await window.electron.project.delete(node.path);
        await refreshFileTree();
      } catch (err) {
        console.error('Delete failed:', err);
      }
    }
  }, [node, refreshFileTree]);

  const handleCopy = useCallback(() => {
    copyToClipboard(node);
  }, [node, copyToClipboard]);

  const handleCut = useCallback(() => {
    cutToClipboard(node);
  }, [node, cutToClipboard]);

  const handlePaste = useCallback(async () => {
    if (!clipboard || !isDirectory) return;
    try {
      if (clipboard.operation === 'copy') {
        await window.electron.project.copy(clipboard.path, node.path);
      } else {
        await window.electron.project.move(clipboard.path, node.path);
        clearClipboard();
      }
      await refreshFileTree();
      expandPath(node.path);
    } catch (err) {
      console.error('Paste failed:', err);
    }
  }, [
    clipboard,
    isDirectory,
    node.path,
    refreshFileTree,
    expandPath,
    clearClipboard,
  ]);

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(node.path);
  }, [node.path]);

  const handleCopyRelativePath = useCallback(() => {
    if (projectDirectory) {
      const relativePath = node.path.replace(`${projectDirectory}/`, '');
      navigator.clipboard.writeText(relativePath);
    }
  }, [node.path, projectDirectory]);

  const handleRevealInFinder = useCallback(() => {
    window.electron.project.revealInFinder(node.path);
  }, [node.path]);

  // Rename submit
  const handleRenameSubmit = useCallback(
    async (newName: string) => {
      if (newName && newName !== node.name) {
        try {
          await window.electron.project.rename(node.path, newName);
          await refreshFileTree();
        } catch (err) {
          console.error('Rename failed:', err);
        }
      }
      cancelRename();
    },
    [node, refreshFileTree, cancelRename],
  );

  // Create submit
  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (!name) {
        cancelCreate();
        return;
      }
      console.log(
        'Creating in:',
        node.path,
        'name:',
        name,
        'type:',
        creatingType,
      );
      try {
        if (creatingType === 'file') {
          await window.electron.project.createFile(node.path, name);
        } else {
          await window.electron.project.createFolder(node.path, name);
        }
        await refreshFileTree();
      } catch (err) {
        console.error('Create failed:', err);
      }
      cancelCreate();
    },
    [node.path, creatingType, refreshFileTree, cancelCreate],
  );

  const paddingLeft = depth * 12 + 8;

  // Get filename without extension for rename
  const getInitialRenameValue = () => {
    if (isDirectory) return node.name;
    const lastDot = node.name.lastIndexOf('.');
    return lastDot > 0 ? node.name.substring(0, lastDot) : node.name;
  };

  return (
    <div className={styles.container} ref={nodeRef}>
      <div
        className={`${styles.node} ${isSelected ? styles.selected : ''} ${isFocused ? styles.focused : ''} ${isCut ? styles.cut : ''} ${isDropTarget ? styles.dropTarget : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-expanded={isDirectory ? isExpanded : undefined}
      >
        {isDirectory && (
          <span className={styles.chevron}>
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </span>
        )}

        {isDirectory && isExpanded && (
          <FolderOpen size={16} className={styles.folderIcon} />
        )}
        {isDirectory && !isExpanded && (
          <Folder size={16} className={styles.folderIcon} />
        )}
        {!isDirectory && getFileIcon(node)}

        {isRenaming ? (
          <InlineInput
            type={isDirectory ? 'folder' : 'file'}
            initialValue={node.name}
            selectRange={[0, getInitialRenameValue().length]}
            onSubmit={handleRenameSubmit}
            onCancel={cancelRename}
          />
        ) : (
          <span className={styles.name}>{node.name}</span>
        )}
      </div>

      {isDirectory && (isExpanded || isCreatingHere) && (
        <div className={styles.children}>
          {isCreatingHere && creatingType && (
            <div style={{ paddingLeft: (depth + 1) * 12 + 8 }}>
              <InlineInput
                key={`create-${node.path}`}
                type={creatingType}
                onSubmit={handleCreateSubmit}
                onCancel={cancelCreate}
              />
            </div>
          )}
          {isExpanded &&
            node.children?.map((child) => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isDirectory={isDirectory}
          onClose={handleCloseContextMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onCopyPath={handleCopyPath}
          onCopyRelativePath={handleCopyRelativePath}
          onRevealInFinder={handleRevealInFinder}
          canPaste={!!clipboard && isDirectory}
        />
      )}
    </div>
  );
}
