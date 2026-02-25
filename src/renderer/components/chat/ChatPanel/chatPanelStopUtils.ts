import type { ChatMessage } from '../../../types/chat';

export interface ActiveToolCallEntry {
  messageId: string;
  startTime: number;
  toolName: string;
}

export function isCancelAckStatus(
  status: string | undefined,
  message: string | undefined,
): boolean {
  return (
    status === 'ready' &&
    typeof message === 'string' &&
    /task cancelled/i.test(message)
  );
}

export function failExecutingToolCalls(
  messages: ChatMessage[],
  activeEntries: ActiveToolCallEntry[],
  reason: string,
  now: number = Date.now(),
): ChatMessage[] {
  if (messages.length === 0) {
    return messages;
  }

  const activeMessageIds = new Set(activeEntries.map((entry) => entry.messageId));
  const activeStartTimes = new Map(
    activeEntries.map((entry) => [entry.messageId, entry.startTime]),
  );

  return messages.map((message) => {
    const isExecutingToolCard =
      message.type === 'tool_call' &&
      (message.meta?.status === 'executing' ||
        message.meta?.status === 'started');

    if (!activeMessageIds.has(message.id) && !isExecutingToolCard) {
      return message;
    }

    const startedAt = activeStartTimes.get(message.id) ?? now;
    return {
      ...message,
      timestamp: now,
      meta: {
        ...(message.meta || {}),
        status: 'error',
        result: reason,
        duration: Math.max(0, now - startedAt),
      },
    };
  });
}
