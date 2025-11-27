import { useState, useCallback } from 'react';
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
import styles from './FileTreeNode.module.scss';

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
}

function getFileIcon(node: FileNode) {
  if (node.type === 'directory') {
    return null; // Handled separately with open/closed state
  }

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
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const { selectedFile, selectFile, addToActiveContext } = useWorkspace();

  const isDirectory = node.type === 'directory';
  const isSelected = selectedFile?.path === node.path;

  const handleClick = useCallback(() => {
    if (isDirectory) {
      setIsExpanded((prev) => !prev);
    } else {
      const fileType = getFileType(node.extension);
      selectFile({ path: node.path, name: node.name, type: fileType });
      addToActiveContext({ path: node.path, name: node.name, type: fileType });
    }
  }, [isDirectory, node, selectFile, addToActiveContext]);

  const paddingLeft = depth * 12 + 8;

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={`${styles.node} ${isSelected ? styles.selected : ''}`}
        style={{ paddingLeft }}
        onClick={handleClick}
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

        <span className={styles.name}>{node.name}</span>
      </button>

      {isDirectory && isExpanded && node.children && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
