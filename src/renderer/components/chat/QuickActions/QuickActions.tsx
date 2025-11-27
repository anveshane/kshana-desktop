import { Sparkles, FileText, Plus } from 'lucide-react';
import styles from './QuickActions.module.scss';

interface QuickActionsProps {
  onAction: (action: string) => void;
  disabled?: boolean;
}

export default function QuickActions({
  onAction,
  disabled,
}: QuickActionsProps) {
  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.action}
        onClick={() => onAction('generate_concept')}
        disabled={disabled}
      >
        <Sparkles size={14} />
        Generate Concept
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={() => onAction('analyze_script')}
        disabled={disabled}
      >
        <FileText size={14} />
        Analyze Script
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={() => onAction('new_task')}
        disabled={disabled}
      >
        <Plus size={14} />
        New Task
      </button>
    </div>
  );
}
