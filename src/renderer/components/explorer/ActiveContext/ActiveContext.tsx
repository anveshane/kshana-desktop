import {
  X,
  FileText,
  FileAudio,
  FileVideo,
  FileImage,
  File,
} from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type { SelectedFile } from '../../../types/workspace';
import styles from './ActiveContext.module.scss';

function getContextIcon(type: SelectedFile['type']) {
  switch (type) {
    case 'audio':
      return <FileAudio size={14} />;
    case 'video':
      return <FileVideo size={14} />;
    case 'image':
      return <FileImage size={14} />;
    case 'script':
      return <FileText size={14} />;
    default:
      return <File size={14} />;
  }
}

export default function ActiveContext() {
  const { activeContextFiles, removeFromActiveContext } = useWorkspace();

  if (activeContextFiles.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>ACTIVE CONTEXT</span>
      </div>
      <ul className={styles.list}>
        {activeContextFiles.map((file) => (
          <li key={file.path} className={styles.item}>
            {getContextIcon(file.type)}
            <span className={styles.name}>{file.name}</span>
            <button
              type="button"
              className={styles.removeButton}
              onClick={() => removeFromActiveContext(file.path)}
              title="Remove from context"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
