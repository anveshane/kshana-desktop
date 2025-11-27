import { Monitor } from 'lucide-react';
import styles from './PreviewPlaceholder.module.scss';

export default function PreviewPlaceholder() {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <Monitor size={32} className={styles.icon} />
      </div>
      <p className={styles.text}>No Preview Selected</p>
    </div>
  );
}
