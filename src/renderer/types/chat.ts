export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatQuestionOption {
  label: string;
  description?: string;
}

export interface ChatToolCallMeta extends Record<string, unknown> {
  toolCallId?: string;
  toolName: string;
  args?: Record<string, unknown>;
  startedArgs?: Record<string, unknown>;
  status?: 'executing' | 'completed' | 'error' | 'needs_confirmation';
  result?: unknown;
  duration?: number;
  streamingContent?: string;
  mediaPath?: string;
  mediaType?: 'image' | 'video';
}

export interface ChatQuestionMeta extends Record<string, unknown> {
  options?: ChatQuestionOption[];
  questionType?: 'text' | 'confirm' | 'select';
  isConfirmation?: boolean;
  autoApproveTimeoutMs?: number;
  defaultOption?: string;
  selectedResponse?: string;
}

export interface ChatTodoItemMeta extends Record<string, unknown> {
  id?: string;
  task?: string;
  content?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  depth?: number;
  hasSubtasks?: boolean;
  parentId?: string;
}

export interface ChatTodoMeta extends Record<string, unknown> {
  todos: ChatTodoItemMeta[];
  summary?: string;
}

export interface ChatPhaseTransitionMeta extends Record<string, unknown> {
  fromPhase?: string;
  toPhase: string;
  displayName?: string;
  description?: string;
}

export interface ChatContextUsageMeta extends Record<string, unknown> {
  percentage: number;
  promptTokens?: number;
  maxTokens?: number;
  iteration?: number;
  wasCompressed?: boolean;
}

export interface ChatSessionTimerMeta extends Record<string, unknown> {
  productionStartedAt: number;
  productionCompletedAt?: number;
}

export interface ChatNotificationMeta extends Record<string, unknown> {
  level: 'info' | 'warning' | 'error';
}

export type ChatMessageMeta =
  | ChatToolCallMeta
  | ChatQuestionMeta
  | ChatTodoMeta
  | ChatPhaseTransitionMeta
  | ChatContextUsageMeta
  | ChatSessionTimerMeta
  | ChatNotificationMeta
  | Record<string, unknown>;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  type: string;
  content: string;
  timestamp: number;
  author?: string;
  meta?: ChatMessageMeta;
}
