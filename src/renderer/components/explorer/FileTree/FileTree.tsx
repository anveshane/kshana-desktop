import React, { useEffect, useCallback, useRef } from 'react';
import type { FileNode } from '../../../../shared/fileSystemTypes';
import { getFileType } from '../../../../shared/fileSystemTypes';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useExplorer } from '../../../contexts/ExplorerContext';
import FileTreeNode from '../FileTreeNode/FileTreeNode';
import InlineInput from '../InlineInput/InlineInput';
import styles from './FileTree.module.scss';

interface FileTreeProps {
  root: FileNode;
}

export default function FileTree({ root }: FileTreeProps) {
  const { selectFile, addToActiveContext, refreshFileTree, loadDirectory } =
    useWorkspace();
  const {
    selectedPaths,
    focusedPath,
    selectPath,
    setFocusedPath,
    expandedPaths,
    toggleExpanded,
    flatNodes,
    setFlatNodes,
    clipboard,
    copyToClipboard,
    cutToClipboard,
    clearClipboard,
    startRename,
    renamingPath,
    creatingInPath,
    creatingType,
    cancelCreate,
  } = useExplorer();

  const containerRef = useRef<HTMLDivElement>(null);

  // Build flat list of visible nodes for keyboard navigation
  useEffect(() => {
    const buildFlatList = (
      node: FileNode,
      list: FileNode[] = [],
    ): FileNode[] => {
      if (node.children) {
        for (const child of node.children) {
          list.push(child);
          if (child.type === 'directory' && expandedPaths.has(child.path)) {
            buildFlatList(child, list);
          }
        }
      }
      return list;
    };
    setFlatNodes(buildFlatList(root));
  }, [root, expandedPaths, setFlatNodes]);

  // Load content for expanded directories that haven't been loaded yet
  useEffect(() => {
    // Check root first (though it should be loaded)
    if (root.type === 'directory' && !root.children) {
      loadDirectory(root.path);
      return;
    }

    // Check visible nodes
    flatNodes.forEach((node) => {
      if (
        node.type === 'directory' &&
        expandedPaths.has(node.path) &&
        !node.children
      ) {
        loadDirectory(node.path);
      }
    });
  }, [expandedPaths, flatNodes, root, loadDirectory]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (renamingPath) return; // Don't handle when renaming

      const currentIndex = flatNodes.findIndex((n) => n.path === focusedPath);
      const currentNode = flatNodes[currentIndex];

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < flatNodes.length - 1) {
            const nextNode = flatNodes[currentIndex + 1];
            selectPath(nextNode.path, e.metaKey || e.ctrlKey, e.shiftKey);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            const prevNode = flatNodes[currentIndex - 1];
            selectPath(prevNode.path, e.metaKey || e.ctrlKey, e.shiftKey);
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (currentNode?.type === 'directory') {
            if (!expandedPaths.has(currentNode.path)) {
              toggleExpanded(currentNode.path);
            } else if (currentNode.children?.length) {
              // Move to first child
              selectPath(currentNode.children[0].path);
            }
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (
            currentNode?.type === 'directory' &&
            expandedPaths.has(currentNode.path)
          ) {
            toggleExpanded(currentNode.path);
          } else if (currentNode) {
            // Move to parent
            const parentPath = currentNode.path.substring(
              0,
              currentNode.path.lastIndexOf('/'),
            );
            const parentNode = flatNodes.find((n) => n.path === parentPath);
            if (parentNode) {
              selectPath(parentNode.path);
            }
          }
          break;

        case 'Enter':
          e.preventDefault();
          if (currentNode) {
            if (currentNode.type === 'directory') {
              toggleExpanded(currentNode.path);
            } else {
              const fileType = getFileType(currentNode.extension);
              selectFile({
                path: currentNode.path,
                name: currentNode.name,
                type: fileType,
              });
              addToActiveContext({
                path: currentNode.path,
                name: currentNode.name,
                type: fileType,
              });
            }
          }
          break;

        case 'F2':
          e.preventDefault();
          if (currentNode) {
            startRename(currentNode.path);
          }
          break;

        case 'Delete':
        case 'Backspace':
          if (!e.metaKey && !e.ctrlKey && currentNode) {
            e.preventDefault();
            if (window.confirm(`Delete "${currentNode.name}"?`)) {
              await window.electron.project.delete(currentNode.path);
              await refreshFileTree();
            }
          }
          break;

        case 'c':
          if ((e.metaKey || e.ctrlKey) && currentNode) {
            e.preventDefault();
            copyToClipboard(currentNode);
          }
          break;

        case 'x':
          if ((e.metaKey || e.ctrlKey) && currentNode) {
            e.preventDefault();
            cutToClipboard(currentNode);
          }
          break;

        case 'v':
          if ((e.metaKey || e.ctrlKey) && clipboard && currentNode) {
            e.preventDefault();
            const targetDir =
              currentNode.type === 'directory'
                ? currentNode.path
                : currentNode.path.substring(
                    0,
                    currentNode.path.lastIndexOf('/'),
                  );

            if (clipboard.operation === 'copy') {
              await window.electron.project.copy(clipboard.path, targetDir);
            } else {
              await window.electron.project.move(clipboard.path, targetDir);
              clearClipboard();
            }
            await refreshFileTree();
          }
          break;

        case 'a':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            // Select all visible nodes
            flatNodes.forEach((n) => selectPath(n.path, true, false));
          }
          break;

        default:
          break;
      }
    },
    [
      flatNodes,
      focusedPath,
      expandedPaths,
      selectPath,
      toggleExpanded,
      selectFile,
      addToActiveContext,
      startRename,
      refreshFileTree,
      clipboard,
      copyToClipboard,
      cutToClipboard,
      clearClipboard,
      renamingPath,
    ],
  );

  const handleCreateSubmit = useCallback(
    async (name: string) => {
      if (!name) {
        cancelCreate();
        return;
      }

      console.log(
        'Creating at ROOT:',
        root.path,
        'name:',
        name,
        'type:',
        creatingType,
      );

      try {
        if (creatingType === 'file') {
          await window.electron.project.createFile(root.path, name);
        } else {
          await window.electron.project.createFolder(root.path, name);
        }
        await refreshFileTree();
      } catch (err) {
        console.error('Create failed:', err);
      }
      cancelCreate();
    },
    [root.path, creatingType, refreshFileTree, cancelCreate],
  );

  const isCreatingAtRoot = creatingInPath === root.path;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="tree"
    >
      {isCreatingAtRoot && creatingType && (
        <InlineInput
          key="root-create"
          type={creatingType}
          onSubmit={handleCreateSubmit}
          onCancel={cancelCreate}
        />
      )}
      {root.children?.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
