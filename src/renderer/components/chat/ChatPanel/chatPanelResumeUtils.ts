export interface RemoteSessionInfo {
  id: string;
  status: 'idle' | 'running' | 'awaiting_input' | 'completed' | 'error';
  configured?: boolean;
  autonomousMode?: boolean;
}

export function shouldConfigureProjectAfterConnect(
  session: RemoteSessionInfo | null,
  hasQueuedConfigureProject: boolean,
): boolean {
  if (session) {
    return !session.configured && !hasQueuedConfigureProject;
  }

  return !hasQueuedConfigureProject;
}

export function getResumedSessionUiState(session: RemoteSessionInfo): {
  agentStatus: 'idle' | 'thinking' | 'waiting' | 'completed' | 'error';
  statusMessage: string;
  isTaskRunning: boolean;
  notice: string | null;
  autonomousMode: boolean;
} {
  const autonomousMode = Boolean(session.autonomousMode);

  switch (session.status) {
    case 'running':
      return {
        agentStatus: 'thinking',
        statusMessage:
          'Reconnected to active session. Waiting for next update...',
        isTaskRunning: true,
        notice: 'Reconnected to active session.',
        autonomousMode,
      };
    case 'awaiting_input':
      return {
        agentStatus: 'waiting',
        statusMessage: 'Reconnected. Session is waiting for your input.',
        isTaskRunning: false,
        notice: 'Reconnected. Session is waiting for your input.',
        autonomousMode,
      };
    case 'completed':
      return {
        agentStatus: 'completed',
        statusMessage: 'Reconnected to completed session.',
        isTaskRunning: false,
        notice: 'Reconnected to completed session.',
        autonomousMode,
      };
    case 'error':
      return {
        agentStatus: 'error',
        statusMessage: 'Reconnected to session in error state.',
        isTaskRunning: false,
        notice: 'Reconnected to session in error state.',
        autonomousMode,
      };
    default:
      return {
        agentStatus: 'idle',
        statusMessage: 'Ready',
        isTaskRunning: false,
        notice: null,
        autonomousMode,
      };
  }
}
