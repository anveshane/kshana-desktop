import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './MarkerPromptPopover.module.scss';

const modKey = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'Cmd' : 'Ctrl';

interface MarkerPromptPopoverProps {
  position: number; // in seconds
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

export default function MarkerPromptPopover({
  position,
  onClose,
  onSubmit,
}: MarkerPromptPopoverProps) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus input when popover opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e);
    }
  };

  // Format position as time
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popover} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Add Timeline Instruction</h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className={styles.content}>
          <div className={styles.positionInfo}>
            Position:{' '}
            <span className={styles.timeValue}>{formatTime(position)}</span>
          </div>
          <form onSubmit={handleSubmit}>
            <label className={styles.label}>
              Instruction for Agent
              <textarea
                ref={inputRef}
                className={styles.textarea}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Change from here to have a wide angle shot of an eagle flying in the sky looking down at the war"
                rows={4}
              />
            </label>
            <div className={styles.hint}>
              Press <kbd>{modKey}+Enter</kbd> to submit, <kbd>Esc</kbd> to
              cancel
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={!prompt.trim()}
              >
                Add Marker
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
