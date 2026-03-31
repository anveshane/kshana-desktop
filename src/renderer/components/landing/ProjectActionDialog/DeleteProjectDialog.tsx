import { Trash2, X } from 'lucide-react';
import styles from './ProjectActionDialog.module.scss';

interface DeleteProjectDialogProps {
  isOpen: boolean;
  projectName: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export default function DeleteProjectDialog({
  isOpen,
  projectName,
  error,
  isSubmitting,
  onClose,
  onConfirm,
}: DeleteProjectDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Delete project"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Delete Project</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close delete project dialog"
            disabled={isSubmitting}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>
            Delete <span className={styles.projectName}>{projectName}</span>{' '}
            from disk and remove it from recent projects.
          </p>
          <p className={styles.warning}>This action cannot be undone.</p>
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            <Trash2 size={15} />
            {isSubmitting ? 'Deleting...' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
