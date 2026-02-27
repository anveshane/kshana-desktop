import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Download, Trash2 } from 'lucide-react';
import type { BackendState } from '../../../../shared/backendTypes';
import type {
  ChatExportPayload,
  ChatSnapshotUiState,
  PersistedChatMessage,
} from '../../../../shared/chatTypes';
import type {
  RemotionServerRenderRequest,
  RemotionServerRenderResult,
  RemotionServerRenderProgress,
} from '../../../../shared/remotionTypes';
import type { ChatMessage } from '../../../types/chat';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useAgent } from '../../../contexts/AgentContext';
import {
  createChatSnapshot,
  loadChatSnapshot,
  saveChatSnapshot,
} from '../../../services/chatPersistence';
import MessageList from '../MessageList';
import ChatInput from '../ChatInput';
import StatusBar, { AgentStatus } from '../StatusBar';
import ProjectSelectionDialog from '../ProjectSelectionDialog';
import {
  failExecutingToolCalls,
  isCancelAckStatus,
} from './chatPanelStopUtils';
import {
  extractFilePathTransport,
  extractFilePathProtocolVersion,
  extractIncomingFileOpPath,
  isAbsoluteWirePath,
  isFilePathProtocolCompatible,
  REQUIRED_FILE_PATH_PROTOCOL_VERSION,
  REQUIRED_FILE_PATH_TRANSPORT,
  shouldShowFilePathProtocolWarning,
} from './chatPanelPathProtocolUtils';
import { pathBasename } from '../../../utils/pathNormalizer';
import styles from './ChatPanel.module.scss';

// Message types that shouldn't create new messages if same type already exists
const DEDUPE_TYPES = ['progress', 'comfyui_progress', 'error'];
const backgroundGenerationEventDedupe = new Set<string>();

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const DEFAULT_WS_PATH = '/api/v1/ws/chat';
const SNAPSHOT_SAVE_DEBOUNCE_MS = 500;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const OUTBOUND_ACTION_QUEUE_CAP = 200;
const CONNECTION_BANNER_DEDUPE_MS = 5000;
const STOP_ACK_TIMEOUT_MS = 12000;
const FILE_PATH_PROTOCOL_WARNING =
  `Server file-op protocol is outdated (requires v${REQUIRED_FILE_PATH_PROTOCOL_VERSION}). ` +
  `Required transport: "${REQUIRED_FILE_PATH_TRANSPORT}". Upgrade kshana-ink server to avoid path compatibility failures.`;

const VALID_AGENT_STATUS: AgentStatus[] = [
  'idle',
  'thinking',
  'executing',
  'waiting',
  'completed',
  'error',
];

const makeId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const normalizeHttpUrl = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);

  // New state for StatusBar
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentName, setAgentName] = useState('Kshana');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentPhase, setCurrentPhase] = useState<string | undefined>();
  const [phaseDisplayName, setPhaseDisplayName] = useState<
    string | undefined
  >();
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [projectDialogResolved, setProjectDialogResolved] = useState(false);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [isStopPending, setIsStopPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const { setConnectionStatus, projectDirectory, registerProjectSwitchGuard } =
    useWorkspace();
  const agentContext = useAgent();

  const wsRef = useRef<WebSocket | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const awaitingResponseRef = useRef(false);
  // Track active tool calls by toolCallId or by toolName+sequence when toolCallId is missing
  const activeToolCallsRef = useRef<
    Map<string, { messageId: string; startTime: number; toolName: string }>
  >(new Map());
  const toolCallSequenceRef = useRef<Map<string, number>>(new Map());
  // Track the last todo message ID for in-place updates
  const lastTodoMessageIdRef = useRef<string | null>(null);
  // Track the last question message ID to avoid duplicates
  const lastQuestionMessageIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingOutboundActionsRef = useRef<string[]>([]);
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const connectionBannerRef = useRef<{ key: string; at: number } | null>(null);
  const filePathProtocolWarnedSessionIdsRef = useRef<Set<string>>(new Set());
  const filePathProtocolWarnedWithoutSessionRef = useRef(false);
  const currentProjectDirectoryRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const agentStatusRef = useRef<AgentStatus>('idle');
  const agentNameRef = useRef('Kshana');
  const statusMessageRef = useRef('');
  const currentPhaseRef = useRef<string | undefined>(undefined);
  const phaseDisplayNameRef = useRef<string | undefined>(undefined);
  const hasUserSentMessageRef = useRef(false);
  const isTaskRunningRef = useRef(false);
  const isStopPendingRef = useRef(false);
  const stopRequestRef = useRef<{
    promise: Promise<boolean>;
    resolve: (success: boolean) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const resolveAgentStatus = useCallback((value?: string): AgentStatus => {
    if (value && VALID_AGENT_STATUS.includes(value as AgentStatus)) {
      return value as AgentStatus;
    }
    return 'idle';
  }, []);

  const resetConversationRefs = useCallback(() => {
    lastAssistantIdRef.current = null;
    awaitingResponseRef.current = false;
    activeToolCallsRef.current.clear();
    toolCallSequenceRef.current.clear();
    lastTodoMessageIdRef.current = null;
    lastQuestionMessageIdRef.current = null;
    backgroundGenerationEventDedupe.clear();
    filePathProtocolWarnedSessionIdsRef.current.clear();
    filePathProtocolWarnedWithoutSessionRef.current = false;
  }, []);
  const appendMessage = useCallback(
    (message: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<ChatMessage>) => {
      const id = message.id ?? makeId();
      const timestamp = message.timestamp ?? Date.now();
      const newMessage = { ...message, id, timestamp };
      setMessages((prev) => {
        const updated = [...prev, newMessage];
        return updated;
      });
      return id;
    },
    [],
  );

  const appendSystemMessage = useCallback(
    (content: string, type = 'status') => {
      // Dedupe progress messages - update last matching one within recent history
      if (DEDUPE_TYPES.includes(type)) {
        setMessages((prev) => {
          // Look back at the last 5 messages to find a match
          // This handles cases where a notification might interleave with progress updates
          const searchLimit = Math.min(prev.length, 5);
          const startIndex = prev.length - 1;

          for (let i = 0; i < searchLimit; i++) {
            const idx = startIndex - i;
            const msg = prev[idx];

            if (msg.role === 'system' && msg.type === type) {
              // Update existing message
              return prev.map((m, index) =>
                index === idx ? { ...m, content, timestamp: Date.now() } : m,
              );
            }
          }

          // Create new message if no match found
          const id = makeId();
          return [
            ...prev,
            { id, role: 'system', type, content, timestamp: Date.now() },
          ];
        });
        return;
      }
      appendMessage({
        role: 'system',
        type,
        content,
      });
    },
    [appendMessage],
  );

  useEffect(() => {
    messagesRef.current = messages;
    agentStatusRef.current = agentStatus;
    agentNameRef.current = agentName;
    statusMessageRef.current = statusMessage;
    currentPhaseRef.current = currentPhase;
    phaseDisplayNameRef.current = phaseDisplayName;
    hasUserSentMessageRef.current = hasUserSentMessage;
    isTaskRunningRef.current = isTaskRunning;
    isStopPendingRef.current = isStopPending;
    sessionIdRef.current = sessionId;
  }, [
    messages,
    agentStatus,
    agentName,
    statusMessage,
    currentPhase,
    phaseDisplayName,
    hasUserSentMessage,
    isTaskRunning,
    isStopPending,
    sessionId,
  ]);

  const appendConnectionBanner = useCallback(
    (key: string, content: string) => {
      const now = Date.now();
      const lastBanner = connectionBannerRef.current;
      if (
        lastBanner &&
        lastBanner.key === key &&
        now - lastBanner.at < CONNECTION_BANNER_DEDUPE_MS
      ) {
        return;
      }
      connectionBannerRef.current = { key, at: now };
      appendSystemMessage(content, 'error');
    },
    [appendSystemMessage],
  );

  const resolveStopRequest = useCallback(
    (success: boolean, errorMessage?: string): boolean => {
      const pending = stopRequestRef.current;
      if (!pending) {
        return false;
      }

      clearTimeout(pending.timeoutId);
      stopRequestRef.current = null;
      setIsStopPending(false);

      if (success) {
        setIsTaskRunning(false);
      } else {
        setIsTaskRunning(true);
        const message = errorMessage || 'Failed to stop task.';
        appendSystemMessage(message, 'error');
      }

      pending.resolve(success);
      return true;
    },
    [appendSystemMessage],
  );

  const failActiveToolCalls = useCallback((reason: string) => {
    const now = Date.now();
    const activeEntries = Array.from(activeToolCallsRef.current.values());
    const updated = failExecutingToolCalls(
      messagesRef.current,
      activeEntries,
      reason,
      now,
    );

    messagesRef.current = updated;
    setMessages(updated);
    activeToolCallsRef.current.clear();
    toolCallSequenceRef.current.clear();
    setIsStreaming(false);
    lastAssistantIdRef.current = null;
  }, []);

  const getRendererErrorMessage = useCallback(
    (error: unknown, fallback: string): string => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        const message = (error as { message: string }).message.trim();
        if (message) {
          return message;
        }
      }
      return fallback;
    },
    [],
  );
  const buildSnapshotUiState = useCallback((): ChatSnapshotUiState => {
    return {
      agentStatus: agentStatusRef.current,
      agentName: agentNameRef.current,
      statusMessage: statusMessageRef.current,
      currentPhase: currentPhaseRef.current,
      phaseDisplayName: phaseDisplayNameRef.current,
      hasUserSentMessage: hasUserSentMessageRef.current,
      isTaskRunning: isTaskRunningRef.current,
    };
  }, []);

  const persistSnapshot = useCallback(
    async (targetProjectDirectory: string): Promise<void> => {
      const snapshot = createChatSnapshot({
        projectDirectory: targetProjectDirectory,
        sessionId: sessionIdRef.current,
        messages: messagesRef.current,
        uiState: buildSnapshotUiState(),
      });
      await saveChatSnapshot(snapshot);
    },
    [buildSnapshotUiState],
  );

  const scheduleSnapshotSave = useCallback(
    (targetProjectDirectory: string | null | undefined) => {
      if (!targetProjectDirectory) {
        return;
      }
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
      }
      snapshotSaveTimeoutRef.current = setTimeout(() => {
        snapshotSaveTimeoutRef.current = null;
        void persistSnapshot(targetProjectDirectory).catch((error) => {
          console.error('[ChatPanel] Failed to persist chat snapshot:', error);
        });
      }, SNAPSHOT_SAVE_DEBOUNCE_MS);
    },
    [persistSnapshot],
  );

  const flushSnapshotSave = useCallback(
    (targetProjectDirectory: string | null | undefined) => {
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
        snapshotSaveTimeoutRef.current = null;
      }
      if (!targetProjectDirectory) {
        return;
      }
      void persistSnapshot(targetProjectDirectory).catch((error) => {
        console.error('[ChatPanel] Failed to flush chat snapshot:', error);
      });
    },
    [persistSnapshot],
  );

  const restoreSnapshot = useCallback(
    async (targetProjectDirectory: string) => {
      const pendingStop = stopRequestRef.current;
      if (pendingStop) {
        clearTimeout(pendingStop.timeoutId);
        stopRequestRef.current = null;
        pendingStop.resolve(false);
      }

      const snapshot = await loadChatSnapshot(targetProjectDirectory);
      resetConversationRefs();
      if (!snapshot) {
        setMessages([]);
        setSessionId(null);
        setAgentStatus('idle');
        setAgentName('Kshana');
        setStatusMessage('Ready');
        setCurrentPhase(undefined);
        setPhaseDisplayName(undefined);
        setHasUserSentMessage(false);
        setIsTaskRunning(false);
        setIsStopPending(false);
        return;
      }

      setMessages(snapshot.messages as ChatMessage[]);
      setSessionId(snapshot.sessionId);
      setAgentStatus(resolveAgentStatus(snapshot.uiState.agentStatus));
      setAgentName(snapshot.uiState.agentName || 'Kshana');
      setStatusMessage(snapshot.uiState.statusMessage || 'Ready');
      setCurrentPhase(snapshot.uiState.currentPhase);
      setPhaseDisplayName(snapshot.uiState.phaseDisplayName);
      setHasUserSentMessage(Boolean(snapshot.uiState.hasUserSentMessage));
      setIsTaskRunning(Boolean(snapshot.uiState.isTaskRunning));
      setIsStopPending(false);
    },
    [resetConversationRefs, resolveAgentStatus],
  );

  const clearChat = useCallback(() => {
    const pendingStop = stopRequestRef.current;
    if (pendingStop) {
      clearTimeout(pendingStop.timeoutId);
      stopRequestRef.current = null;
      pendingStop.resolve(false);
    }

    setMessages([]);
    setSessionId(null);
    resetConversationRefs();
    setAgentStatus('idle');
    setAgentName('Kshana');
    setStatusMessage('Ready');
    setCurrentPhase(undefined);
    setPhaseDisplayName(undefined);
    setHasUserSentMessage(false);
    setIsTaskRunning(false);
    setIsStopPending(false);
    scheduleSnapshotSave(projectDirectory);
    // Backend will send greeting via WebSocket when connection is re-established
  }, [projectDirectory, resetConversationRefs, scheduleSnapshotSave]);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const appendAssistantChunk = useCallback(
    (content: string, type: string, author?: string) => {
      // Always process chunks - create message even with empty content to show thinking state
      const trimmedContent = content || '';

      // Streaming types that should accumulate in the same message
      const streamingTypes = [
        'text_chunk',
        'agent_text',
        'coordinator_response',
        'stream_chunk',
      ];
      const isStreamingType = streamingTypes.includes(type);
      // Normalize stream_chunk to agent_text for comparison
      const normalizedType = type === 'stream_chunk' ? 'agent_text' : type;

      setMessages((prev) => {
        // If we're streaming and have an active message, ALWAYS append to it
        // This matches CLI behavior where chunks accumulate smoothly
        if (isStreamingType && lastAssistantIdRef.current) {
          const existingMessage = prev.find(
            (msg) => msg.id === lastAssistantIdRef.current,
          );

          if (
            existingMessage &&
            existingMessage.role === 'assistant' &&
            existingMessage.type !== 'tool_call' && // Don't append to tool calls
            (existingMessage.type === 'agent_text' ||
              existingMessage.type === 'stream_chunk' ||
              existingMessage.type === normalizedType)
          ) {
            setIsStreaming(true);
            // Append content to existing message (smooth accumulation like CLI)
            return prev.map((message) => {
              if (message.id === lastAssistantIdRef.current) {
                const newContent = `${message.content || ''}${trimmedContent}`;
                return {
                  ...message,
                  content: newContent,
                  type: normalizedType, // Update to normalized type
                  author: message.author || author || 'Kshana',
                  timestamp: Date.now(), // Update timestamp to show it's active
                };
              }
              return message;
            });
          }
        }

        // Check for duplicate content only for substantial chunks (not during active streaming)
        // This prevents duplicate messages when stream restarts
        // Note: We check if we're currently streaming by seeing if lastAssistantIdRef points to a message
        const currentlyStreaming =
          lastAssistantIdRef.current &&
          prev.some(
            (msg) =>
              msg.id === lastAssistantIdRef.current && msg.role === 'assistant',
          );

        if (trimmedContent.length > 50 && !currentlyStreaming) {
          const contentHash = trimmedContent.substring(0, 100);
          for (
            let i = prev.length - 1;
            i >= Math.max(0, prev.length - 3);
            i--
          ) {
            const msg = prev[i];
            if (
              msg.role === 'assistant' &&
              msg.content &&
              msg.type === normalizedType &&
              msg.content.substring(0, 100) === contentHash
            ) {
              // Found duplicate - reuse this message and start streaming into it
              lastAssistantIdRef.current = msg.id;
              setIsStreaming(isStreamingType);
              return prev.map((m) =>
                m.id === msg.id
                  ? {
                    ...m,
                    content: m.content + trimmedContent,
                    timestamp: Date.now(),
                  }
                  : m,
              );
            }
          }
        }

        // Check if we already have an empty assistant message we can reuse
        // But NOT if it's a tool call - tool calls should be separate
        const lastMessage = prev[prev.length - 1];
        if (
          lastMessage &&
          lastMessage.role === 'assistant' &&
          lastMessage.type !== 'tool_call' &&
          lastMessage.type !== 'agent_question' && // Don't reuse questions
          (lastMessage.type === normalizedType ||
            (isStreamingType &&
              (lastMessage.type === 'agent_text' ||
                lastMessage.type === 'stream_chunk'))) &&
          (!lastMessage.content || lastMessage.content.trim().length === 0)
        ) {
          // Reuse the empty message
          lastAssistantIdRef.current = lastMessage.id;
          setIsStreaming(isStreamingType);
          return prev.map((msg) =>
            msg.id === lastMessage.id
              ? {
                ...msg,
                content: trimmedContent,
                type: normalizedType,
                author: msg.author || author || 'Kshana',
                timestamp: Date.now(),
              }
              : msg,
          );
        }

        // Create new message for new stream
        const id = makeId();
        lastAssistantIdRef.current = id;
        setIsStreaming(isStreamingType);
        return [
          ...prev,
          {
            id,
            role: 'assistant',
            type: normalizedType,
            content: trimmedContent,
            timestamp: Date.now(),
            author: author || 'Kshana',
          },
        ];
      });
    },
    [],
  );

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptRef.current = 0;
  }, []);

  const flushPendingOutboundActions = useCallback((socket?: WebSocket) => {
    const targetSocket = socket ?? wsRef.current;
    if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (pendingOutboundActionsRef.current.length > 0) {
      const payload = pendingOutboundActionsRef.current.shift();
      if (!payload) break;
      targetSocket.send(payload);
    }
  }, []);

  const queueOutboundAction = useCallback((payload: string) => {
    pendingOutboundActionsRef.current.push(payload);
    if (pendingOutboundActionsRef.current.length > OUTBOUND_ACTION_QUEUE_CAP) {
      pendingOutboundActionsRef.current = pendingOutboundActionsRef.current.slice(
        pendingOutboundActionsRef.current.length - OUTBOUND_ACTION_QUEUE_CAP,
      );
    }
  }, []);

  // Debounce status updates to prevent flicker
  const statusUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const debouncedSetStatus = useCallback(
    (status: AgentStatus, message: string) => {
      if (statusUpdateTimeoutRef.current) {
        clearTimeout(statusUpdateTimeoutRef.current);
      }
      statusUpdateTimeoutRef.current = setTimeout(() => {
        setAgentStatus(status);
        setStatusMessage(message);
      }, 100); // 100ms debounce
    },
    [],
  );

  /**
   * Handle server payload from kshana-ink WebSocket.
   * kshana-ink messages have the format: { type, sessionId, timestamp, data: {...} }
   */
  const handleServerPayload = useCallback(
    (payload: Record<string, unknown>) => {
      // Extract data from kshana-ink message format
      const data = (payload.data as Record<string, unknown>) ?? payload;
      const messageType = payload.type as string;
      const payloadSessionId =
        typeof payload.sessionId === 'string' ? payload.sessionId : null;

      if (payloadSessionId && payloadSessionId !== sessionIdRef.current) {
        setSessionId(payloadSessionId);
      }

      // Extract optional agent name logic (if provided by backend)
      // Use functional update to avoid dependency on agentName
      setAgentName((prevAgentName) => {
        const currentAgentName =
          (data.agentName as string) ??
          (payload.agentName as string) ??
          prevAgentName;
        return currentAgentName;
      });

      switch (messageType) {
        case 'status': {
          // kshana-ink status: { status: 'connected' | 'ready' | 'busy' | 'completed' | 'error', message?: string, agentName?: string }
          const statusMsg =
            (data.message as string) ??
            (data.status as string) ??
            'Status update';
          const status = data.status as string;
          const agentNameFromStatus = (data.agentName as string) ?? agentName;
          const isCancelAck = isCancelAckStatus(status, statusMsg);

          // Update agent name if it changed
          if (agentNameFromStatus !== agentName) {
            setAgentName(agentNameFromStatus);
          }

          const protocolVersion = extractFilePathProtocolVersion(data);
          const protocolTransport = extractFilePathTransport(data);
          const protocolCompatible = isFilePathProtocolCompatible(
            protocolVersion,
            protocolTransport,
          );
          const warningDecision = shouldShowFilePathProtocolWarning(
            protocolCompatible,
            payloadSessionId ?? sessionIdRef.current,
            filePathProtocolWarnedSessionIdsRef.current,
            filePathProtocolWarnedWithoutSessionRef.current,
          );
          filePathProtocolWarnedWithoutSessionRef.current =
            warningDecision.warnedWithoutSession;

          if (warningDecision.shouldWarn) {
            const reportedVersion =
              protocolVersion === null ? 'missing' : String(protocolVersion);
            const reportedTransport = protocolTransport ?? 'missing';
            appendSystemMessage(
              `⚠️ ${FILE_PATH_PROTOCOL_WARNING} (server reported version=${reportedVersion}, transport=${reportedTransport}).`,
              'error',
            );
          }

          // Map status to agent status with debouncing
          switch (status) {
            case 'connected':
              setAgentStatus('idle');
              setStatusMessage('Connected');
              window.electron.logger.logStatusChange(
                'idle',
                agentNameFromStatus,
                'Connected',
              );
              // Initial greeting logic with example prompts
              setMessages((prev) => {
                const hasGreeting = prev.some((msg) => msg.type === 'greeting');
                if (hasGreeting) return prev;
                return [
                  ...prev,
                  {
                    id: makeId(),
                    role: 'system',
                    type: 'greeting',
                    content:
                      'Welcome to Kshana!\n\nPaste an SRT transcript or enter a documentary script.\nThe system will detect SRT format automatically.\n\n**Style:** Cinematic Realism\n\n**Example prompts:**\n\n* Paste a full SRT transcript to begin\n* A 10-minute documentary script about coral reefs',
                    timestamp: Date.now(),
                  },
                ];
              });
              break;
            case 'busy':
              // Update status only - don't create placeholder messages
              // Real agent text will come through stream_chunk messages
              debouncedSetStatus('thinking', statusMsg || 'Thinking...');
              setIsTaskRunning(true);
              window.electron.logger.logStatusChange(
                'thinking',
                agentNameFromStatus,
                statusMsg || 'Thinking...',
              );
              break;
            case 'ready':
              debouncedSetStatus(
                'waiting',
                statusMsg || 'Waiting for input...',
              );
              setIsTaskRunning(false);
              if (isCancelAck) {
                resolveStopRequest(true);
              }
              window.electron.logger.logStatusChange(
                'waiting',
                agentNameFromStatus,
                statusMsg || 'Waiting for input...',
              );
              break;
            case 'completed':
              debouncedSetStatus('completed', statusMsg || 'Task completed');
              setIsTaskRunning(false);
              if (isStopPendingRef.current) {
                resolveStopRequest(true);
              }
              window.electron.logger.logStatusChange(
                'completed',
                agentNameFromStatus,
                statusMsg || 'Task completed',
              );
              break;
            case 'error':
              debouncedSetStatus('error', statusMsg);
              setIsTaskRunning(false);
              if (isStopPendingRef.current) {
                resolveStopRequest(false, statusMsg || 'Failed to stop task.');
              }
              window.electron.logger.logStatusChange(
                'error',
                agentNameFromStatus,
                statusMsg,
              );
              break;
            default:
              setStatusMessage(statusMsg);
              window.electron.logger.logStatusChange(
                status,
                agentNameFromStatus,
                statusMsg,
              );
          }
          break;
        }
        case 'progress': {
          // kshana-ink progress: { iteration, maxIterations, status }
          const { iteration, maxIterations, status: progressStatus } = data;
          const percent = maxIterations
            ? Math.round(
              ((iteration as number) / (maxIterations as number)) * 100,
            )
            : 0;
          const details = [
            progressStatus ? `${progressStatus}` : null,
            percent ? `Progress: ${percent}%` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          setStatusMessage(details || 'Processing...');
          break;
        }
        case 'stream_chunk': {
          // kshana-ink stream_chunk: { content, done }
          // This represents thinking/reasoning that happens BEFORE tool calls start
          const content = (data.content as string) ?? '';
          const done = (data.done as boolean) ?? false;

          // Skip empty chunks
          if (!content && !done) {
            break;
          }

          // FILTER: Skip repetitive meta-commentary messages that make it look like a loop
          // But show warnings for blocked messages to help with debugging
          const skipPatterns = [
            /^I apologize for/i,
            /^I understand\.? I will now/i,
            /^I am (still )?stuck/i,
            /^I need to (create|transition)/i,
            /^Please manually/i,
          ];

          const trimmedContent = content.trim();
          const isBlockedMessage = /^I am blocked/i.test(trimmedContent);
          const shouldSkip = skipPatterns.some((pattern) =>
            pattern.test(trimmedContent),
          );

          // Show warning for blocked messages instead of hiding them completely
          if (isBlockedMessage && !done) {
            console.warn(
              '[ChatPanel] Agent loop detected - blocked message:',
              trimmedContent.substring(0, 100),
            );
            // Show a condensed warning message to user
            appendSystemMessage(
              '⚠️ Agent retrying phase transition (circuit breaker will activate if needed)...',
              'status',
            );
            // Still skip the actual blocked message text to avoid clutter
            break;
          }

          if (shouldSkip && !done) {
            console.log(
              '[ChatPanel] Skipping redundant thinking message:',
              trimmedContent.substring(0, 50),
            );
            break;
          }

          setAgentStatus('thinking'); // Agent is generating reasoning/thinking text

          // Create/update message with stream chunk content (thinking happens before tool calls)
          appendAssistantChunk(content, 'stream_chunk', agentName);

          if (done) {
            setIsStreaming(false);
            // Clear the ref so next stream starts fresh
            lastAssistantIdRef.current = null;
          }
          break;
        }
        case 'stream_end': {
          lastAssistantIdRef.current = null;
          setIsStreaming(false);
          setAgentStatus('idle');
          break;
        }
        case 'tool_call': {
          // Server sends tool_call events: { toolName, toolCallId (empty), arguments, status, result?, error? }
          // Status: 'started' (from onToolCall) or 'completed'/'error' (from onToolResult)
          const toolName = (data.toolName as string) ?? 'tool';
          const toolStatus = (data.status as string) ?? 'started';
          const args = (data.arguments as Record<string, unknown>) ?? {};
          const { result } = data;
          const { error } = data;
          const toolCallId = (data.toolCallId as string) || '';

          if (toolStatus === 'completed' || toolStatus === 'error') {
            debouncedSetStatus('thinking', 'Processing...');

            // Clean thinking/reasoning content from result if it exists
            let cleanedResult = result ?? error;
            const cleanThinkingTags = (text: string): string => {
              return text
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '')
                .replace(/<think[\s\S]*?\/>/gi, '')
                .trim();
            };

            if (
              cleanedResult &&
              typeof cleanedResult === 'object' &&
              'content' in cleanedResult
            ) {
              const content = cleanedResult.content as string;
              const cleanedContent = cleanThinkingTags(content);
              cleanedResult = { ...cleanedResult, content: cleanedContent };
            } else if (typeof cleanedResult === 'string') {
              cleanedResult = cleanThinkingTags(cleanedResult);
            }

            const now = Date.now();
            let duration = (data.duration as number) ?? 0;
            let activeKey: string | null = null;

            if (toolCallId) {
              activeKey = toolCallId;
            }

            let activeEntry = activeKey
              ? activeToolCallsRef.current.get(activeKey)
              : undefined;

            if (!activeEntry) {
              // Find the oldest active tool call for this toolName (FIFO)
              for (const [key, value] of activeToolCallsRef.current.entries()) {
                if (value.toolName === toolName) {
                  activeKey = key;
                  activeEntry = value;
                  break;
                }
              }
            }
            if (!duration && activeEntry) {
              duration = Math.max(0, now - activeEntry.startTime);
            }

            // Log tool completion
            window.electron.logger.logToolComplete(
              toolName,
              cleanedResult,
              duration,
              toolStatus === 'error',
            );

            // Update existing tool call message (if it exists), otherwise append
            lastAssistantIdRef.current = null;
            setIsStreaming(false);

            if (activeEntry) {
              activeToolCallsRef.current.delete(activeKey as string);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === activeEntry.messageId
                    ? {
                      ...msg,
                      meta: {
                        ...(msg.meta || {}),
                        toolCallId: toolCallId || activeKey,
                        toolName,
                        args,
                        status:
                          toolStatus === 'error' ? 'error' : 'completed',
                        result: cleanedResult,
                        duration,
                      },
                      timestamp: Date.now(),
                    }
                    : msg,
                ),
              );
            } else {
              appendMessage({
                role: 'system',
                type: 'tool_call',
                content: '',
                author: agentName,
                meta: {
                  toolCallId: toolCallId || makeId(),
                  toolName,
                  args,
                  status: toolStatus === 'error' ? 'error' : 'completed',
                  result: cleanedResult,
                  duration,
                },
              });
            }

            // Check for phase transitions in update_project results
            if (
              toolName === 'update_project' &&
              cleanedResult &&
              typeof cleanedResult === 'object'
            ) {
              const resultObj = cleanedResult as Record<string, unknown>;

              // Update current phase from any update_project result
              if (resultObj.current_phase) {
                setCurrentPhase(resultObj.current_phase as string);
              }
              if (resultObj.new_phase_name) {
                setPhaseDisplayName(resultObj.new_phase_name as string);
              }

              if (resultObj._phaseTransition) {
                const transition = resultObj._phaseTransition as {
                  fromPhase: string;
                  toPhase: string;
                  displayName?: string;
                };
                window.electron.logger.logPhaseTransition(
                  transition.fromPhase,
                  transition.toPhase,
                  true,
                  `Transitioned to ${transition.displayName || transition.toPhase}`,
                );
                // Update phase state
                setCurrentPhase(transition.toPhase);
                setPhaseDisplayName(
                  transition.displayName || transition.toPhase,
                );
              }
            }
          } else if (toolStatus === 'started') {
            const now = Date.now();
            const sequence =
              (toolCallSequenceRef.current.get(toolName) ?? 0) + 1;
            toolCallSequenceRef.current.set(toolName, sequence);
            const fallbackKey = `${toolName}-${sequence}`;
            const key = toolCallId || fallbackKey;

            debouncedSetStatus('executing', `Running ${toolName}...`);
            window.electron.logger.logToolStart(toolName, args);
            window.electron.logger.logStatusChange(
              'executing',
              agentName,
              `Running ${toolName}...`,
            );

            const messageId = appendMessage({
              role: 'system',
              type: 'tool_call',
              content: '',
              author: agentName,
              meta: {
                toolCallId: toolCallId || key,
                toolName,
                args,
                status: 'executing',
                result: undefined,
                duration: undefined,
              },
            });

            activeToolCallsRef.current.set(key, {
              messageId,
              startTime: now,
              toolName,
            });
          }
          break;
        }
        case 'agent_response': {
          // kshana-ink agent_response: { output, status }
          const output = (data.output as string) ?? '';
          const responseStatus = data.status as string;
          if (output) {
            // Log agent response
            window.electron.logger.logAgentText(output, agentName);

            // Replace last assistant message if it exists (could be agent_text or stream_chunk)
            // to avoid duplicates
            setMessages((prev) => {
              // Find the last assistant message that's not a question or tool call
              let lastAssistantIdx = -1;
              for (let i = prev.length - 1; i >= 0; i--) {
                const msg = prev[i];
                if (
                  msg.role === 'assistant' &&
                  msg.type !== 'agent_question' &&
                  msg.type !== 'tool_call' &&
                  (msg.type === 'agent_text' ||
                    msg.type === 'stream_chunk' ||
                    msg.type === 'agent_response')
                ) {
                  lastAssistantIdx = i;
                  break;
                }
              }

              if (
                lastAssistantIdx >= 0 &&
                lastAssistantIdRef.current === prev[lastAssistantIdx].id
              ) {
                // Update existing message
                return prev.map((msg, idx) =>
                  idx === lastAssistantIdx
                    ? {
                      ...msg,
                      type: 'agent_response',
                      content: output,
                      timestamp: Date.now(),
                      author: agentName,
                    }
                    : msg,
                );
              }

              // Check if output already exists in messages to avoid duplicates
              const existingMessage = prev.find(
                (msg) =>
                  msg.role === 'assistant' &&
                  msg.content === output &&
                  msg.type === 'agent_response',
              );
              if (existingMessage) {
                // Already have this exact message, don't create duplicate
                return prev;
              }

              // Create new message only if we don't have a matching one
              const id = makeId();
              lastAssistantIdRef.current = id;
              return [
                ...prev,
                {
                  id,
                  role: 'assistant',
                  type: 'agent_response',
                  content: output,
                  timestamp: Date.now(),
                  author: agentName,
                },
              ];
            });
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
          }

          if (responseStatus === 'completed') {
            setAgentStatus('completed');
            setStatusMessage('Completed');
            setIsTaskRunning(false);
            if (isStopPendingRef.current) {
              resolveStopRequest(true);
            }
            window.electron.logger.logStatusChange(
              'completed',
              agentName,
              'Completed',
            );
          } else if (responseStatus === 'cancelled') {
            setAgentStatus('waiting');
            setStatusMessage('Task cancelled');
            setIsTaskRunning(false);
            resolveStopRequest(true);
            window.electron.logger.logStatusChange(
              'waiting',
              agentName,
              'Task cancelled',
            );
          } else if (responseStatus === 'max_iterations') {
            setAgentStatus('error');
            setStatusMessage('Agent reached maximum iterations');
            setIsTaskRunning(false);
            if (isStopPendingRef.current) {
              resolveStopRequest(false, 'Agent reached maximum iterations.');
            }
            window.electron.logger.logStatusChange(
              'error',
              agentName,
              'Agent reached maximum iterations',
            );
            appendSystemMessage(
              'Agent reached maximum iterations before finishing. Try a narrower request or continue from current output.',
              'error',
            );
          } else if (responseStatus === 'error') {
            setAgentStatus('error');
            setStatusMessage('Error');
            setIsTaskRunning(false);
            if (isStopPendingRef.current) {
              resolveStopRequest(false, 'Failed to stop task.');
            }
            window.electron.logger.logStatusChange('error', agentName, 'Error');
            window.electron.logger.logError(
              'An error occurred while processing your request.',
            );
            appendSystemMessage(
              'An error occurred while processing your request.',
              'error',
            );
          }
          break;
        }
        case 'agent_question': {
          // kshana-ink agent_question: { question, options?, timeout?, defaultOption?, questionType? }
          // options can be string[] or Array<{ label: string; description?: string }>
          const question = (data.question as string) ?? '';
          const rawOptions = data.options as
            | string[]
            | Array<{ label: string; description?: string }>
            | undefined;
          // Extract labels if options are objects, otherwise use as-is
          const options = rawOptions
            ? rawOptions.map((opt) =>
              typeof opt === 'string' ? opt : opt.label,
            )
            : undefined;
          const questionType = (data.questionType as string) ?? 'text'; // text, confirm, select
          const timeout = (data.timeout as number) ?? undefined;
          const defaultOption = (data.defaultOption as string) ?? undefined;

          if (question) {
            setAgentStatus('waiting');
            setStatusMessage('Waiting for your input');
            window.electron.logger.logStatusChange(
              'waiting',
              agentName,
              'Waiting for your input',
            );

            // Log question
            const questionOptions = rawOptions
              ? rawOptions.map((opt) =>
                typeof opt === 'string' ? { label: opt } : opt,
              )
              : undefined;
            window.electron.logger.logQuestion(
              question,
              questionOptions,
              questionType === 'confirm',
              timeout,
            );

            // Update existing question message if it exists to avoid duplicates
            setMessages((prev) => {
              if (lastQuestionMessageIdRef.current) {
                const existingQuestion = prev.find(
                  (msg) => msg.id === lastQuestionMessageIdRef.current,
                );
                if (
                  existingQuestion &&
                  existingQuestion.type === 'agent_question'
                ) {
                  // Update existing question
                  return prev.map((msg) =>
                    msg.id === lastQuestionMessageIdRef.current
                      ? {
                        ...msg,
                        content: question,
                        meta: {
                          options,
                          questionType,
                          timeout,
                          defaultOption,
                        },
                        timestamp: Date.now(),
                      }
                      : msg,
                  );
                }
              }

              // Check if the same question already exists
              const duplicateQuestion = prev.find(
                (msg) =>
                  msg.type === 'agent_question' && msg.content === question,
              );
              if (duplicateQuestion) {
                lastQuestionMessageIdRef.current = duplicateQuestion.id;
                return prev;
              }

              // Create new question message
              const id = makeId();
              lastQuestionMessageIdRef.current = id;
              return [
                ...prev,
                {
                  id,
                  role: 'assistant',
                  type: 'agent_question',
                  content: question,
                  author: agentName,
                  timestamp: Date.now(),
                  meta: {
                    options,
                    questionType,
                    timeout,
                    defaultOption,
                  },
                },
              ];
            });

            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            awaitingResponseRef.current = true;
            setIsTaskRunning(false);
          }
          break;
        }
        case 'todo_update': {
          // kshana-ink todo_update: { todos }
          const todos = data.todos as Array<any>;
          if (todos?.length) {
            // Log todo update
            window.electron.logger.logTodoUpdate(
              todos.map((t) => ({
                content: t.content || t.id,
                status: t.status,
              })),
            );

            if (lastTodoMessageIdRef.current) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === lastTodoMessageIdRef.current
                    ? {
                      ...msg,
                      meta: { ...msg.meta, todos },
                      timestamp: Date.now(),
                    }
                    : msg,
                ),
              );
            } else {
              const messageId = appendMessage({
                role: 'system',
                type: 'todo_update',
                content: '',
                meta: { todos },
              });
              lastTodoMessageIdRef.current = messageId;
            }
          }
          break;
        }
        case 'background_generation': {
          const batchId = String(data.batchId ?? '');
          const kind = ((data.kind as 'image' | 'video' | undefined) ?? 'image');
          const batchStatus = (data.status as
            | 'queued'
            | 'running'
            | 'completed'
            | 'failed'
            | undefined) ?? 'running';
          const totalItems = Number(data.totalItems ?? 0);
          const completedItems = Number(data.completedItems ?? 0);
          const failedItems = Number(data.failedItems ?? 0);
          const kindLabel = kind === 'video' ? 'video' : 'image';

          if (batchStatus === 'queued' || batchStatus === 'running') {
            const progress =
              totalItems > 0 ? ` (${Math.min(completedItems, totalItems)}/${totalItems})` : '';
            setStatusMessage(`Background ${kindLabel} generation ${batchStatus}${progress}.`);
            break;
          }

          const dedupeKey = `${batchId}:${batchStatus}`;
          if (backgroundGenerationEventDedupe.has(dedupeKey)) {
            break;
          }
          backgroundGenerationEventDedupe.add(dedupeKey);

          if (batchStatus === 'completed') {
            appendSystemMessage(
              `Background ${kindLabel} generation finished (${completedItems}/${totalItems}).`,
              'status',
            );
          } else if (batchStatus === 'failed') {
            appendSystemMessage(
              `Background ${kindLabel} generation finished with failures (${completedItems}/${totalItems}, failed: ${failedItems}).`,
              'status',
            );
          }
          break;
        }
        case 'error': {
          const errorMsg = (data.message as string) ?? 'An error occurred';
          const errorCode = (data.code as string) ?? '';
          const isTransientNetworkError =
            errorCode === 'transient_network_error' ||
            /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|connection reset|network error|fetch failed/i.test(
              errorMsg,
            );

          if (errorCode === 'cancel_failed' && isStopPendingRef.current) {
            resolveStopRequest(false, errorMsg);
            break;
          }

          if (isTransientNetworkError) {
            const retryMessage =
              `Transient network issue while contacting the model: ${errorMsg}. ` +
              'Please retry your last step.';
            appendSystemMessage(retryMessage, 'status');
            setAgentStatus('waiting');
            setStatusMessage('Connection issue. Ready to retry.');
            setIsTaskRunning(false);
            window.electron.logger.logError(
              errorMsg,
              data as Record<string, unknown>,
            );
            window.electron.logger.logStatusChange(
              'waiting',
              agentName,
              'Connection issue. Ready to retry.',
            );
            break;
          }
          appendSystemMessage(errorMsg, 'error');
          setAgentStatus('error');
          setStatusMessage(errorMsg);
          setIsTaskRunning(false);
          window.electron.logger.logError(
            errorMsg,
            data as Record<string, unknown>,
          );
          window.electron.logger.logStatusChange('error', agentName, errorMsg);
          break;
        }
        case 'remotion_render_request': {
          const request = data as Partial<RemotionServerRenderRequest>;
          const requestId =
            typeof request.requestId === 'string'
              ? request.requestId.trim()
              : '';
          if (!requestId) {
            console.warn(
              '[ChatPanel] remotion_render_request missing requestId',
              payload,
            );
            break;
          }

          const sendResult = (result: RemotionServerRenderResult) => {
            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
              return;
            }
            ws.send(
              JSON.stringify({
                type: 'remotion_render_result',
                data: result,
              }),
            );
          };

          if (!projectDirectory) {
            sendResult({
              requestId,
              status: 'failed',
              error:
                'No active project selected on desktop for Remotion rendering.',
            });
            break;
          }

          const requestedProjectDir =
            typeof request.projectDir === 'string'
              ? request.projectDir.trim()
              : '';
          const normalizeProjectPath = (value: string) =>
            value.replace(/\\/g, '/').replace(/\/+$/, '');
          if (
            requestedProjectDir &&
            normalizeProjectPath(requestedProjectDir) !==
              normalizeProjectPath(projectDirectory)
          ) {
            sendResult({
              requestId,
              status: 'failed',
              error:
                'Requested project directory does not match the active desktop project.',
            });
            break;
          }

          const requestPayload: RemotionServerRenderRequest = {
            requestId,
            projectDir: projectDirectory,
            placements: Array.isArray(request.placements)
              ? request.placements
              : [],
            components: Array.isArray(request.components)
              ? request.components
              : [],
            indexContent:
              typeof request.indexContent === 'string'
                ? request.indexContent
                : '',
          };

          void window.electron.remotion
            .renderFromServerRequest(
              projectDirectory,
              requestPayload,
              (progress: RemotionServerRenderProgress) => {
                const ws = wsRef.current;
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                  return;
                }
                ws.send(
                  JSON.stringify({
                    type: 'remotion_render_progress',
                    data: progress,
                  }),
                );
              },
            )
            .then((result) => {
              sendResult(result);
              if (result.status !== 'completed') {
                appendSystemMessage(
                  `Desktop Remotion render failed: ${result.error || 'Unknown error'}`,
                  'error',
                );
              }
            })
            .catch((error: unknown) => {
              const errorMessage = getRendererErrorMessage(
                error,
                'Desktop Remotion render failed.',
              );
              sendResult({
                requestId,
                status: 'failed',
                error: errorMessage,
              });
              appendSystemMessage(
                `Desktop Remotion render failed: ${errorMessage}`,
                'error',
              );
            });
          break;
        }
        case 'file_sync_request': {
          const syncProjectDir = data.projectDir as string;
          if (syncProjectDir) {
            console.log('[ChatPanel] Received file_sync_request, reading project files...', syncProjectDir);
            window.electron.project.readAllFiles(syncProjectDir).then((files) => {
              console.log(`[ChatPanel] Sending file_sync_init with ${files.length} files`);
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'file_sync_init',
                  data: { files },
                }));
              }
            }).catch((err) => {
              console.error('[ChatPanel] Failed to read project files for sync:', err);
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'file_sync_init',
                  data: { files: [] },
                }));
              }
            });
          }
          break;
        }
        case 'file_write': {
          const filePath = extractIncomingFileOpPath(data);
          const opId =
            typeof data.opId === 'string' && data.opId.trim()
              ? data.opId
              : undefined;
          const fileContent = data.content as string;
          if (!filePath) {
            appendSystemMessage(
              '⚠️ Failed to save file: missing file path in server payload.',
              'error',
            );
            break;
          }
          if (isAbsoluteWirePath(filePath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute file path from server: ${filePath}`,
              'error',
            );
            break;
          }
          if (filePath && fileContent !== undefined) {
            window.electron.project.writeFile(filePath, fileContent, {
              opId,
              source: 'agent_ws',
            }).catch((err) => {
              console.error('[ChatPanel] file_write failed:', filePath, err);
              const reason = getRendererErrorMessage(
                err,
                'Unknown file write error.',
              );
              appendSystemMessage(
                `⚠️ Failed to save file: ${pathBasename(filePath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_write_binary': {
          const binPath = extractIncomingFileOpPath(data);
          const opId =
            typeof data.opId === 'string' && data.opId.trim()
              ? data.opId
              : undefined;
          const binContent = data.content as string;
          if (!binPath) {
            appendSystemMessage(
              '⚠️ Failed to save binary file: missing file path in server payload.',
              'error',
            );
            break;
          }
          if (isAbsoluteWirePath(binPath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute file path from server: ${binPath}`,
              'error',
            );
            break;
          }
          if (binPath && binContent) {
            window.electron.project.writeFileBinary(binPath, binContent, {
              opId,
              source: 'agent_ws',
            }).catch((err) => {
              console.error('[ChatPanel] file_write_binary failed:', binPath, err);
              const reason = getRendererErrorMessage(
                err,
                'Unknown binary write error.',
              );
              appendSystemMessage(
                `⚠️ Failed to save binary file: ${pathBasename(binPath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_mkdir': {
          const mkdirPath = extractIncomingFileOpPath(data);
          const opId =
            typeof data.opId === 'string' && data.opId.trim()
              ? data.opId
              : undefined;
          if (!mkdirPath) {
            appendSystemMessage(
              '⚠️ Failed to create directory: missing path in server payload.',
              'error',
            );
            break;
          }
          if (isAbsoluteWirePath(mkdirPath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute directory path from server: ${mkdirPath}`,
              'error',
            );
            break;
          }
          if (mkdirPath) {
            window.electron.project.mkdir(mkdirPath, {
              opId,
              source: 'agent_ws',
            }).catch((err) => {
              console.error('[ChatPanel] file_mkdir failed:', mkdirPath, err);
              const reason = getRendererErrorMessage(
                err,
                'Unknown mkdir error.',
              );
              appendSystemMessage(
                `⚠️ Failed to create directory: ${pathBasename(mkdirPath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_rm': {
          const rmPath = extractIncomingFileOpPath(data);
          const opId =
            typeof data.opId === 'string' && data.opId.trim()
              ? data.opId
              : undefined;
          if (!rmPath) {
            appendSystemMessage(
              '⚠️ Failed to delete path: missing path in server payload.',
              'error',
            );
            break;
          }
          if (isAbsoluteWirePath(rmPath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute delete path from server: ${rmPath}`,
              'error',
            );
            break;
          }
          if (rmPath) {
            window.electron.project.delete(rmPath, {
              opId,
              source: 'agent_ws',
            }).catch((err) => {
              console.error('[ChatPanel] file_rm failed:', rmPath, err);
              const reason = getRendererErrorMessage(
                err,
                'Unknown delete error.',
              );
              appendSystemMessage(
                `⚠️ Failed to delete path: ${pathBasename(rmPath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        default:
          console.warn(
            '[ChatPanel] Unhandled message type:',
            messageType,
            payload,
          );
          break;
      }
    },
    [
      appendAssistantChunk,
      appendMessage,
      appendSystemMessage,
      debouncedSetStatus,
      getRendererErrorMessage,
      projectDirectory,
      resolveStopRequest,
    ],
  );

  const connectWebSocket = useCallback(async (): Promise<WebSocket> => {
    // Block connection if project dialog is showing
    if (showProjectDialog && !projectDialogResolved) {
      throw new Error(
        'Project selection dialog is open. Please choose an option first.',
      );
    }

    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    // Prevent concurrent connection attempts
    if (connectingRef.current) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve(wsRef.current);
          } else if (!connectingRef.current) {
            clearInterval(checkInterval);
            reject(new Error('Connection attempt failed'));
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Connection timeout'));
        }, 10000);
      });
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    connectingRef.current = true;
    setConnectionState('connecting');

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        return;
      }

      const attempt = reconnectAttemptRef.current;
      const baseDelay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** attempt,
        RECONNECT_MAX_DELAY_MS,
      );
      const jitter = Math.floor(Math.random() * Math.max(250, baseDelay * 0.3));
      const delay = baseDelay + jitter;
      reconnectAttemptRef.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket().catch((error) => {
          appendConnectionBanner(
            'reconnect_failed',
            `Reconnection failed: ${(error as Error).message}. Retrying...`,
          );
          scheduleReconnect();
        });
      }, delay);
    };

    try {
      const currentState = await window.electron.backend.getState();
      if (currentState.status !== 'ready') {
        const errorMsg = currentState.message
          ? `Backend not ready: ${currentState.message}`
          : `Backend not ready (status: ${currentState.status})`;
        throw new Error(errorMsg);
      }

      const baseUrl = currentState.serverUrl || `http://localhost:${currentState.port ?? 8001}`;
      const wsBase = baseUrl.replace(/^http/, 'ws');
      const url = new URL(DEFAULT_WS_PATH, wsBase);
      url.searchParams.set('channel', 'chat');
      url.searchParams.set('desktop_remotion', '1');
      const appSettings = await window.electron.settings.get().catch(() => null);
      const comfyUIUrl = normalizeHttpUrl(appSettings?.comfyuiUrl);
      if (comfyUIUrl) {
        url.searchParams.set('comfyui_url', comfyUIUrl);
      }

      console.log('[ChatPanel] Connecting to WebSocket:', {
        projectDirectory,
        hasProjectDir: !!projectDirectory,
        serverUrl: baseUrl,
        hasComfyUIUrl: !!comfyUIUrl,
      });

      if (projectDirectory) {
        url.searchParams.set('project_dir', projectDirectory);
        console.log(
          '[ChatPanel] Set project_dir query param:',
          projectDirectory,
        );
      } else {
        console.warn(
          '[ChatPanel] No projectDirectory available - files may not be saved correctly',
        );
      }

      if (sessionIdRef.current) {
        url.searchParams.set('session_id', sessionIdRef.current);
      }

      console.log('[ChatPanel] Final WebSocket URL:', url.toString());

      return await new Promise((resolve, reject) => {
        const socket = new WebSocket(url.toString());
        wsRef.current = socket;

        const timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            connectingRef.current = false;
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        socket.onopen = () => {
          clearTimeout(timeout);
          connectingRef.current = false;
          setConnectionState('connected');
          reconnectAttemptRef.current = 0;
          connectionBannerRef.current = null;
          // Clear connection error messages on successful connect
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                !(
                  msg.role === 'system' &&
                  msg.type === 'error' &&
                  (msg.content?.includes('Connection to backend lost') ||
                    msg.content?.includes('WebSocket connection error') ||
                    msg.content?.includes('Reconnection failed'))
                ),
            ),
          );
          flushPendingOutboundActions(socket);
          resolve(socket);
        };

        socket.onerror = (error) => {
          clearTimeout(timeout);
          connectingRef.current = false;
          console.error('[ChatPanel] WebSocket error:', error);
          appendConnectionBanner(
            'ws_connection_error',
            'WebSocket connection error. Check if backend is running.',
          );
          reject(new Error('WebSocket connection error'));
        };

        socket.onclose = (event) => {
          clearTimeout(timeout);
          connectingRef.current = false;
          setConnectionState('disconnected');
          if (wsRef.current === socket) {
            wsRef.current = null;
          }
          if (event.code !== 1000) {
            appendConnectionBanner(
              'ws_disconnected',
              'Connection to backend lost. Attempting to reconnect...',
            );
            scheduleReconnect();
          }
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            handleServerPayload(payload);
          } catch (error) {
            console.error('[ChatPanel] Error parsing message:', error);
          }
        };
      });
    } catch (error) {
      connectingRef.current = false;
      setConnectionState('disconnected');
      throw error;
    }
  }, [
    appendConnectionBanner,
    flushPendingOutboundActions,
    handleServerPayload,
    projectDirectory,
    showProjectDialog,
    projectDialogResolved,
  ]);

  const sendClientAction = useCallback(
    async (message: Record<string, unknown>) => {
      const serializedMessage = JSON.stringify(message);
      const activeSocket = wsRef.current;

      if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.send(serializedMessage);
        return;
      }

      queueOutboundAction(serializedMessage);
      try {
        const socket = await connectWebSocket();
        flushPendingOutboundActions(socket);
      } catch (error) {
        console.warn(
          '[ChatPanel] Queued outbound action while reconnecting:',
          (error as Error).message,
        );
      }
    },
    [connectWebSocket, flushPendingOutboundActions, queueOutboundAction],
  );

  const sendResponse = useCallback(
    async (content: string) => {
      // Used for clicking options in QuestionPrompt
      window.electron.logger.logUserInput(content);

      // Mark that user has sent their first message
      setHasUserSentMessage(true);

      await sendClientAction({
        type: 'user_response',
        data: { response: content },
      });
      awaitingResponseRef.current = false;
      setAgentStatus('thinking');
      setStatusMessage('Processing...');

      // Clear question ref since we've responded
      lastQuestionMessageIdRef.current = null;

      // Also append user message for visual feedback
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });
    },
    [appendMessage, sendClientAction],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      // Log user input
      window.electron.logger.logUserInput(content);

      // Mark that user has sent their first message
      setHasUserSentMessage(true);
      setIsTaskRunning(true);

      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });

      setAgentStatus('thinking');
      setStatusMessage('Processing...');
      window.electron.logger.logStatusChange(
        'thinking',
        agentName,
        'Processing...',
      );

      if (awaitingResponseRef.current) {
        await sendClientAction({
          type: 'user_response',
          data: { response: content },
        });
        awaitingResponseRef.current = false;
      } else {
        await sendClientAction({
          type: 'start_task',
          data: { task: content },
        });
      }
    },
    [appendMessage, sendClientAction, agentName],
  );

  const requestStop = useCallback(
    async (reason: 'user_stop' | 'project_switch'): Promise<boolean> => {
      const existingRequest = stopRequestRef.current;
      if (existingRequest) {
        return existingRequest.promise;
      }

      if (!isTaskRunningRef.current) {
        return true;
      }

      let resolveStop: ((success: boolean) => void) | null = null;
      const promise = new Promise<boolean>((resolve) => {
        resolveStop = resolve;
      });

      if (!resolveStop) {
        return false;
      }

      const timeoutId = setTimeout(() => {
        resolveStopRequest(
          false,
          'Stop request timed out. Task may still be running.',
        );
      }, STOP_ACK_TIMEOUT_MS);

      stopRequestRef.current = {
        promise,
        resolve: resolveStop,
        timeoutId,
      };

      setIsStopPending(true);
      setStatusMessage('Stopping...');

      await sendClientAction({
        type: 'cancel',
        data: { reason },
      });

      return promise;
    },
    [resolveStopRequest, sendClientAction],
  );

  const stopTask = useCallback(async () => {
    await requestStop('user_stop');
  }, [requestStop]);

  useEffect(() => {
    return registerProjectSwitchGuard(async ({ fromProjectDirectory }) => {
      if (!isTaskRunningRef.current && !isStopPendingRef.current) {
        return true;
      }

      const shouldSwitch = window.confirm(
        'Switching project will stop the current task. Continue?',
      );
      if (!shouldSwitch) {
        return false;
      }

      const stopped = await requestStop('project_switch');
      if (!stopped) {
        return false;
      }

      failActiveToolCalls('Cancelled due to project switch');
      flushSnapshotSave(fromProjectDirectory);
      return true;
    });
  }, [
    failActiveToolCalls,
    flushSnapshotSave,
    registerProjectSwitchGuard,
    requestStop,
  ]);

  // Register sendMessage so other components can trigger agent tasks (e.g. Render Infographics)
  useEffect(() => {
    if (agentContext?.registerSendTask) {
      return agentContext.registerSendTask(sendMessage);
    }
  }, [agentContext?.registerSendTask, sendMessage]);

  useEffect(() => {
    scheduleSnapshotSave(projectDirectory);
  }, [
    projectDirectory,
    messages,
    agentStatus,
    agentName,
    statusMessage,
    currentPhase,
    phaseDisplayName,
    hasUserSentMessage,
    isTaskRunning,
    sessionId,
    scheduleSnapshotSave,
  ]);

  useEffect(() => {
    const bootstrap = async () => {
      const state = await window.electron.backend.getState();
      if (
        state.status === 'ready' &&
        !wsRef.current &&
        !connectingRef.current &&
        (projectDialogResolved || !projectDirectory)
      ) {
        connectWebSocket().catch(() => undefined);
      }
    };
    bootstrap().catch(() => { });

    const unsubscribeBackend = window.electron.backend.onStateChange(
      (state: BackendState) => {
        if (state.status === 'error' && state.message) {
          appendSystemMessage(`Backend error: ${state.message}`, 'error');
        } else if (
          state.status === 'ready' &&
          !connectingRef.current &&
          (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) &&
          projectDialogResolved // Only auto-connect if dialog is resolved
        ) {
          connectWebSocket().catch(() => undefined);
        }
      },
    );

    return () => {
      unsubscribeBackend();
    };
  }, [
    connectWebSocket,
    appendSystemMessage,
    projectDirectory,
    projectDialogResolved,
  ]);

  useEffect(() => {
    return () => {
      const pendingStop = stopRequestRef.current;
      if (pendingStop) {
        clearTimeout(pendingStop.timeoutId);
        stopRequestRef.current = null;
        pendingStop.resolve(false);
      }
      flushSnapshotSave(currentProjectDirectoryRef.current);
      disconnectWebSocket();
      if (statusUpdateTimeoutRef.current) {
        clearTimeout(statusUpdateTimeoutRef.current);
      }
    };
  }, [disconnectWebSocket, flushSnapshotSave]);

  // Restore chat snapshots and reconnect when workspace changes.
  const prevProjectDirectoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (projectDirectory === prevProjectDirectoryRef.current) {
      return;
    }

    const previousProjectDirectory = prevProjectDirectoryRef.current;
    prevProjectDirectoryRef.current = projectDirectory || null;
    currentProjectDirectoryRef.current = projectDirectory || null;

    const pendingStop = stopRequestRef.current;
    if (pendingStop) {
      clearTimeout(pendingStop.timeoutId);
      stopRequestRef.current = null;
      pendingStop.resolve(false);
    }

    console.log('[ChatPanel] projectDirectory changed:', {
      newValue: projectDirectory,
      hasValue: !!projectDirectory,
    });

    if (previousProjectDirectory) {
      flushSnapshotSave(previousProjectDirectory);
    }

    disconnectWebSocket();
    reconnectAttemptRef.current = 0;
    connectionBannerRef.current = null;
    pendingOutboundActionsRef.current = [];
    setProjectDialogResolved(false);
    setShowProjectDialog(false);

    if (!projectDirectory) {
      resetConversationRefs();
      setMessages([]);
      setSessionId(null);
      setAgentStatus('idle');
      setAgentName('Kshana');
      setStatusMessage('Ready');
      setCurrentPhase(undefined);
      setPhaseDisplayName(undefined);
      setHasUserSentMessage(false);
      setIsTaskRunning(false);
      setIsStopPending(false);
      return;
    }

    const reconnect = async () => {
      try {
        await restoreSnapshot(projectDirectory);

        const state = await window.electron.backend.getState();
        if (state.status === 'ready') {
          try {
            const projectFilePath = `${projectDirectory}/.kshana/agent/project.json`;
            const exists = await window.electron.project.checkFileExists(projectFilePath);
            if (exists) {
              setShowProjectDialog(true);
              return; // Don't connect yet, wait for user decision
            }
          } catch (error) {
            console.error('[ChatPanel] Error checking project:', error);
          }
          setProjectDialogResolved(true);
          await connectWebSocket();
        }
      } catch (error) {
        console.error('[ChatPanel] Reconnect failed:', error);
      }
    };
    reconnect().catch(() => undefined);
  }, [
    connectWebSocket,
    disconnectWebSocket,
    flushSnapshotSave,
    projectDirectory,
    resetConversationRefs,
    restoreSnapshot,
  ]);

  const handleProjectContinue = useCallback(() => {
    setShowProjectDialog(false);
    setProjectDialogResolved(true);
    // Now connect WebSocket
    connectWebSocket().catch(() => undefined);
  }, [connectWebSocket]);

  const handleProjectStartNew = useCallback(() => {
    setShowProjectDialog(false);
    setProjectDialogResolved(true);
    clearChat();
    pendingOutboundActionsRef.current = [];
    reconnectAttemptRef.current = 0;
    // Project deletion is handled by ProjectSelectionDialog
    // Now connect WebSocket
    connectWebSocket().catch(() => undefined);
  }, [clearChat, connectWebSocket]);

  const handleExportChat = useCallback(async () => {
    if (!projectDirectory) {
      appendSystemMessage('Open a project before exporting chat history.', 'error');
      return;
    }

    const exportPayload: ChatExportPayload = {
      exportedAt: new Date().toISOString(),
      projectDirectory,
      sessionId: sessionIdRef.current,
      messages: messagesRef.current.map(
        (message) =>
          ({
            id: message.id,
            role: message.role,
            type: message.type,
            content: message.content,
            timestamp: message.timestamp,
            author: message.author,
            meta: message.meta,
          }) as PersistedChatMessage,
      ),
    };

    const result = await window.electron.project.exportChatJson(exportPayload);
    if (!result.success && !result.canceled) {
      appendSystemMessage(
        `Failed to export chat JSON: ${result.error || 'Unknown error'}`,
        'error',
      );
    }
  }, [appendSystemMessage, projectDirectory]);

  // Filter out greeting messages if user has sent a message
  const filteredMessages = useMemo(() => {
    if (hasUserSentMessage) {
      return messages.filter(
        (msg) => !(msg.type === 'greeting' && msg.role === 'system'),
      );
    }
    return messages;
  }, [messages, hasUserSentMessage]);

  return (
    <>
      {showProjectDialog && projectDirectory && (
        <ProjectSelectionDialog
          projectDirectory={projectDirectory}
          onContinue={handleProjectContinue}
          onStartNew={handleProjectStartNew}
        />
      )}
      <div className={styles.container}>
        <div className={styles.header}>
          <Bot size={18} className={styles.headerIcon} />
          <span className={styles.headerTitle}>Kshana Assistant</span>
          <button
            type="button"
            className={styles.exportButton}
            onClick={handleExportChat}
            title="Export chat history as JSON"
            aria-label="Export chat history as JSON"
          >
            <Download size={14} />
            <span>Export Chat</span>
          </button>
          <button
            type="button"
            className={styles.clearButton}
            onClick={clearChat}
            title="Clear chat"
          >
            <Trash2 size={14} />
            <span>Clear</span>
          </button>
        </div>

        {/* New Status Bar */}
        <StatusBar
          agentName={agentName}
          status={agentStatus}
          message={statusMessage}
          currentPhase={currentPhase}
          phaseDisplayName={phaseDisplayName}
        />

        <div className={styles.messages}>
          <MessageList
            messages={filteredMessages}
            isStreaming={isStreaming}
            onDelete={deleteMessage}
            onResponse={sendResponse} // Pass down to MessageBubble
          />
        </div>

        <ChatInput
          disabled={connectionState === 'connecting'}
          isRunning={isTaskRunning}
          isStopping={isStopPending}
          onSend={sendMessage}
          onStop={stopTask}
        />
      </div>
    </>
  );
}
