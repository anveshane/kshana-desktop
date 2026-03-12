export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatQuestionOption {
  label: string;
  description?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  type: string;
  content: string;
  timestamp: number;
  author?: string;
  meta?: Record<string, unknown>;
}
