import type { ChatMessage } from '../../../types/chat';

export interface ActiveToolCallTrackerEntry {
  messageId: string;
  startTime: number;
  toolName: string;
}

const MEDIA_TOOL_CARD_STREAM_NAMES = new Set([
  'generate_image',
  'generate_video',
  'generate_video_from_image',
]);

export const normalizeComparableChatText = (value: string): string => {
  return value.trim().replace(/\r\n/g, '\n');
};

const normalizeTodoLogicalContent = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').toLowerCase();
};

export function normalizeTodoUpdatePayload<T extends Record<string, unknown>>(
  todos: T[] | null | undefined,
): T[] {
  if (!Array.isArray(todos) || todos.length === 0) {
    return [];
  }

  const seenIds = new Set<string>();
  const seenLogicalKeys = new Set<string>();
  const deduped: T[] = [];

  for (let index = todos.length - 1; index >= 0; index -= 1) {
    const todo = todos[index];
    if (!todo || typeof todo !== 'object') {
      continue;
    }

    const id = typeof todo.id === 'string' ? todo.id.trim() : '';
    if (id) {
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
    }

    const logicalContent = normalizeTodoLogicalContent(
      todo.content ?? todo.task ?? id,
    );
    const depth = typeof todo.depth === 'number' ? todo.depth : 0;
    const logicalKey = logicalContent ? `${logicalContent}::${depth}` : '';

    if (logicalKey) {
      if (seenLogicalKeys.has(logicalKey)) {
        continue;
      }
      seenLogicalKeys.add(logicalKey);
    }

    deduped.unshift(todo);
  }

  return deduped;
}

export function findActiveToolCallEntry(
  activeToolCalls: Map<string, ActiveToolCallTrackerEntry>,
  toolCallId?: string,
  toolName?: string,
): { key: string; entry: ActiveToolCallTrackerEntry } | null {
  if (toolCallId) {
    const direct = activeToolCalls.get(toolCallId);
    if (direct) {
      return { key: toolCallId, entry: direct };
    }
  }

  if (toolName) {
    for (const [key, entry] of activeToolCalls.entries()) {
      if (entry.toolName === toolName) {
        return { key, entry };
      }
    }
  }

  if (activeToolCalls.size === 1) {
    const singleEntry = activeToolCalls.entries().next().value as
      | [string, ActiveToolCallTrackerEntry]
      | undefined;
    if (singleEntry) {
      return { key: singleEntry[0], entry: singleEntry[1] };
    }
  }

  return null;
}

export function shouldStreamToToolCallCard(toolName?: string): boolean {
  if (!toolName) {
    return false;
  }

  return MEDIA_TOOL_CARD_STREAM_NAMES.has(toolName);
}

export function mergeToolStreamingContent(
  currentContent: unknown,
  nextChunk: string,
  options?: { reset?: boolean },
): string {
  if (options?.reset) {
    return nextChunk;
  }

  return `${typeof currentContent === 'string' ? currentContent : ''}${nextChunk}`;
}

interface ShouldSuppressAgentResponseArgs {
  output: string;
  status?: string;
  lastFinalizedStreamText?: string | null;
  messages: ChatMessage[];
}

export function shouldSuppressAgentResponse({
  output,
  status,
  lastFinalizedStreamText,
  messages,
}: ShouldSuppressAgentResponseArgs): boolean {
  const normalizedOutput = normalizeComparableChatText(output);
  if (!normalizedOutput) {
    return true;
  }

  if (status === 'awaiting_input') {
    return true;
  }

  if (
    lastFinalizedStreamText &&
    normalizeComparableChatText(lastFinalizedStreamText) === normalizedOutput
  ) {
    return true;
  }

  // Fallback: if streaming already rendered the same text, suppress the final agent_response.
  // This protects against timing/race conditions where lastFinalizedStreamTextRef is out of sync.
  return messages.some((message) => {
    if (message.type === 'agent_question') {
      return (
        normalizeComparableChatText(message.content) === normalizedOutput
      );
    }

    if (message.role !== 'assistant') return false;

    if (
      message.type === 'agent_response' ||
      message.type === 'agent_text' ||
      message.type === 'stream_chunk'
    ) {
      return normalizeComparableChatText(message.content) === normalizedOutput;
    }

    return false;
  });
}
