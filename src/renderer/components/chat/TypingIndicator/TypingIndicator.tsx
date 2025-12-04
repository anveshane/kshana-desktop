import styles from './TypingIndicator.module.scss';

export default function TypingIndicator() {
  return (
    <div className={styles.container} aria-label="Assistant is typing">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </div>
  );
}
