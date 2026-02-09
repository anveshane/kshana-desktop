import { useEffect, useRef } from 'react';
import styles from './TimelineContextMenu.module.scss';

interface TimelineContextMenuProps {
  x: number;
  y: number;
  canUndo?: boolean;
  showVideoEditActions?: boolean;
  onUndo?: () => void;
  onAddTimelineInstruction: () => void;
  onSplitClip?: () => void;
  onTrimLeftToPlayhead?: () => void;
  onClose: () => void;
}

export default function TimelineContextMenu({
  x,
  y,
  canUndo = false,
  showVideoEditActions = false,
  onUndo,
  onAddTimelineInstruction,
  onSplitClip,
  onTrimLeftToPlayhead,
  onClose,
}: TimelineContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }

    if (rect.bottom > viewportHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const handleAction = (action: (() => void) | undefined) => {
    if (!action) return;
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: `${x}px`, top: `${y}px` }}
      role="menu"
      aria-label="Timeline context menu"
    >
      <button
        type="button"
        className={`${styles.menuItem} ${!onUndo || !canUndo ? styles.disabled : ''}`}
        onClick={() => handleAction(onUndo)}
        disabled={!onUndo || !canUndo}
      >
        Undo
      </button>
      <div className={styles.divider} />

      <button
        type="button"
        className={styles.menuItem}
        onClick={() => handleAction(onAddTimelineInstruction)}
      >
        Add Timeline Instruction
      </button>

      {showVideoEditActions && (
        <>
          <div className={styles.divider} />
          <button
            type="button"
            className={`${styles.menuItem} ${!onSplitClip ? styles.disabled : ''}`}
            onClick={() => handleAction(onSplitClip)}
            disabled={!onSplitClip}
          >
            Split Clip
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${!onTrimLeftToPlayhead ? styles.disabled : ''}`}
            onClick={() => handleAction(onTrimLeftToPlayhead)}
            disabled={!onTrimLeftToPlayhead}
          >
            Trim Left to Playhead
          </button>
        </>
      )}
    </div>
  );
}
