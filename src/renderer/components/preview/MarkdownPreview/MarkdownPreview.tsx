import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './MarkdownPreview.module.scss';

interface MarkdownPreviewProps {
  isOpen: boolean;
  title: string;
  content: string;
  onClose: () => void;
}

export default function MarkdownPreview({
  isOpen,
  title,
  content,
  onClose,
}: MarkdownPreviewProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        <div className={styles.content}>
          <ReactMarkdown className={styles.markdown}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
