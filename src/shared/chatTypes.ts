export const CHAT_SNAPSHOT_VERSION = 1;
export const MAX_PERSISTED_CHAT_MESSAGES = 1000;

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface PersistedChatMessage {
  id: string;
  role: ChatMessageRole;
  type: string;
  content: string;
  timestamp: number;
  author?: string;
  meta?: Record<string, unknown>;
}

export interface ChatSnapshotUiState {
  agentStatus: string;
  agentName: string;
  statusMessage: string;
  currentPhase?: string;
  phaseDisplayName?: string;
  hasUserSentMessage: boolean;
  isTaskRunning: boolean;
}

export interface ChatSnapshot {
  version: number;
  projectDirectory: string;
  sessionId: string | null;
  messages: PersistedChatMessage[];
  uiState: ChatSnapshotUiState;
}

export interface ChatExportPayload {
  exportedAt: string;
  projectDirectory: string;
  sessionId: string | null;
  messages: PersistedChatMessage[];
}

export interface ChatExportResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}
