import { useEffect, useState } from 'react';
import styles from './StatusBar.module.scss';

/* eslint-disable react/require-default-props */
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
  sessionTimer?: {
    visible: boolean;
    elapsedMs: number;
    running: boolean;
    completed: boolean;
  } | null;
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
  sessionTimer = null,
}: StatusBarProps) {
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionTimer?.visible) {
      setElapsedLabel(null);
      return undefined;
    }

    const localStart = Date.now();
    const updateElapsedLabel = () => {
      const totalMs = sessionTimer.running
        ? sessionTimer.elapsedMs + (Date.now() - localStart)
        : sessionTimer.elapsedMs;
      setElapsedLabel(formatElapsedTimer(Math.floor(totalMs / 1000)));
    };

    updateElapsedLabel();
    if (!sessionTimer.running) {
      return undefined;
    }

    const timer = window.setInterval(updateElapsedLabel, 1000);
    return () => window.clearInterval(timer);
  }, [
    sessionTimer?.completed,
    sessionTimer?.elapsedMs,
    sessionTimer?.running,
    sessionTimer?.visible,
  ]);

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

  const getTimerMetricClass = () => {
    if (sessionTimer?.completed) {
      return styles.metricCompleted;
    }
    if (sessionTimer?.running) {
      return styles.metricRunning;
    }
    return styles.metricPaused;
  };

  return (
    <div className={styles.container}>
      <div className={styles.primary}>
        <div className={`${styles.statusIndicator} ${getStatusClass()}`} />
        {agentName && <span className={styles.agentName}>[{agentName}]</span>}
        {phaseDisplayName && (
          <span className={styles.phaseName} title={currentPhase}>
            {phaseDisplayName}
          </span>
        )}
        <span className={styles.statusText}>{getStatusText()}</span>
      </div>
      {elapsedLabel && (
        <div className={styles.metrics}>
          <span
            className={`${styles.metricChip} ${getTimerMetricClass()}`}
            title="Session timer"
          >
            {elapsedLabel}
          </span>
        </div>
      )}
    </div>
  );
}
