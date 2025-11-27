import { useState, useRef, useEffect } from 'react';
import { File, Folder } from 'lucide-react';
import styles from './InlineInput.module.scss';

interface InlineInputProps {
  type: 'file' | 'folder';
  initialValue?: string;
  selectRange?: [number, number];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export default function InlineInput({
  type,
  initialValue = '',
  selectRange,
  onSubmit,
  onCancel,
}: InlineInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (selectRange) {
        inputRef.current.setSelectionRange(selectRange[0], selectRange[1]);
      } else {
        inputRef.current.select();
      }
    }
  }, [selectRange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value.trim());
      } else {
        onCancel();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    if (value.trim() && value.trim() !== initialValue) {
      onSubmit(value.trim());
    } else {
      onCancel();
    }
  };

  return (
    <div className={styles.container} onClick={(e) => e.stopPropagation()}>
      {type === 'file' ? (
        <File size={14} className={styles.icon} />
      ) : (
        <Folder size={14} className={styles.icon} />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={styles.input}
        placeholder={type === 'file' ? 'filename.ext' : 'folder-name'}
      />
    </div>
  );
}
