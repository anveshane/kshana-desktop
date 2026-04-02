import { useEffect, useRef } from 'react';
import styles from './TimelineContextMenu.module.scss';

interface TimelineContextMenuProps {
  x: number;
  y: number;
  canUndo?: boolean;
  canGenerateWordCaptions?: boolean;
  isGeneratingWordCaptions?: boolean;
  showRegenerateShotAction?: boolean;
  showVideoEditActions?: boolean;
  showDeleteAudioAction?: boolean;
  onUndo?: () => void;
  onRegenerateShot?: () => void;
  onGenerateWordCaptions?: () => void;
  onSplitClip?: () => void;
  onTrimLeftToPlayhead?: () => void;
  onDeleteAudio?: () => void;
  onClose: () => void;
}

export default function TimelineContextMenu({
  x,
  y,
  canUndo = false,
  canGenerateWordCaptions = false,
  isGeneratingWordCaptions = false,
  showRegenerateShotAction = false,
  showVideoEditActions = false,
  showDeleteAudioAction = false,
  onUndo,
  onRegenerateShot,
  onGenerateWordCaptions,
  onSplitClip,
  onTrimLeftToPlayhead,
  onDeleteAudio,
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

      {showRegenerateShotAction && (
        <button
          type="button"
          className={styles.menuItem}
          onClick={() => handleAction(onRegenerateShot)}
        >
          Regenerate Shot
        </button>
      )}

      <button
        type="button"
        className={`${styles.menuItem} ${!onGenerateWordCaptions || !canGenerateWordCaptions || isGeneratingWordCaptions ? styles.disabled : ''}`}
        onClick={() => handleAction(onGenerateWordCaptions)}
        disabled={
          !onGenerateWordCaptions ||
          !canGenerateWordCaptions ||
          isGeneratingWordCaptions
        }
      >
        {isGeneratingWordCaptions
          ? 'Generating Word Captions...'
          : 'Generate Word Captions'}
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

      {showDeleteAudioAction && (
        <>
          <div className={styles.divider} />
          <button
            type="button"
            className={`${styles.menuItem} ${styles.destructive} ${!onDeleteAudio ? styles.disabled : ''}`}
            onClick={() => handleAction(onDeleteAudio)}
            disabled={!onDeleteAudio}
          >
            Delete Audio
          </button>
        </>
      )}
    </div>
  );
}
