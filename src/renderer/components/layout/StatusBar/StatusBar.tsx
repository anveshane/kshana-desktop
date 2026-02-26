import { Settings, HelpCircle } from 'lucide-react';
import styles from './StatusBar.module.scss';

const APP_VERSION = 'v1.0.7';

export default function StatusBar() {
  return (
    <footer className={styles.container}>
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
