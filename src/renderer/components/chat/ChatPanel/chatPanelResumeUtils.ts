export interface RemoteSessionInfo {
  id: string;
  status: 'idle' | 'running' | 'awaiting_input' | 'completed' | 'error';
}

export function shouldConfigureProjectAfterConnect(
  session: RemoteSessionInfo | null,
  hasQueuedConfigureProject: boolean,
): boolean {
  if (session) {
    return false;
  }

  return !hasQueuedConfigureProject;
}

export function getResumedSessionUiState(
  session: RemoteSessionInfo,
): {
  agentStatus: 'idle' | 'thinking' | 'waiting' | 'completed' | 'error';
  statusMessage: string;
  isTaskRunning: boolean;
  notice: string;
} {
  switch (session.status) {
    case 'running':
      return {
        agentStatus: 'thinking',
        statusMessage: 'Reconnected to active session. Waiting for next update...',
        isTaskRunning: true,
        notice: 'Reconnected to active session.',
      };
    case 'awaiting_input':
      return {
        agentStatus: 'waiting',
        statusMessage: 'Reconnected. Session is waiting for your input.',
        isTaskRunning: false,
        notice: 'Reconnected. Session is waiting for your input.',
      };
    case 'completed':
      return {
        agentStatus: 'completed',
        statusMessage: 'Reconnected to completed session.',
        isTaskRunning: false,
        notice: 'Reconnected to completed session.',
      };
    case 'error':
      return {
        agentStatus: 'error',
        statusMessage: 'Reconnected to session in error state.',
        isTaskRunning: false,
        notice: 'Reconnected to session in error state.',
      };
    default:
      return {
        agentStatus: 'idle',
        statusMessage: 'Reconnected to existing session.',
        isTaskRunning: false,
        notice: 'Reconnected to existing session.',
      };
  }
}
