import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import type { BackendState } from '../../../../shared/backendTypes';
import type { ChatMessage } from '../../../types/chat';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import MessageList from '../../MessageList';
import ChatInput from '../../ChatInput';
import QuickActions from '../QuickActions/QuickActions';
import styles from './ChatPanel.module.scss';

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
      appendMessage({
        role: 'system',
        type,
        content,
      });
    },
    [appendMessage],
  );

  const appendAssistantChunk = useCallback((content: string, type: string) => {
    if (!content) return;
    setMessages((prev) => {
      if (type === 'text_chunk' && lastAssistantIdRef.current) {
        return prev.map((message) =>
          message.id === lastAssistantIdRef.current
            ? { ...message, content: `${message.content}${content}` }
            : message,
        );
      }

      const id = makeId();
      lastAssistantIdRef.current = id;
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
          appendSystemMessage(
            `Calling ${(payload.tool_name as string) || 'tool'}…`,
            'tool_call',
          );
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
        default:
          appendSystemMessage(
            `Event: ${(payload.type as string) ?? 'unknown'}`,
            (payload.type as string) ?? 'event',
          );
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
          setConnectionStatus('lmStudio', 'connected');
          setConnectionStatus('comfyUI', 'connected');
          resolve(socket);
        };

        socket.onerror = () => {
          clearTimeout(timeout);
        };

        socket.onclose = (event) => {
          clearTimeout(timeout);
          setConnectionState('disconnected');
          setConnectionStatus('lmStudio', 'disconnected');
          setConnectionStatus('comfyUI', 'disconnected');
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

    bootstrap().catch(() => {});

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
      </div>

      <div className={styles.messages}>
        <MessageList messages={messages} />
      </div>

      <QuickActions
        onAction={handleQuickAction}
        disabled={connectionState === 'connecting'}
      />

      <div className={styles.inputWrapper}>
        <ChatInput
          disabled={connectionState === 'connecting'}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
}
