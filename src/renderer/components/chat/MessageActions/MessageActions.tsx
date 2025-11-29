import { useState } from 'react';
import { Copy, Check, RotateCw } from 'lucide-react';
import styles from './MessageActions.module.scss';

interface MessageActionsProps {
  content: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
}

export default function MessageActions({
  content,
  onRegenerate,
  showRegenerate = false,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy message:', error);
    }
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.actionButton}
        onClick={handleCopy}
        aria-label="Copy message"
        title="Copy message"
      >
        {copied ? (
          <>
            <Check size={14} />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy size={14} />
            <span>Copy</span>
          </>
        )}
      </button>
      {showRegenerate && onRegenerate && (
        <button
          type="button"
          className={styles.actionButton}
          onClick={onRegenerate}
          aria-label="Regenerate response"
          title="Regenerate response"
        >
          <RotateCw size={14} />
          <span>Regenerate</span>
        </button>
      )}
    </div>
  );
}
