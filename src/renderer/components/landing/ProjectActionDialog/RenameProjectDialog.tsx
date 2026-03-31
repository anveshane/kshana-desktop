import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import styles from './ProjectActionDialog.module.scss';

interface RenameProjectDialogProps {
  isOpen: boolean;
  projectName: string;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (nextName: string) => Promise<void> | void;
}

export default function RenameProjectDialog({
  isOpen,
  projectName,
  error,
  isSubmitting,
  onClose,
  onConfirm,
}: RenameProjectDialogProps) {
  const [name, setName] = useState(projectName);

  const handleConfirm = () => {
    onConfirm(name);
  };

  useEffect(() => {
    if (isOpen) {
      setName(projectName);
    }
  }, [isOpen, projectName]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Rename project"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Rename Project</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close rename project dialog"
            disabled={isSubmitting}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.message}>
            Update the folder name and project title for{' '}
            <span className={styles.projectName}>{projectName}</span>.
          </p>
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Project name"
            disabled={isSubmitting}
          />
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
            className={styles.confirmButton}
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            <Pencil size={15} />
            {isSubmitting ? 'Renaming...' : 'Rename Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
