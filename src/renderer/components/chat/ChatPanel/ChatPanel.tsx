import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Trash2 } from 'lucide-react';
import type { BackendState } from '../../../../shared/backendTypes';
import type { ChatMessage } from '../../../types/chat';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import MessageList from '../MessageList';
import ChatInput from '../ChatInput';
import StatusBar, { AgentStatus } from '../StatusBar';
import styles from './ChatPanel.module.scss';

// Message types that shouldn't create new messages if same type already exists
const DEDUPE_TYPES = ['progress', 'comfyui_progress'];

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const DEFAULT_WS_PATH = '/api/v1/ws/chat';

const makeId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

  const { setConnectionStatus, projectDirectory } = useWorkspace();

  const wsRef = useRef<WebSocket | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const awaitingResponseRef = useRef(false);
  // Track active tool calls by toolCallId with start time
  const activeToolCallsRef = useRef<Map<string, { messageId: string; startTime: number }>>(
    new Map(),
  );
  // Track the last todo message ID for in-place updates
  const lastTodoMessageIdRef = useRef<string | null>(null);

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
    activeToolCallsRef.current.clear();
    lastTodoMessageIdRef.current = null;
    setAgentStatus('idle');
    setStatusMessage('Ready');
    // Backend will send greeting via WebSocket when connection is re-established
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const appendAssistantChunk = useCallback((content: string, type: string, author?: string) => {
    if (!content) return;
    setMessages((prev) => {
      // Stream chunks into existing message if available
      const streamingTypes = [
        'text_chunk',
        'agent_text',
        'coordinator_response',
        'stream_chunk', // Add stream_chunk to streaming types
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
          type: type === 'stream_chunk' ? 'agent_text' : type, // Normalize stream_chunk to agent_text for display
          content,
          timestamp: Date.now(),
          author, // Pass agent name
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

      // Extract optional agent name logic (if provided by backend)
      const currentAgentName = (data.agentName as string) ?? (payload.agentName as string) ?? agentName;
      if (currentAgentName !== agentName) {
        setAgentName(currentAgentName);
      }

      switch (messageType) {
        case 'status': {
          // kshana-ink status: { status: 'connected' | 'ready' | 'busy' | 'completed' | 'error', message?: string }
          const statusMsg = (data.message as string) ?? (data.status as string) ?? 'Status update';
          const status = data.status as string;

          if (status === 'connected') {
            setAgentStatus('idle');
            setStatusMessage('Connected');
            // Initial greeting logic with example prompts
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
                  content: 'Welcome to Kshana! Describe your story idea and I\'ll help you create a video.\n\n**Example prompts:**\n\n* "A story about a robot learning to dance"\n* "Create a video about a magical forest adventure"\n* "An epic tale of a knight and a dragon"',
                  timestamp: Date.now(),
                },
              ];
            });
          } else if (status === 'busy') {
            setAgentStatus('thinking');
            setStatusMessage(statusMsg);
          } else if (status === 'completed') {
            setAgentStatus('completed');
            setStatusMessage('Task completed');
          } else if (status === 'error') {
            setAgentStatus('error');
            setStatusMessage(statusMsg);
          } else {
            setStatusMessage(statusMsg);
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

          setStatusMessage(details || 'Processing...');
          break;
        }
        case 'stream_chunk': {
          // kshana-ink stream_chunk: { content, done }
          const content = (data.content as string) ?? '';
          const done = (data.done as boolean) ?? false;

          setAgentStatus('thinking'); // Agent is generating reasoning/thinking text

          if (content) {
            appendAssistantChunk(content, 'stream_chunk', agentName);
          }
          if (done) {
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            // Don't reset to idle here - let tool_call or other status updates handle it
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
          // kshana-ink tool_call: { toolName, toolCallId, arguments, status, result?, error? }
          const toolName = (data.toolName as string) ?? 'tool';
          const toolCallId = (data.toolCallId as string) ?? makeId();
          const toolStatus = (data.status as string) ?? 'started';
          const args = (data.arguments as Record<string, unknown>) ?? {};
          const result = data.result;
          const error = data.error;
          const streamingContent = data.streamingContent as string | undefined;

          if (toolStatus === 'started') {
            setAgentStatus('executing');
            setStatusMessage(`Running ${toolName}...`);
            const startTime = Date.now();
            const messageId = appendMessage({
              role: 'system', // Displayed as system/tool card
              type: 'tool_call',
              content: '', // Empty content, ToolCallCard will render
              author: agentName,
              meta: {
                toolCallId,
                toolName,
                args,
                status: 'executing',
                startTime,
              },
            });
            activeToolCallsRef.current.set(toolCallId, { messageId, startTime });
          } else if (toolStatus === 'completed' || toolStatus === 'error') {
            setAgentStatus('thinking'); // Back to thinking after tool
            const toolCall = activeToolCallsRef.current.get(toolCallId);
            if (toolCall) {
              const duration = Date.now() - toolCall.startTime;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === toolCall.messageId
                    ? {
                      ...msg,
                      meta: {
                        ...msg.meta,
                        toolCallId,
                        toolName,
                        args,
                        status: toolStatus === 'error' ? 'error' : 'completed',
                        result: result ?? error,
                        duration,
                      },
                    }
                    : msg,
                ),
              );
              activeToolCallsRef.current.delete(toolCallId);
            } else {
              // Fallback: create new message if tool call wasn't tracked
              appendMessage({
                role: 'system',
                type: 'tool_call',
                content: '',
                author: agentName,
                meta: {
                  toolCallId,
                  toolName,
                  args,
                  status: toolStatus === 'error' ? 'error' : 'completed',
                  result: result ?? error,
                },
              });
            }
          } else if (toolStatus === 'util' && streamingContent) { // Custom status for updates
            // Handle streaming updates for tool calls (if supported)
            const toolCall = activeToolCallsRef.current.get(toolCallId);
            if (toolCall) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === toolCall.messageId
                    ? {
                      ...msg,
                      meta: {
                        ...msg.meta,
                        streamingContent, // Update streaming content
                      }
                    }
                    : msg
                )
              );
            }
          }
          break;
        }
        case 'agent_response': {
          // kshana-ink agent_response: { output, status }
          const output = (data.output as string) ?? '';
          const responseStatus = data.status as string;
          if (output) {
            // Replace last stream_chunk message if it exists and matches
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (
                lastMessage &&
                lastMessage.role === 'assistant' &&
                (lastMessage.type === 'stream_chunk' || lastMessage.content === output)
              ) {
                return prev.map((msg, idx) =>
                  idx === prev.length - 1
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
          } else if (responseStatus === 'error') {
            setAgentStatus('error');
            setStatusMessage('Error');
            appendSystemMessage('An error occurred while processing your request.', 'error');
          }
          break;
        }
        case 'agent_question': {
          // kshana-ink agent_question: { question, options?, timeout?, defaultOption?, questionType? }
          // options can be string[] or Array<{ label: string; description?: string }>
          const question = (data.question as string) ?? '';
          const rawOptions = data.options as string[] | Array<{ label: string; description?: string }> | undefined;
          // Extract labels if options are objects, otherwise use as-is
          const options = rawOptions 
            ? rawOptions.map((opt) => (typeof opt === 'string' ? opt : opt.label))
            : undefined;
          const questionType = (data.questionType as string) ?? 'text'; // text, confirm, select
          const timeout = (data.timeout as number) ?? undefined;
          const defaultOption = (data.defaultOption as string) ?? undefined;

          if (question) {
            setAgentStatus('waiting');
            setStatusMessage('Waiting for your input');

            // Re-use logic to avoid duplicates if needed, or just append
            const id = makeId();
            lastAssistantIdRef.current = id;
            appendMessage({
              id,
              role: 'assistant',
              type: 'agent_question',
              content: question,
              author: agentName,
              meta: {
                options,
                questionType,
                timeout,
                defaultOption
              }
            });

            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            awaitingResponseRef.current = true;
          }
          break;
        }
        case 'todo_update': {
          // kshana-ink todo_update: { todos }
          const todos = data.todos as Array<any>;
          if (todos?.length) {
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
        case 'error': {
          const errorMsg = (data.message as string) ?? 'An error occurred';
          appendSystemMessage(errorMsg, 'error');
          setAgentStatus('error');
          setStatusMessage(errorMsg);
          break;
        }
        // ... (Keep other legacy cases if needed or just minimal support)
        default:
          console.log('Unhandled event:', messageType, payload);
        // appendSystemMessage(`Event: ${messageType}`, 'system');
      }
    },
    [appendAssistantChunk, appendMessage, appendSystemMessage, agentName],
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
          resolve(socket);
        };

        socket.onerror = () => {
          clearTimeout(timeout);
        };

        socket.onclose = (event) => {
          clearTimeout(timeout);
          setConnectionState('disconnected');
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
            console.error(error);
          }
        };
      });
    } catch (error) {
      setConnectionState('disconnected');
      throw error;
    }
  }, [handleServerPayload, setConnectionStatus, projectDirectory]);

  const sendResponse = useCallback(async (content: string) => {
    // Used for clicking options in QuestionPrompt
    try {
      const socket = await connectWebSocket();
      socket.send(JSON.stringify({
        type: 'user_response',
        data: { response: content },
      }));
      awaitingResponseRef.current = false;
      setAgentStatus('thinking');
      setStatusMessage('Thinking...');

      // Also append user message for visual feedback
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });
    } catch (error) {
      console.error('Failed to send response', error);
    }
  }, [appendMessage, connectWebSocket]);

  const sendMessage = useCallback(
    async (content: string) => {
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });

      setAgentStatus('thinking');
      setStatusMessage('Thinking...');

      try {
        const socket = await connectWebSocket();

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
        setAgentStatus('error');
      }
    },
    [appendMessage, connectWebSocket, appendSystemMessage],
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
        if (state.status === 'error' && state.message) {
          appendSystemMessage(`Backend error: ${state.message}`, 'error');
        } else if (state.status === 'ready' && !connectingRef.current && !wsRef.current) {
          connectingRef.current = true;
          connectWebSocket()
            .catch(() => undefined)
            .finally(() => { connectingRef.current = false; });
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
    clearChat();
    // Reconnect logic... (simplified from original for brevity, but same intent)
    const reconnect = async () => {
      if (wsRef.current) wsRef.current.close();
      try {
        const state = await window.electron.backend.getState();
        if (state.status === 'ready') await connectWebSocket();
      } catch { }
    };
    reconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDirectory]);

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

      {/* New Status Bar */}
      <StatusBar agentName={agentName} status={agentStatus} message={statusMessage} />

      <div className={styles.messages}>
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onDelete={deleteMessage}
          onResponse={sendResponse} // Pass down to MessageBubble
        />
      </div>

      <ChatInput
        disabled={connectionState === 'connecting'}
        onSend={sendMessage}
      />
    </div>
  );
}
