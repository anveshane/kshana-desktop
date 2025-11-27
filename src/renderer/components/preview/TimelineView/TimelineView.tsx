import { Clock } from 'lucide-react';
import styles from './TimelineView.module.scss';

export default function TimelineView() {
  return (
    <div className={styles.container}>
      <div className={styles.placeholder}>
        <Clock size={32} className={styles.icon} />
        <p className={styles.text}>Timeline coming soon</p>
        <p className={styles.subtext}>This feature is under development</p>
      </div>
    </div>
  );
}
