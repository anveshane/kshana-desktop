import { FormEvent, useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import styles from './ChatInput.module.scss';

interface ChatInputProps {
  disabled?: boolean;
  placeholder?: string;
  onSend: (message: string) => void;
}

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const LINE_HEIGHT = 24; // Approximate line height in pixels

export default function ChatInput({
  disabled = false,
  placeholder = 'Describe your story, ask for a storyboard, or request assets…',
  onSend,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [rows, setRows] = useState(MIN_ROWS);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to calculate scroll height
      textareaRef.current.style.height = 'auto';
      const { scrollHeight } = textareaRef.current;
      const newRows = Math.min(
        Math.max(MIN_ROWS, Math.ceil(scrollHeight / LINE_HEIGHT)),
        MAX_ROWS,
      );
      setRows(newRows);
      // Set height based on scroll height, but cap at max height
      const maxHeight = MAX_ROWS * LINE_HEIGHT;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) {
      return;
    }
    onSend(value.trim());
    setValue('');
    setRows(MIN_ROWS);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (event.shiftKey || isModifierPressed) {
        // Shift+Enter or Cmd/Ctrl+Enter = send
        event.preventDefault();
        handleSubmit(event as unknown as FormEvent);
      }
      // Enter alone = new line (default behavior)
    } else if (
      event.key === 'Escape' &&
      document.activeElement === textareaRef.current
    ) {
      // Esc = clear input
      setValue('');
      setRows(MIN_ROWS);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={styles.textarea}
          aria-label="Chat input"
        />
        <button
          type="submit"
          disabled={!canSend}
          className={styles.sendButton}
          aria-label="Send message"
          title="Send message (Shift+Enter or Cmd/Ctrl+Enter)"
        >
          <Send size={16} />
        </button>
      </div>
      <div className={styles.hint}>
        Press <kbd>Enter</kbd> for new line, <kbd>Shift+Enter</kbd> or{' '}
        <kbd>Cmd+Enter</kbd> to send
      </div>
    </form>
  );
}
