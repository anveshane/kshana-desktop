import type { AgentStatus } from '../StatusBar';

const REMOTE_PROJECT_FS_DISCONNECT_PATTERN =
  /Remote project filesystem is not connected/i;

export function getRemoteFsReconnectMessage(reason: unknown): string | null {
  if (typeof reason !== 'string') {
    return null;
  }

  if (!REMOTE_PROJECT_FS_DISCONNECT_PATTERN.test(reason)) {
    return null;
  }

  return 'Project connection was interrupted. Reconnect the chat, then retry the last step.';
}

interface PostToolUiStateArgs {
  toolStatus: 'completed' | 'error';
  currentAgentStatus: AgentStatus;
  isTaskRunning: boolean;
  hasActiveQuestion: boolean;
  hasOtherActiveTools: boolean;
  toolMessage?: string;
}

export function getPostToolUiState({
  toolStatus,
  currentAgentStatus,
  isTaskRunning,
  hasActiveQuestion,
  hasOtherActiveTools,
  toolMessage,
}: PostToolUiStateArgs): {
  agentStatus: AgentStatus;
  statusMessage: string;
  isTaskRunning: boolean;
} | null {
  if (isTaskRunning || hasOtherActiveTools) {
    return null;
  }

  if (toolStatus === 'error') {
    return {
      agentStatus: 'error',
      statusMessage: toolMessage || 'Tool execution failed',
      isTaskRunning: false,
    };
  }

  if (hasActiveQuestion) {
    return {
      agentStatus: 'waiting',
      statusMessage: 'Waiting for your input',
      isTaskRunning: false,
    };
  }

  if (currentAgentStatus === 'thinking') {
    return {
      agentStatus: 'idle',
      statusMessage: 'Ready',
      isTaskRunning: false,
    };
  }

  return null;
}
