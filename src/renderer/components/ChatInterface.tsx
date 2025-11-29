import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BackendEnvOverrides,
  BackendState,
} from '../../shared/backendTypes';
import type { AppSettings } from '../../shared/settingsTypes';
import MessageList from './chat/MessageList';
import ChatInput from './chat/ChatInput';
import SettingsPanel from './SettingsPanel';
import type { ChatMessage } from '../types/chat';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const DEFAULT_WS_PATH = '/api/v1/ws/chat';

const mapSettingsToEnv = (settings: AppSettings): BackendEnvOverrides => ({
  port: settings.preferredPort,
  comfyuiUrl: settings.comfyuiUrl,
  lmStudioUrl: settings.lmStudioUrl,
  lmStudioModel: settings.lmStudioModel,
  llmProvider: settings.llmProvider,
  googleApiKey: settings.googleApiKey,
  projectDir: settings.projectDir,
});

const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [backendState, setBackendState] = useState<BackendState>({
    status: 'idle',
  });
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);

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
      // If we have an active assistant message, update it
      if (lastAssistantIdRef.current) {
        return prev.map((message) => {
          if (message.id === lastAssistantIdRef.current) {
            // For text chunks, append. For full replacements (like agent_text), replace.
            const newContent =
              type === 'text_chunk' ? `${message.content}${content}` : content;
            return { ...message, content: newContent, type };
          }
          return message;
        });
      }

      // Otherwise create a new one
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
    (payload: Record<string, any>) => {
      switch (payload.type) {
        case 'status':
          appendSystemMessage(payload.message ?? 'Status update');
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
            `Calling ${payload.tool_name || 'tool'}…`,
            'tool_call',
          );
          break;
        case 'text_chunk':
          setIsStreaming(true);
          appendAssistantChunk(payload.content ?? '', 'text_chunk');
          break;
        case 'coordinator_response':
          setIsStreaming(true);
          appendAssistantChunk(payload.content ?? '', 'coordinator_response');
          break;
        case 'agent_response':
          setIsStreaming(true);
          // Start a new message or update existing
          appendAssistantChunk(payload.content ?? '', 'agent_response');
          break;
        case 'agent_text':
          // Final text update
          appendAssistantChunk(payload.text ?? '', 'agent_text');
          if (payload.is_final) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
          }
          break;
        case 'final_response':
          lastAssistantIdRef.current = null;
          setIsStreaming(false);
          appendAssistantChunk(payload.response ?? '', 'final_response');
          break;
        case 'greeting': {
          const suggestions = payload.suggested_actions
            ? `\n• ${payload.suggested_actions.join('\n• ')}`
            : '';
          appendSystemMessage(
            `${payload.greeting_message ?? 'Hello!'}${suggestions}`,
            'greeting',
          );
          break;
        }
        case 'error':
          setIsStreaming(false);
          appendSystemMessage(
            `${payload.error}: ${payload.details ?? ''}`,
            'error',
          );
          break;
        default:
          appendSystemMessage(
            `Event: ${payload.type ?? 'unknown'}`,
            payload.type ?? 'event',
          );
      }
    },
    [appendAssistantChunk, appendSystemMessage],
  );

  const connectWebSocket = useCallback(async (): Promise<WebSocket> => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    // Clear any pending reconnects
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionState('connecting');
    try {
      // Always get the latest state to ensure we have the correct port
      const currentState = await window.electron.backend.getState();
      if (currentState.status !== 'ready') {
        throw new Error(`Backend not ready (status: ${currentState.status})`);
      }
      setBackendState(currentState);

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
        }, 10000); // 10 second timeout

        socket.onopen = () => {
          clearTimeout(timeout);
          setConnectionState('connected');
          appendSystemMessage('Connected to backend', 'connection');
          resolve(socket);
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          // Don't reject here, let onclose handle it
        };

        socket.onclose = (event) => {
          clearTimeout(timeout);
          setConnectionState('disconnected');
          wsRef.current = null;
          setIsStreaming(false); // Ensure streaming stops on disconnect

          if (event.code !== 1000) {
            // Not a normal closure
            appendSystemMessage(
              'Connection lost. Reconnecting in 3s...',
              'connection',
            );
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket().catch((err) => {
                console.error('Reconnect failed:', err);
              });
            }, 3000);
          } else {
            appendSystemMessage('Connection closed', 'connection');
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
      appendSystemMessage(
        `Backend not ready: ${(error as Error).message}`,
        'error',
      );
      throw error;
    }
  }, [appendSystemMessage, handleServerPayload]);

  const sendMessage = useCallback(
    async (content: string) => {
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });
      setIsStreaming(true);

      try {
        const socket = await connectWebSocket();
        socket.send(JSON.stringify({ message: content }));
      } catch (error) {
        setIsStreaming(false);
        appendSystemMessage(
          `Unable to send message: ${(error as Error).message}`,
          'error',
        );
      }
    },
    [appendMessage, connectWebSocket, appendSystemMessage],
  );

  const handleSaveSettings = useCallback(
    async (next: AppSettings) => {
      setIsRestartingBackend(true);
      try {
        const updated = await window.electron.settings.update(next);
        setSettings(updated);
        await window.electron.backend.restart(mapSettingsToEnv(updated));
        appendSystemMessage('Backend restarted with new settings', 'settings');
        await connectWebSocket();
        setSettingsOpen(false);
      } catch (error) {
        appendSystemMessage(
          `Failed to restart backend: ${(error as Error).message}`,
          'error',
        );
      } finally {
        setIsRestartingBackend(false);
      }
    },
    [appendSystemMessage, connectWebSocket],
  );

  useEffect(() => {
    const bootstrap = async () => {
      const [state, storedSettings] = await Promise.all([
        window.electron.backend.getState(),
        window.electron.settings.get(),
      ]);
      setBackendState(state);
      setSettings(storedSettings);

      // Auto-connect if ready
      if (state.status === 'ready' && !wsRef.current) {
        connectWebSocket().catch(() => undefined);
      }
    };

    bootstrap();

    const unsubscribeBackend = window.electron.backend.onStateChange(
      (state) => {
        setBackendState(state);
        if (
          state.status === 'ready' &&
          !connectingRef.current &&
          !wsRef.current
        ) {
          connectingRef.current = true;
          connectWebSocket()
            .finally(() => {
              connectingRef.current = false;
            })
            .catch(() => undefined);
        }
      },
    );

    const unsubscribeSettings = window.electron.settings.onChange((next) => {
      setSettings(next);
    });

    return () => {
      unsubscribeBackend();
      unsubscribeSettings();
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const statusBadge = useMemo(() => {
    switch (backendState.status) {
      case 'ready':
        return 'online';
      case 'starting':
        return 'booting';
      case 'error':
        return 'error';
      default:
        return 'offline';
    }
  }, [backendState.status]);

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div>
          <h1>Kshana Studio</h1>
          <p>
            Local multi-agent backend with LM Studio + ComfyUI orchestration.
            Status:{' '}
            <span className={`status-pill ${statusBadge}`}>
              {backendState.status}
            </span>
          </p>
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            onClick={() => connectWebSocket().catch(() => undefined)}
          >
            {connectionState === 'connected' ? 'Reconnect' : 'Connect'}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
        </div>
      </header>

      <main>
        <MessageList messages={messages} isStreaming={isStreaming} />
      </main>

      <ChatInput
        disabled={connectionState === 'connecting'}
        onSend={sendMessage}
      />

      <SettingsPanel
        isOpen={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        isRestarting={isRestartingBackend}
      />
    </div>
  );
}
