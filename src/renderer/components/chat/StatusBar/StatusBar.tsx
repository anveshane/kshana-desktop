import { useEffect, useState } from 'react';
import styles from './StatusBar.module.scss';

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'waiting'
  | 'completed'
  | 'error';

export interface StatusBarProps {
  agentName?: string;
  status: AgentStatus;
  message?: string;
  currentPhase?: string;
  phaseDisplayName?: string;
  contextUsagePercentage?: number;
  contextWasCompressed?: boolean;
  sessionTimerStartedAt?: number;
  sessionTimerCompletedAt?: number;
}

function formatElapsedTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export default function StatusBar({
  agentName,
  status,
  message,
  currentPhase,
  phaseDisplayName,
  contextUsagePercentage,
  contextWasCompressed,
  sessionTimerStartedAt,
  sessionTimerCompletedAt,
}: StatusBarProps) {
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionTimerStartedAt) {
      setElapsedLabel(null);
      return undefined;
    }

    const updateElapsedLabel = () => {
      const endTime = sessionTimerCompletedAt ?? Date.now();
      const totalSeconds = Math.max(
        0,
        Math.floor((endTime - sessionTimerStartedAt) / 1000),
      );
      setElapsedLabel(formatElapsedTimer(totalSeconds));
    };

    updateElapsedLabel();
    if (sessionTimerCompletedAt) {
      return undefined;
    }

    const timer = window.setInterval(updateElapsedLabel, 1000);
    return () => window.clearInterval(timer);
  }, [sessionTimerCompletedAt, sessionTimerStartedAt]);

  const getStatusClass = () => {
    switch (status) {
      case 'idle':
        return styles.ready;
      case 'thinking':
      case 'executing':
        return styles.thinking;
      case 'waiting':
        return styles.ready; // Waiting for user is considered a "ready" state for interaction
      case 'completed':
        return styles.completed;
      case 'error':
        return styles.error;
      default:
        return styles.ready;
    }
  };

  const getStatusText = () => {
    if (message) return message;

    switch (status) {
      case 'idle':
        return 'Ready';
      case 'thinking':
        return 'Thinking...';
      case 'executing':
        return 'Executing tool...';
      case 'waiting':
        return 'Waiting for input...';
      case 'completed':
        return 'Task completed';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.primary}>
        <div className={`${styles.statusIndicator} ${getStatusClass()}`} />
        {agentName && <span className={styles.agentName}>[{agentName}]</span>}
        {phaseDisplayName && (
          <span className={styles.phaseName}>{phaseDisplayName}</span>
        )}
        <span className={styles.statusText}>{getStatusText()}</span>
      </div>
      <div className={styles.metrics}>
        {elapsedLabel && (
          <span
            className={`${styles.metricChip} ${sessionTimerCompletedAt ? styles.metricCompleted : ''}`}
            title="Session timer"
          >
            {elapsedLabel}
          </span>
        )}
        {typeof contextUsagePercentage === 'number' && (
          <span
            className={`${styles.metricChip} ${
              contextUsagePercentage >= 85
                ? styles.metricDanger
                : contextUsagePercentage >= 65
                  ? styles.metricWarning
                  : styles.metricNormal
            }`}
            title={
              contextWasCompressed
                ? 'Context usage (recently compressed)'
                : 'Context usage'
            }
          >
            CTX {Math.round(contextUsagePercentage)}%
            {contextWasCompressed ? ' compressed' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
