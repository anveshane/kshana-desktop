import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { TimelineItem } from '../../../hooks/useTimelineData';
import styles from './ShotRegenerateModal.module.scss';

interface ShotRegenerateModalProps {
  item: TimelineItem | null;
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => Promise<void> | void;
}

export default function ShotRegenerateModal({
  item,
  isOpen,
  isSubmitting = false,
  onClose,
  onSubmit,
}: ShotRegenerateModalProps) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
      return;
    }

    setPrompt(item?.prompt?.trim() ?? '');
  }, [isOpen, item]);

  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen || !item) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    await onSubmit(prompt.trim());
  };

  const hasMediaContext = Boolean(item.mediaTypeContext && item.mediaPathContext);

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.badge}>
              <Sparkles size={14} />
              <span>Regenerate Shot</span>
            </div>
            <h2 className={styles.title}>
              Regenerate Scene {item.sceneNumber} Shot {item.shotNumber}
            </h2>
            <div className={styles.meta}>Segment ID: {item.segmentId}</div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close regenerate shot modal"
            disabled={isSubmitting}
          >
            <X size={18} />
          </button>
        </div>

        <form className={styles.content} onSubmit={handleSubmit}>
          {hasMediaContext ? (
            <div className={styles.contextCard}>
              <div className={styles.contextLabel}>Current media</div>
              <div className={styles.contextValue}>
                {item.mediaTypeContext}: {item.mediaPathContext}
              </div>
            </div>
          ) : null}

          <label className={styles.label}>
            Shot Prompt
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe how this shot should be regenerated."
              rows={10}
              disabled={isSubmitting}
            />
          </label>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.suggestButton}
              disabled
              aria-label="Suggest prompt"
            >
              Suggest
            </button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
