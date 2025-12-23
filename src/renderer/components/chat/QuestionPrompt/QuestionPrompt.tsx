import { useState, useEffect } from 'react';
import { HelpCircle, Clock, Check } from 'lucide-react';
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

  // Normalize options based on type
  const displayOptions = options || (type === 'confirm' ? ['Yes', 'No'] : []);

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

  const handleSelect = (option: string) => {
    if (selectedResponse) return;
    onSelect(option);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <HelpCircle className={styles.icon} />
        <span>Question</span>
      </div>

      <div className={styles.content}>
        <div className={styles.questionText}>{question}</div>

        {displayOptions.length > 0 && (
          <div className={styles.optionsList}>
            {displayOptions.map((option, index) => {
              const isSelected = selectedResponse === option;
              const isRejected =
                selectedResponse && selectedResponse !== option;

              return (
                <button
                  key={index}
                  className={`${styles.optionButton} ${isSelected ? styles.confirmed : ''} ${isRejected ? styles.rejected : ''}`}
                  onClick={() => handleSelect(option)}
                  disabled={!!selectedResponse}
                >
                  <span className={styles.optionIndex}>{index + 1}</span>
                  {option}
                  {isSelected && <Check size={14} className="ml-auto" />}
                </button>
              );
            })}
          </div>
        )}

        {timeLeft !== null && timeLeft > 0 && !selectedResponse && (
          <div className={styles.timer}>
            <Clock size={12} className={styles.timerIcon} />
            <span>
              Auto-approving in {timeLeft}s (Default: {defaultOption})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
