import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Plus, X } from 'lucide-react';
import styles from './SceneActionPopover.module.scss';

interface SceneActionPopoverProps {
  sceneNumber: number;
  position: { x: number; y: number };
  onClose: () => void;
  onRegenerate: (sceneNumber: number, prompt: string) => void;
  onGenerateNext: (sceneNumber: number, prompt: string) => void;
}

export default function SceneActionPopover({
  sceneNumber,
  position,
  onClose,
  onRegenerate,
  onGenerateNext,
}: SceneActionPopoverProps) {
  const [prompt, setPrompt] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Focus textarea when popover opens
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = position.x;
      let adjustedY = position.y;

      // Adjust horizontal position
      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (adjustedX < 10) {
        adjustedX = 10;
      }

      // Adjust vertical position
      if (rect.bottom > viewportHeight) {
        adjustedY = position.y - rect.height - 10;
      }
      if (adjustedY < 10) {
        adjustedY = 10;
      }

      popoverRef.current.style.left = `${adjustedX}px`;
      popoverRef.current.style.top = `${adjustedY}px`;
    }
  }, [position]);

  const handleRegenerate = () => {
    if (prompt.trim()) {
      onRegenerate(sceneNumber, prompt.trim());
      setPrompt('');
      onClose();
    }
  };

  const handleGenerateNext = () => {
    if (prompt.trim()) {
      onGenerateNext(sceneNumber, prompt.trim());
      setPrompt('');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.header}>
        <span className={styles.title}>Scene {sceneNumber}</span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.promptContent}>
        <label className={styles.label}>
          Instruction for Agent
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Make this scene more dramatic with darker lighting and faster pacing"
            rows={4}
          />
        </label>
        <div className={styles.hint}>
          Press <kbd>Esc</kbd> to cancel
        </div>
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.actionButton}
            onClick={handleRegenerate}
            disabled={!prompt.trim()}
          >
            <RefreshCw size={16} />
            <span>Regenerate</span>
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleGenerateNext}
            disabled={!prompt.trim()}
          >
            <Plus size={16} />
            <span>Generate Next</span>
          </button>
        </div>
      </div>
    </div>
  );
}

