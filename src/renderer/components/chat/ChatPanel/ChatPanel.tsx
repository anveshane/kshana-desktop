import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Trash2 } from 'lucide-react';
import type { BackendState } from '../../../../shared/backendTypes';
import type { ChatMessage } from '../../../types/chat';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import MessageList from '../MessageList';
import ChatInput from '../ChatInput';
import QuickActions from '../QuickActions/QuickActions';
import styles from './ChatPanel.module.scss';

// Message types that shouldn't create new messages if same type already exists
const DEDUPE_TYPES = ['progress', 'comfyui_progress'];

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const DEFAULT_WS_PATH = '/api/v1/ws/chat';

const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);

  const { setConnectionStatus, projectDirectory } = useWorkspace();

  const wsRef = useRef<WebSocket | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const awaitingResponseRef = useRef(false);

  const appendMessage = useCallback(
    (message: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<ChatMessage>) => {
      const id = message.id ?? makeId();
      const timestamp = message.timestamp ?? Date.now();
      setMessages((prev) => [...prev, { ...message, id, timestamp }]);
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

  const clearChat = useCallback(() => {
    setMessages([]);
    lastAssistantIdRef.current = null;
    awaitingResponseRef.current = false;
    // Backend will send greeting via WebSocket when connection is re-established
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const appendAssistantChunk = useCallback((content: string, type: string) => {
    if (!content) return;
    setMessages((prev) => {
      // Stream chunks into existing message if available
      const streamingTypes = [
        'text_chunk',
        'agent_text',
        'coordinator_response',
      ];
      if (streamingTypes.includes(type) && lastAssistantIdRef.current) {
        setIsStreaming(true);
        return prev.map((message) =>
          message.id === lastAssistantIdRef.current
            ? { ...message, content: `${message.content}${content}` }
            : message,
        );
      }

      const id = makeId();
      lastAssistantIdRef.current = id;
      setIsStreaming(streamingTypes.includes(type));
      return [
        ...prev,
        {
          id,
          role: 'assistant',
          type,
          content,
          timestamp: Date.now(),
        },
      ];
    });
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Handle server payload from kshana-ink WebSocket.
   * kshana-ink messages have the format: { type, sessionId, timestamp, data: {...} }
   */
  const handleServerPayload = useCallback(
    (payload: Record<string, unknown>) => {
      // Extract data from kshana-ink message format
      const data = (payload.data as Record<string, unknown>) ?? payload;
      const messageType = payload.type as string;

      switch (messageType) {
        case 'status': {
          // kshana-ink status: { status: 'connected' | 'ready' | 'busy' | 'completed' | 'error', message?: string }
          const statusMsg = (data.message as string) ?? (data.status as string) ?? 'Status update';
          // Send greeting on first connection
          if (data.status === 'connected') {
            setMessages((prev) => {
              const hasGreeting = prev.some(
                (msg) => msg.type === 'greeting',
              );
              if (hasGreeting) return prev;
              return [
                ...prev,
                {
                  id: makeId(),
                  role: 'system',
                  type: 'greeting',
                  content: 'Hello! I\'m your Kshana video generation assistant. Tell me about the video you\'d like to create!',
                  timestamp: Date.now(),
                },
              ];
            });
          } else if (statusMsg && data.status !== 'busy') {
            appendSystemMessage(statusMsg);
          }
          break;
        }
        case 'progress': {
          // kshana-ink progress: { iteration, maxIterations, status }
          const { iteration, maxIterations, status: progressStatus } = data;
          const percent = maxIterations ? Math.round(((iteration as number) / (maxIterations as number)) * 100) : 0;
          const details = [
            progressStatus ? `${progressStatus}` : null,
            percent ? `Progress: ${percent}%` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          appendSystemMessage(details || 'Progress update', 'progress');
          break;
        }
        case 'stream_chunk': {
          // kshana-ink stream_chunk: { content, done }
          const content = (data.content as string) ?? '';
          const done = (data.done as boolean) ?? false;
          if (content) {
            appendAssistantChunk(content, 'stream_chunk');
          }
          if (done) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
          }
          break;
        }
        case 'stream_end': {
          lastAssistantIdRef.current = null;
          setIsStreaming(false);
          break;
        }
        case 'tool_call': {
          // kshana-ink tool_call: { toolName, toolCallId, arguments, status, result?, error? }
          const toolName = (data.toolName as string) ?? 'tool';
          const toolStatus = (data.status as string) ?? 'started';
          if (toolStatus === 'started') {
            appendMessage({
              role: 'system',
              type: 'tool_call',
              content: `Calling ${toolName}…`,
              meta: {
                tool_name: toolName,
              },
            });
          } else if (toolStatus === 'completed') {
            appendSystemMessage(`${toolName} completed`, 'tool_result');
          } else if (toolStatus === 'error') {
            appendSystemMessage(`${toolName} failed: ${data.error || 'Unknown error'}`, 'error');
          }
          break;
        }
        case 'agent_response': {
          // kshana-ink agent_response: { output, status }
          const output = (data.output as string) ?? '';
          const responseStatus = data.status as string;
          if (output) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            appendAssistantChunk(output, 'agent_response');
          }
          // If completed, show completion message
          if (responseStatus === 'completed') {
            // Task completed - no need to show additional message
          } else if (responseStatus === 'error') {
            appendSystemMessage('An error occurred while processing your request.', 'error');
          }
          break;
        }
        case 'agent_question': {
          // kshana-ink agent_question: { question, toolCallId }
          const question = (data.question as string) ?? '';
          if (question) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            appendAssistantChunk(question, 'agent_question');
            // Mark that we're awaiting a user response
            awaitingResponseRef.current = true;
          }
          break;
        }
        case 'todo_update': {
          // kshana-ink todo_update: { todos: [{ id, task, status, depth, hasSubtasks, parentId? }] }
          const todos = data.todos as Array<{
            id?: string;
            task?: string;
            status?: string;
            depth?: number;
          }>;
          if (todos?.length) {
            const todoText = todos
              .map((t) => {
                const icon =
                  t.status === 'completed'
                    ? '✓'
                    : t.status === 'in_progress'
                      ? '⏳'
                      : t.status === 'cancelled'
                        ? '✗'
                        : '○';
                const indent = '  '.repeat(t.depth ?? 0);
                return `${indent}${icon} ${t.task || 'Task'}`;
              })
              .join('\n');
            appendSystemMessage(todoText, 'todo_update');
          }
          break;
        }
        case 'error': {
          // kshana-ink error: { code, message, details? }
          const errorMsg = (data.message as string) ?? 'An error occurred';
          const errorCode = (data.code as string) ?? '';
          appendSystemMessage(
            errorCode ? `Error (${errorCode}): ${errorMsg}` : errorMsg,
            'error',
          );
          break;
        }
        // Legacy message types for backwards compatibility
        case 'text_chunk':
          appendAssistantChunk((data.content as string) ?? (payload.content as string) ?? '', 'text_chunk');
          break;
        case 'coordinator_response':
          appendAssistantChunk(
            (data.content as string) ?? (payload.content as string) ?? '',
            'coordinator_response',
          );
          break;
        case 'final_response':
          lastAssistantIdRef.current = null;
          setIsStreaming(false);
          appendAssistantChunk(
            (data.response as string) ?? (payload.response as string) ?? '',
            'final_response',
          );
          break;
        case 'greeting': {
          setMessages((prev) => {
            const hasGreeting = prev.some(
              (msg) => msg.type === 'greeting',
            );
            if (hasGreeting) return prev;
            const suggestions = (data.suggested_actions || payload.suggested_actions)
              ? `\n• ${((data.suggested_actions || payload.suggested_actions) as string[]).join('\n• ')}`
              : '';
            const greetingContent = `${(data.greeting_message as string) ?? (payload.greeting_message as string) ?? 'Hello!'}${suggestions}`;
            return [
              ...prev,
              {
                id: makeId(),
                role: 'system',
                type: 'greeting',
                content: greetingContent,
                timestamp: Date.now(),
              },
            ];
          });
          break;
        }
        case 'agent_text': {
          const text = (data.text as string) ?? (payload.text as string) ?? '';
          const isFinal = (data.is_final as boolean) ?? (payload.is_final as boolean) ?? false;
          if (text) {
            appendAssistantChunk(text, 'agent_text');
          }
          if (isFinal) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
          }
          break;
        }
        case 'notification': {
          const message = (data.message as string) ?? (payload.message as string) ?? '';
          if (message) {
            appendSystemMessage(message, 'notification');
          }
          break;
        }
        case 'scene_complete': {
          const sceneMsg = `Scene ${data.scene_number ?? payload.scene_number} completed`;
          appendSystemMessage(sceneMsg, 'scene_complete');
          break;
        }
        case 'clarifying_questions': {
          const questions = (data.questions ?? payload.questions) as string[];
          if (questions?.length) {
            const questionText = questions
              .map((q, i) => `${i + 1}. ${q}`)
              .join('\n');
            appendSystemMessage(
              `I need a bit more information:\n${questionText}`,
              'clarifying_questions',
            );
          }
          break;
        }
        case 'agent_event': {
          const name = (data.name as string) ?? (payload.name as string) ?? 'Agent';
          const eventStatus = (data.status as string) ?? (payload.status as string) ?? 'update';
          appendSystemMessage(`${name}: ${eventStatus}`, 'agent_event');
          break;
        }
        case 'phase_transition': {
          const newPhase = (data.new_phase as string) ?? (payload.new_phase as string);
          const description = (data.description as string) ?? (payload.description as string);
          if (newPhase) {
            appendSystemMessage(
              description || `Transitioning to ${newPhase}`,
              'phase_transition',
            );
          }
          break;
        }
        case 'comfyui_progress': {
          const sceneNum = (data.scene_number as number) ?? (payload.scene_number as number);
          const progressStatus = (data.status as string) ?? (payload.status as string);
          if (sceneNum && progressStatus) {
            appendSystemMessage(
              `Scene ${sceneNum}: ${progressStatus}`,
              'comfyui_progress',
            );
          }
          break;
        }
        case 'pattern_detected':
        case 'context_update':
          // Silent events - no display needed
          break;
        default:
          // Log unknown events for debugging but don't clutter UI
          console.log('Unhandled event:', messageType, payload);
      }
    },
    [appendAssistantChunk, appendMessage, appendSystemMessage],
  );

  const connectWebSocket = useCallback(async (): Promise<WebSocket> => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionState('connecting');
    try {
      const currentState = await window.electron.backend.getState();
      if (currentState.status !== 'ready') {
        const errorMsg = currentState.message 
          ? `Backend not ready: ${currentState.message}`
          : `Backend not ready (status: ${currentState.status})`;
        throw new Error(errorMsg);
      }

      const port = currentState.port ?? 8001;
      const url = new URL(DEFAULT_WS_PATH, `http://127.0.0.1:${port}`);
      url.protocol = 'ws:';

      // Pass user's workspace directory to backend so it creates .kshana/ there
      if (projectDirectory) {
        url.searchParams.set('project_dir', projectDirectory);
      }

      return await new Promise((resolve, reject) => {
        const socket = new WebSocket(url.toString());
        wsRef.current = socket;

        const timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        socket.onopen = () => {
          clearTimeout(timeout);
          setConnectionState('connected');
          // Connection status is now managed by useBackendHealth hook
          // Don't set it here to avoid overriding actual health checks
          resolve(socket);
        };

        socket.onerror = () => {
          clearTimeout(timeout);
        };

        socket.onclose = (event) => {
          clearTimeout(timeout);
          setConnectionState('disconnected');
          // Connection status is now managed by useBackendHealth hook
          // Don't set it here to avoid overriding actual health checks
          wsRef.current = null;

          if (event.code !== 1000) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket().catch(() => {});
            }, 3000);
          }
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            handleServerPayload(payload);
          } catch (error) {
            appendSystemMessage(
              `Failed to parse message: ${(error as Error).message}`,
              'error',
            );
          }
        };
      });
    } catch (error) {
      setConnectionState('disconnected');
      throw error;
    }
  }, [
    appendSystemMessage,
    handleServerPayload,
    setConnectionStatus,
    projectDirectory,
  ]);

  const sendMessage = useCallback(
    async (content: string) => {
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });

      try {
        const socket = await connectWebSocket();

        // Use kshana-ink message format
        // If we're responding to an agent question, use user_response type
        // Otherwise, use start_task type for new tasks
        if (awaitingResponseRef.current) {
          socket.send(JSON.stringify({
            type: 'user_response',
            data: { response: content },
          }));
          awaitingResponseRef.current = false;
        } else {
          socket.send(JSON.stringify({
            type: 'start_task',
            data: { task: content },
          }));
        }
      } catch (error) {
        appendSystemMessage(
          `Unable to send message: ${(error as Error).message}`,
          'error',
        );
      }
    },
    [appendMessage, connectWebSocket, appendSystemMessage],
  );

  const handleQuickAction = useCallback(
    (action: string) => {
      const actionMessages: Record<string, string> = {
        generate_concept: 'Generate a creative concept for my video project',
        analyze_script: 'Analyze the current script and provide suggestions',
        new_task: 'Start a new task',
      };
      const message = actionMessages[action];
      if (message) {
        sendMessage(message);
      }
    },
    [sendMessage],
  );

  useEffect(() => {
    const bootstrap = async () => {
      const state = await window.electron.backend.getState();

      if (state.status === 'ready' && !wsRef.current) {
        connectWebSocket().catch(() => undefined);
      }
    };

    bootstrap().catch(() => {});

    const unsubscribeBackend = window.electron.backend.onStateChange(
      (state: BackendState) => {
        if (state.status === 'error' && state.message) {
          // Show backend error message to user
          appendSystemMessage(
            `Backend error: ${state.message}`,
            'error',
          );
        } else if (
          state.status === 'ready' &&
          !connectingRef.current &&
          !wsRef.current
        ) {
          connectingRef.current = true;
          connectWebSocket()
            .catch(() => undefined)
            .finally(() => {
              connectingRef.current = false;
            });
        }
      },
    );

    return () => {
      unsubscribeBackend();
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear chat and reconnect when workspace changes
  useEffect(() => {
    if (!projectDirectory) return;

    // Clear existing chat messages
    setMessages([]);
    lastAssistantIdRef.current = null;
    awaitingResponseRef.current = false;
    setIsStreaming(false);

    // Disconnect existing WebSocket connection
    if (wsRef.current) {
      wsRef.current.close(1000, 'Workspace changed');
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnectionState('disconnected');

    // Reconnect with new project directory to get fresh greeting
    const reconnect = async () => {
      try {
        const state = await window.electron.backend.getState();
        if (state.status === 'ready') {
          await connectWebSocket();
        }
      } catch {
        // Connection will be retried when backend becomes ready
      }
    };

    reconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectory]);

  // Backend will send greeting via WebSocket when connection is established
  // No need to add client-side greeting to avoid duplicates

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Bot size={18} className={styles.headerIcon} />
        <span className={styles.headerTitle}>Kshana Assistant</span>
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

      <div className={styles.messages}>
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onDelete={deleteMessage}
        />
      </div>

      <QuickActions
        onAction={handleQuickAction}
        disabled={connectionState === 'connecting'}
      />

      <ChatInput
        disabled={connectionState === 'connecting'}
        onSend={sendMessage}
      />
    </div>
  );
}
