import { FolderOpen, MoreHorizontal } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import FileTree from '../FileTree/FileTree';
import ActiveContext from '../ActiveContext/ActiveContext';
import styles from './FileExplorer.module.scss';

export default function FileExplorer() {
  const { projectName, fileTree, isLoading } = useWorkspace();

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
            <FolderOpen size={14} className={styles.projectIcon} />
            <span className={styles.projectName}>
              {projectName.toUpperCase()}
            </span>
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
