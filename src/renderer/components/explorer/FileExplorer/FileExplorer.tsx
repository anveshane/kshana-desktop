import {
  FolderOpen,
  MoreHorizontal,
  FilePlus,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { ExplorerProvider, useExplorer } from '../../../contexts/ExplorerContext';
import FileTree from '../FileTree/FileTree';
import ActiveContext from '../ActiveContext/ActiveContext';
import styles from './FileExplorer.module.scss';

function FileExplorerContent() {
  const { projectName, projectDirectory, fileTree, isLoading, refreshFileTree } =
    useWorkspace();
  const { startCreate, focusedPath, flatNodes } = useExplorer();

  const getCreationTarget = () => {
    if (!focusedPath || !projectDirectory) return projectDirectory;

    const node = flatNodes.find((n) => n.path === focusedPath);
    if (!node) return projectDirectory;

    if (node.type === 'directory') {
      return node.path;
    }

    // If it's a file, return the parent directory
    return node.path.substring(0, node.path.lastIndexOf('/'));
  };

  const handleNewFile = () => {
    const target = getCreationTarget();
    if (target) {
      startCreate(target, 'file');
    }
  };

  const handleNewFolder = () => {
    const target = getCreationTarget();
    if (target) {
      startCreate(target, 'folder');
    }
  };

  const handleRefresh = () => {
    refreshFileTree();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>EXPLORER</span>
        <button
          type="button"
          className={styles.menuButton}
          title="More options"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {fileTree && projectName ? (
        <>
          <div className={styles.projectHeader}>
            <div className={styles.projectInfo}>
              <FolderOpen size={14} className={styles.projectIcon} />
              <span className={styles.projectName}>
                {projectName.toUpperCase()}
              </span>
            </div>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.toolbarButton}
                title="New File"
                onClick={handleNewFile}
              >
                <FilePlus size={14} />
              </button>
              <button
                type="button"
                className={styles.toolbarButton}
                title="New Folder"
                onClick={handleNewFolder}
              >
                <FolderPlus size={14} />
              </button>
              <button
                type="button"
                className={styles.toolbarButton}
                title="Refresh"
                onClick={handleRefresh}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div className={styles.treeContainer}>
            <FileTree root={fileTree} />
          </div>
        </>
      ) : (
        <div className={styles.placeholder}>
          <FolderOpen size={48} className={styles.placeholderIcon} />
          <p className={styles.placeholderText}>
            {isLoading ? 'Loading...' : 'No Project Open'}
          </p>
        </div>
      )}

      <ActiveContext />
    </div>
  );
}

export default function FileExplorer() {
  return (
    <ExplorerProvider>
      <FileExplorerContent />
    </ExplorerProvider>
  );
}
