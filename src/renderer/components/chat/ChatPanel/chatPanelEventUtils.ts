import type {
  ChatQuestionOption,
  ChatTodoItemMeta,
  ChatToolCallMeta,
} from '../../../types/chat';

export interface ActiveToolCallEntry {
  messageId: string;
  startTime: number;
  toolName: string;
  startedArgs: Record<string, unknown>;
  agentName?: string;
  knownToolCallIds?: string[];
  isProvisional?: boolean;
}

export interface NormalizedQuestionPayload {
  question: string;
  options: ChatQuestionOption[];
  questionType: 'text' | 'confirm' | 'select';
  isConfirmation: boolean;
  autoApproveTimeoutMs?: number;
  defaultOption?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeQuestionPayload(
  data: Record<string, unknown>,
): NormalizedQuestionPayload {
  const question = typeof data.question === 'string' ? data.question : '';
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  const isConfirmation = Boolean(data.isConfirmation);
  const questionType =
    typeof data.questionType === 'string'
      ? (data.questionType as 'text' | 'confirm' | 'select')
      : isConfirmation
        ? 'confirm'
        : rawOptions.length > 0
          ? 'select'
          : 'text';

  const options = rawOptions
    .map((option): ChatQuestionOption | null => {
      if (typeof option === 'string') {
        return { label: option };
      }
      if (isRecord(option) && typeof option.label === 'string') {
        return {
          label: option.label,
          description:
            typeof option.description === 'string'
              ? option.description
              : undefined,
        };
      }
      return null;
    })
    .filter((option): option is ChatQuestionOption => option !== null);

  const normalizedOptions =
    options.length > 0
      ? options
      : isConfirmation
        ? [{ label: 'Yes' }, { label: 'No' }]
        : [];

  const autoApproveTimeoutMs =
    typeof data.autoApproveTimeoutMs === 'number' &&
    Number.isFinite(data.autoApproveTimeoutMs)
      ? data.autoApproveTimeoutMs
      : typeof data.timeout === 'number' && Number.isFinite(data.timeout)
        ? data.timeout * 1000
        : undefined;

  const defaultOption =
    typeof data.defaultOption === 'string'
      ? data.defaultOption
      : typeof data.default === 'string'
        ? data.default
        : normalizedOptions[0]?.label;

  return {
    question,
    options: normalizedOptions,
    questionType,
    isConfirmation,
    autoApproveTimeoutMs,
    defaultOption,
  };
}

export function summarizeTodoUpdate(todos: ChatTodoItemMeta[]): string {
  const visibleTodos = todos.filter((todo) => todo.task || todo.content);
  if (visibleTodos.length === 0) {
    return 'Task progress updated';
  }

  const completedCount = visibleTodos.filter(
    (todo) => todo.status === 'completed',
  ).length;
  const inProgressTodo = visibleTodos.find(
    (todo) => todo.status === 'in_progress',
  );
  const activeLabel =
    inProgressTodo?.task ||
    inProgressTodo?.content ||
    (completedCount === visibleTodos.length
      ? 'Run complete'
      : 'Waiting for next task');

  return `Task progress ${completedCount}/${visibleTodos.length}: ${activeLabel}`;
}

export function buildPhaseTransitionSummary(params: {
  fromPhase?: string;
  toPhase: string;
  displayName?: string;
  description?: string;
}): string {
  const targetLabel = params.displayName || params.toPhase.replace(/_/g, ' ');
  const prefix = params.fromPhase
    ? `Phase changed from ${params.fromPhase.replace(/_/g, ' ')} to ${targetLabel}`
    : `Phase changed to ${targetLabel}`;
  return params.description ? `${prefix} - ${params.description}` : prefix;
}

export function resolveToolMedia(
  result: unknown,
): Pick<ChatToolCallMeta, 'mediaPath' | 'mediaType'> {
  if (!isRecord(result)) {
    return {};
  }

  const filePath =
    typeof result.file_path === 'string'
      ? result.file_path
      : typeof result.path === 'string'
        ? result.path
        : undefined;
  if (!filePath) {
    return {};
  }

  const explicitType =
    result.type === 'video' || result.type === 'image'
      ? (result.type as 'image' | 'video')
      : undefined;
  const mediaType =
    explicitType ||
    (/\.(mp4|webm|mov)$/i.test(filePath) ? 'video' : 'image');

  return {
    mediaPath: filePath,
    mediaType,
  };
}

export function buildCompletedToolMeta(params: {
  toolName: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  startedArgs?: Record<string, unknown>;
  result: unknown;
  duration?: number;
  status: 'completed' | 'error';
}): ChatToolCallMeta {
  const startedArgs = params.startedArgs || {};
  const finalArgs =
    params.args && Object.keys(params.args).length > 0
      ? params.args
      : startedArgs;
  const resultStatus =
    params.result &&
    typeof params.result === 'object' &&
    (params.result as Record<string, unknown>).status === 'needs_confirmation'
      ? 'needs_confirmation'
      : params.status === 'error'
        ? 'error'
        : 'completed';

  return {
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    args: finalArgs,
    startedArgs,
    status: resultStatus,
    result: params.result,
    duration: params.duration,
    ...resolveToolMedia(params.result),
  };
}

export function withToolAlias(
  entry: ActiveToolCallEntry,
  toolCallId?: string,
): ActiveToolCallEntry {
  if (!toolCallId) {
    return entry;
  }

  const knownToolCallIds = Array.from(
    new Set([...(entry.knownToolCallIds || []), toolCallId]),
  );

  return {
    ...entry,
    knownToolCallIds,
  };
}

export function findActiveToolCall(
  activeEntries: Iterable<[string, ActiveToolCallEntry]>,
  params: {
    toolName?: string;
    toolCallId?: string;
    agentName?: string;
  },
): [string, ActiveToolCallEntry] | null {
  const toolCallId = params.toolCallId?.trim();
  if (toolCallId) {
    for (const [key, entry] of activeEntries) {
      if (
        key === toolCallId ||
        entry.knownToolCallIds?.includes(toolCallId)
      ) {
        return [key, entry];
      }
    }
  }

  const candidates: Array<[string, ActiveToolCallEntry]> = [];
  for (const [key, entry] of activeEntries) {
    if (params.toolName && entry.toolName !== params.toolName) {
      continue;
    }
    if (params.agentName && entry.agentName && entry.agentName !== params.agentName) {
      continue;
    }
    candidates.push([key, entry]);
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => left[1].startTime - right[1].startTime);
  return candidates[0];
}
