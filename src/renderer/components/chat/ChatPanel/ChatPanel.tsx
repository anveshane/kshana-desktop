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

  const { setConnectionStatus } = useWorkspace();

  const wsRef = useRef<WebSocket | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
          return [...prev, { id, role: 'system', type, content, timestamp: Date.now() }];
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
    // Re-add greeting
    setTimeout(() => {
      setMessages([
        {
          id: makeId(),
          role: 'assistant',
          type: 'greeting',
          content: 'Hello! I am Kshana. How can I assist you with your project today?',
          timestamp: Date.now(),
        },
      ]);
    }, 0);
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const appendAssistantChunk = useCallback((content: string, type: string) => {
    if (!content) return;
    setMessages((prev) => {
      // Stream chunks into existing message if available
      const streamingTypes = ['text_chunk', 'agent_text', 'coordinator_response'];
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

  const handleServerPayload = useCallback(
    (payload: Record<string, unknown>) => {
      switch (payload.type) {
        case 'status':
          appendSystemMessage((payload.message as string) ?? 'Status update');
          break;
        case 'progress': {
          const { phase, percent, current, total } = payload;
          const details = [
            phase ? `Phase: ${phase}` : null,
            typeof percent === 'number' ? `Progress: ${percent}%` : null,
            current && total ? `Scenes: ${current}/${total}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          appendSystemMessage(details || 'Progress update', 'progress');
          break;
        }
        case 'scene_complete': {
          const sceneMsg = `Scene ${payload.scene_number} completed`;
          appendSystemMessage(sceneMsg, 'scene_complete');
          break;
        }
        case 'tool_call':
          appendMessage({
            role: 'system',
            type: 'tool_call',
            content: `Calling ${(payload.tool_name as string) || 'tool'}…`,
            meta: {
              tool_name: (payload.tool_name as string) || 'tool',
            },
          });
          break;
        case 'text_chunk':
          appendAssistantChunk((payload.content as string) ?? '', 'text_chunk');
          break;
        case 'coordinator_response':
          appendAssistantChunk(
            (payload.content as string) ?? '',
            'coordinator_response',
          );
          break;
        case 'final_response':
          lastAssistantIdRef.current = null;
          setIsStreaming(false);
          appendAssistantChunk(
            (payload.response as string) ?? '',
            'final_response',
          );
          break;
        case 'greeting': {
          const suggestions = payload.suggested_actions
            ? `\n• ${(payload.suggested_actions as string[]).join('\n• ')}`
            : '';
          appendSystemMessage(
            `${(payload.greeting_message as string) ?? 'Hello!'}${suggestions}`,
            'greeting',
          );
          break;
        }
        case 'error':
          appendSystemMessage(
            `${payload.error}: ${(payload.details as string) ?? ''}`,
            'error',
          );
          break;
        case 'agent_response': {
          // Agent response with content
          const content = (payload.content as string) ?? '';
          if (content) {
            appendAssistantChunk(content, 'agent_response');
          }
          break;
        }
        case 'agent_text': {
          // Streaming agent text chunks
          const text = (payload.text as string) ?? '';
          const isFinal = (payload.is_final as boolean) ?? false;
          if (text) {
            appendAssistantChunk(text, 'agent_text');
          }
          if (isFinal) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
          }
          break;
        }
        case 'agent_question': {
          // Agent is asking user a question (e.g., prompt approval)
          const question =
            (payload.question as string) || (payload.content as string) || '';
          if (question) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            appendAssistantChunk(question, 'agent_question');
          }
          break;
        }
        case 'notification': {
          // Notification from tool execution
          const message = (payload.message as string) ?? '';
          if (message) {
            appendSystemMessage(message, 'notification');
          }
          break;
        }
        case 'clarifying_questions': {
          // System asking for more information
          const questions = payload.questions as string[];
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
        case 'todo_update': {
          // Todo list update - show as status
          const todos = payload.todos as Array<{
            title?: string;
            status?: string;
            visible?: boolean;
          }>;
          if (todos?.length) {
            const visibleTodos = todos.filter((t) => t.visible !== false);
            if (visibleTodos.length) {
              const todoText = visibleTodos
                .map((t) => {
                  const icon =
                    t.status === 'completed'
                      ? '✓'
                      : t.status === 'in_progress'
                        ? '⏳'
                        : '○';
                  return `${icon} ${t.title || 'Task'}`;
                })
                .join('\n');
              appendSystemMessage(todoText, 'todo_update');
            }
          }
          break;
        }
        case 'agent_event': {
          // Agent/tool event notification
          const name = (payload.name as string) || 'Agent';
          const status = (payload.status as string) || 'update';
          appendSystemMessage(`${name}: ${status}`, 'agent_event');
          break;
        }
        case 'phase_transition': {
          // Phase transition notification
          const newPhase = payload.new_phase as string;
          const description = payload.description as string;
          if (newPhase) {
            appendSystemMessage(
              description || `Transitioning to ${newPhase}`,
              'phase_transition',
            );
          }
          break;
        }
        case 'comfyui_progress': {
          // ComfyUI generation progress
          const sceneNum = payload.scene_number as number;
          const progressStatus = payload.status as string;
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
          console.log('Unhandled event:', payload.type, payload);
      }
    },
    [appendAssistantChunk, appendSystemMessage],
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
        throw new Error(`Backend not ready (status: ${currentState.status})`);
      }

      const port = currentState.port ?? 8001;
      const url = new URL(DEFAULT_WS_PATH, `http://127.0.0.1:${port}`);
      url.protocol = 'ws:';

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
              connectWebSocket().catch(() => { });
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
  }, [appendSystemMessage, handleServerPayload, setConnectionStatus]);

  const sendMessage = useCallback(
    async (content: string) => {
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });

      try {
        const socket = await connectWebSocket();
        socket.send(JSON.stringify({ message: content }));
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

    bootstrap().catch(() => { });

    const unsubscribeBackend = window.electron.backend.onStateChange(
      (state: BackendState) => {
        if (
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

  // Show initial greeting if no messages
  useEffect(() => {
    if (messages.length === 0) {
      appendMessage({
        role: 'assistant',
        type: 'greeting',
        content:
          'Hello! I am Kshana. How can I assist you with your project today?',
      });
    }
  }, [messages.length, appendMessage]);

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
