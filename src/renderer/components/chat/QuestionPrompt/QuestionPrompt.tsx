import { useState, useEffect } from 'react';
import { Check, Clock, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatQuestionOption } from '../../../types/chat';
import styles from './QuestionPrompt.module.scss';

export interface QuestionPromptProps {
  question: string;
  options?: ChatQuestionOption[];
  type?: 'text' | 'confirm' | 'select';
  autoApproveTimeoutMs?: number;
  defaultOption?: string;
  isConfirmation?: boolean;
  onSelect: (response: string) => void;
  selectedResponse?: string; // If already selected
}

export function normalizeAutoApproveSeconds(
  autoApproveTimeoutMs?: number,
): number | null {
  return typeof autoApproveTimeoutMs === 'number'
    ? Math.ceil(autoApproveTimeoutMs / 1000)
    : null;
}

export function buildDisplayOptions(
  options: ChatQuestionOption[] | undefined,
  type: 'text' | 'confirm' | 'select',
  isConfirmation: boolean,
): ChatQuestionOption[] {
  return (
    options ||
    (type === 'confirm' || isConfirmation
      ? [{ label: 'Yes' }, { label: 'No' }]
      : [])
  );
}

export default function QuestionPrompt({
  question,
  options,
  type = 'text',
  autoApproveTimeoutMs,
  defaultOption,
  isConfirmation = false,
  onSelect,
  selectedResponse,
}: QuestionPromptProps) {
  const timeoutSeconds = normalizeAutoApproveSeconds(autoApproveTimeoutMs);
  const [timeLeft, setTimeLeft] = useState<number | null>(
    timeoutSeconds,
  );
  const [remarkGfm, setRemarkGfm] = useState<any>(null);

  const displayOptions = buildDisplayOptions(options, type, isConfirmation);

  useEffect(() => {
    setTimeLeft(timeoutSeconds);
  }, [timeoutSeconds]);

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
    if (selectedResponse || timeoutSeconds === null) return;

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
      onSelect(option.label);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [displayOptions, onSelect, selectedResponse]);

  const handleSelect = (option: ChatQuestionOption) => {
    if (selectedResponse) return;
    onSelect(option.label);
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
              const isSelected = selectedResponse === option.label;
              const isRejected =
                selectedResponse && selectedResponse !== option.label;

              return (
                <button
                  key={index}
                  type="button"
                  className={`${styles.optionButton} ${isSelected ? styles.confirmed : ''} ${isRejected ? styles.rejected : ''}`}
                  onClick={() => handleSelect(option)}
                  disabled={!!selectedResponse}
                >
                  <span className={styles.optionIndex}>{index + 1}</span>
                  <span className={styles.optionContent}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.description && (
                      <span className={styles.optionDescription}>
                        {option.description}
                      </span>
                    )}
                  </span>
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
        {selectedResponse && (
          <div className={styles.selectedState}>
            Submitted: {selectedResponse}
          </div>
        )}
      </div>
    </div>
  );
}
