import { useState, useEffect } from 'react';
import { Check, Clock, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import styles from './QuestionPrompt.module.scss';

export interface QuestionPromptProps {
  question: string;
  options?: string[];
  type?: 'text' | 'confirm' | 'select';
  timeoutSeconds?: number;
  defaultOption?: string;
  onSelect: (response: string) => void;
  selectedResponse?: string; // If already selected
}

export default function QuestionPrompt({
  question,
  options,
  type = 'text',
  timeoutSeconds,
  defaultOption,
  onSelect,
  selectedResponse,
}: QuestionPromptProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(
    timeoutSeconds ?? null,
  );
  const [remarkGfm, setRemarkGfm] = useState<any>(null);

  const displayOptions = options || (type === 'confirm' ? ['Yes', 'No'] : []);

  useEffect(() => {
    import('remark-gfm')
      .then((mod) => {
        setRemarkGfm(() => mod.default);
        return null;
      })
      .catch((err) => {
        console.error('Failed to load remark-gfm for question prompt', err);
      });
  }, []);

  useEffect(() => {
    if (selectedResponse || !timeoutSeconds) return;

    if (timeLeft === null) return;

    if (timeLeft <= 0) {
      if (defaultOption) {
        onSelect(defaultOption);
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, timeoutSeconds, defaultOption, onSelect, selectedResponse]);

  useEffect(() => {
    if (selectedResponse || displayOptions.length === 0) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key < '1' || event.key > '9') return;

      const index = Number(event.key) - 1;
      const option = displayOptions[index];
      if (!option) return;

      event.preventDefault();
      onSelect(option);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [displayOptions, onSelect, selectedResponse]);

  const handleSelect = (option: string) => {
    if (selectedResponse) return;
    onSelect(option);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <HelpCircle className={styles.icon} />
          <span>Question</span>
        </div>
        {timeLeft !== null && timeLeft > 0 && !selectedResponse && (
          <div className={styles.headerTimer}>
            <Clock size={12} className={styles.timerIcon} />
            <span>{timeLeft}s</span>
          </div>
        )}
      </div>

      <div className={styles.content}>
        <span className={styles.stepLabel}>Waiting for your input</span>
        <div className={styles.questionText}>
          <ReactMarkdown remarkPlugins={remarkGfm ? [remarkGfm] : []}>
            {question}
          </ReactMarkdown>
        </div>

        {displayOptions.length > 0 && (
          <div className={styles.optionsList}>
            {displayOptions.map((option, index) => {
              const isSelected = selectedResponse === option;
              const isRejected =
                selectedResponse && selectedResponse !== option;

              return (
                <button
                  key={index}
                  type="button"
                  className={`${styles.optionButton} ${isSelected ? styles.confirmed : ''} ${isRejected ? styles.rejected : ''}`}
                  onClick={() => handleSelect(option)}
                  disabled={!!selectedResponse}
                >
                  <span className={styles.optionIndex}>{index + 1}</span>
                  <span className={styles.optionLabel}>{option}</span>
                  {isSelected && <Check size={14} className={styles.checkIcon} />}
                </button>
              );
            })}
          </div>
        )}

        {displayOptions.length === 0 && (
          <div className={styles.textHint}>
            Type your response in the chat input below and send when ready.
          </div>
        )}

        {timeLeft !== null && timeLeft > 0 && defaultOption && !selectedResponse && (
          <div className={styles.timer}>
            Auto-approving in {timeLeft}s. Default: {defaultOption}
          </div>
        )}
      </div>
    </div>
  );
}
