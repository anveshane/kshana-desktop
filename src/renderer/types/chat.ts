export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  type: string;
  content: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}
