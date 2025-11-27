import { Settings, HelpCircle } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import styles from './StatusBar.module.scss';

const APP_VERSION = 'v1.0.4';

export default function StatusBar() {
  const { connectionState } = useWorkspace();

  return (
    <footer className={styles.container}>
      <div className={styles.left}>
        <div className={styles.statusItem}>
          <span
            className={`${styles.statusDot} ${
              connectionState.lmStudio === 'connected' ? styles.connected : ''
            }`}
          />
          <span className={styles.statusLabel}>
            LM Studio:{' '}
            {connectionState.lmStudio === 'connected'
              ? 'Connected'
              : 'Disconnected'}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span
            className={`${styles.statusDot} ${
              connectionState.comfyUI === 'connected' ? styles.connected : ''
            }`}
          />
          <span className={styles.statusLabel}>
            ComfyUI:{' '}
            {connectionState.comfyUI === 'connected'
              ? 'Connected'
              : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className={styles.right}>
        <span className={styles.version}>{APP_VERSION}</span>
        <button type="button" className={styles.iconButton} title="Help">
          <HelpCircle size={14} />
        </button>
        <button type="button" className={styles.iconButton} title="Settings">
          <Settings size={14} />
        </button>
      </div>
    </footer>
  );
}
