/**
 * ChatPanelEmbedded — chat UI built directly on the typed
 * `window.kshana.*` IPC surface (via `useKshanaSession`).
 *
 * Display rules:
 *   - User messages: right-aligned bubble.
 *   - Assistant messages: rendered through react-markdown with GFM.
 *     Streamed via `stream_chunk` events into a single growing
 *     bubble (no flicker / no per-chunk new bubbles); finalised by
 *     `agent_response`.
 *   - Tool calls: compact one-liner with monospace name + status
 *     glyph. The same toolCallId is updated in place when its
 *     `tool_result` lands.
 *   - Inline media generated via `media_generated`.
 *   - Notifications: small system row.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useKshanaSession } from '../../../hooks/useKshanaSession';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type { KshanaEvent } from '../../../../shared/kshanaIpc';

type Role = 'user' | 'assistant' | 'tool' | 'system' | 'media';
type ToolStatus = 'in_progress' | 'completed' | 'error';

interface ChatMessage {
  id: string;
  role: Role;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: ToolStatus;
  toolArgsSummary?: string;
  mediaKind?: 'image' | 'video';
  mediaPath?: string;
  mediaProject?: string;
  /** Streaming bubbles aren't yet finalized; agent_response replaces text. */
  streaming?: boolean;
}

let nextMessageId = 1;
function newMessageId(): string {
  return `msg-${nextMessageId++}`;
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return '';
  // Pick the most useful 1-2 args, truncate long values.
  const parts = entries.slice(0, 2).map(([k, v]) => {
    let value = '';
    if (typeof v === 'string') value = v;
    else if (typeof v === 'number' || typeof v === 'boolean') value = String(v);
    else value = JSON.stringify(v);
    if (value.length > 32) value = `${value.slice(0, 32)}…`;
    return `${k}=${value}`;
  });
  return parts.join(' ');
}

export default function ChatPanelEmbedded() {
  const session = useKshanaSession();
  const { projectName, projectDirectory } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Tracks the id of the currently-streaming assistant message so
  // multiple `stream_chunk` events accumulate into one bubble instead
  // of creating a new bubble per chunk.
  const streamingMsgIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!session.sessionId) return;
    const unsubscribe = session.subscribe('*', (event: KshanaEvent) => {
      handleEvent(event, setMessages, streamingMsgIdRef);
    });
    return unsubscribe;
  }, [session.sessionId, session.subscribe]);

  useEffect(() => {
    if (!session.sessionId || !projectName) return;
    // Pass the absolute project directory so the embedded core
    // looks in the same parent the user opened from — even when
    // that's outside the kshana-ink package's default getProjectsDir().
    session.focusProject(projectName, projectDirectory ?? undefined).catch(() => {});
  }, [session.sessionId, projectName, projectDirectory, session.focusProject]);

  // Auto-scroll to the latest message. (jsdom in tests omits scrollIntoView.)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !session.sessionId) return;
    setMessages((prev) => [
      ...prev,
      { id: newMessageId(), role: 'user', text },
    ]);
    setInput('');
    streamingMsgIdRef.current = null;
    await session.runTask(text);
  };

  const handleCancel = async () => {
    await session.cancel();
  };

  const isRunning = session.status === 'running';
  const isReady = session.sessionId !== null && session.status !== 'connecting';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-base, #0d0e10)',
        color: 'var(--text-primary, #e3e3e3)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 14,
      }}
    >
      <header style={{ padding: '8px 12px', borderBottom: '1px solid #2a2c30', fontSize: 11, opacity: 0.6 }}>
        kshana embedded — session {session.sessionId ?? '(connecting…)'} · status: {session.status}
        {session.error ? ` · ${session.error}` : ''}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {messages.length === 0 ? (
          <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', marginTop: 32 }}>
            Type a task to begin.
          </div>
        ) : (
          messages.map((m) => <MessageRow key={m.id} message={m} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      <footer style={{ padding: 10, borderTop: '1px solid #2a2c30', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a task and press send…"
          rows={2}
          disabled={!isReady}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isRunning) handleSend();
            }
          }}
          style={{
            width: '100%',
            background: 'var(--bg-elev, #1a1c20)',
            color: 'inherit',
            border: '1px solid #2a2c30',
            borderRadius: 6,
            padding: 6,
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {isRunning && (
            <button type="button" onClick={handleCancel} style={chipBtnStyle('#a13a3a')}>
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={!isReady || isRunning || input.trim().length === 0}
            style={chipBtnStyle('#3a7aa1')}
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

function chipBtnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
  };
}

function statusGlyph(status: ToolStatus | undefined): string {
  switch (status) {
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    case 'in_progress':
    default:
      return '⋯';
  }
}

function statusColor(status: ToolStatus | undefined): string {
  switch (status) {
    case 'completed':
      return '#5cba6a';
    case 'error':
      return '#d05a5a';
    case 'in_progress':
    default:
      return '#a08a3a';
  }
}

function MessageRow({ message: m }: { message: ChatMessage }) {
  if (m.role === 'tool') {
    // Compact one-liner: glyph + monospaced tool name + faint args.
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '2px 4px',
          fontSize: 11,
          opacity: 0.85,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        }}
      >
        <span style={{ color: statusColor(m.toolStatus), width: 12 }}>{statusGlyph(m.toolStatus)}</span>
        <span style={{ color: '#9aa3b2' }}>{m.toolName}</span>
        {m.toolArgsSummary && (
          <span style={{ opacity: 0.55, fontSize: 10 }}>{m.toolArgsSummary}</span>
        )}
      </div>
    );
  }
  if (m.role === 'system') {
    return (
      <div style={{ padding: '2px 4px', fontSize: 11, opacity: 0.6, fontStyle: 'italic' }}>
        {m.text}
      </div>
    );
  }
  if (m.role === 'media') {
    return (
      <div style={messageBubbleStyle('rgba(80,160,80,0.10)', 'flex-start')}>
        <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
          generated {m.mediaKind} · {m.mediaProject ?? ''}
        </div>
        {m.mediaKind === 'image' && m.mediaPath ? (
          <img
            src={`file://${m.mediaPath}`}
            alt={`${m.mediaProject ?? ''} ${m.mediaPath}`}
            style={{ maxWidth: '100%', borderRadius: 4 }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div style={{ fontSize: 12 }}>📹 {m.mediaPath}</div>
        )}
      </div>
    );
  }
  // user / assistant
  return (
    <div
      style={{
        ...messageBubbleStyle(
          m.role === 'user' ? 'rgba(80,140,200,0.18)' : 'rgba(255,255,255,0.04)',
          m.role === 'user' ? 'flex-end' : 'flex-start',
        ),
        maxWidth: '85%',
      }}
    >
      {m.role === 'assistant' ? (
        <MarkdownContent text={m.text ?? ''} />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
      )}
    </div>
  );
}

function MarkdownContent({ text }: { text: string }) {
  // remark-gfm gives us tables, strikethrough, autolinks, task lists.
  const components = useMemo(
    () => ({
      // Tighten heading + paragraph spacing for chat density.
      h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1 style={{ fontSize: 18, margin: '6px 0' }} {...props} />
      ),
      h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2 style={{ fontSize: 16, margin: '6px 0' }} {...props} />
      ),
      h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3 style={{ fontSize: 15, margin: '4px 0' }} {...props} />
      ),
      p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p style={{ margin: '4px 0' }} {...props} />
      ),
      ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
        <ul style={{ margin: '4px 0', paddingLeft: 18 }} {...props} />
      ),
      ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
        <ol style={{ margin: '4px 0', paddingLeft: 18 }} {...props} />
      ),
      code: (props: React.HTMLAttributes<HTMLElement>) => (
        <code
          style={{
            background: 'rgba(255,255,255,0.06)',
            padding: '1px 4px',
            borderRadius: 3,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '0.92em',
          }}
          {...props}
        />
      ),
      pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
        <pre
          style={{
            background: 'rgba(255,255,255,0.06)',
            padding: 8,
            borderRadius: 4,
            overflowX: 'auto',
            margin: '6px 0',
            fontSize: 12,
          }}
          {...props}
        />
      ),
      a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props} target="_blank" rel="noreferrer" style={{ color: '#7eb6ff' }} />
      ),
    }),
    [],
  );
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function messageBubbleStyle(bg: string, align: 'flex-start' | 'flex-end'): React.CSSProperties {
  return {
    background: bg,
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: '6px 10px',
    color: 'inherit',
    alignSelf: align,
  };
}

function handleEvent(
  event: KshanaEvent,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  streamingMsgIdRef: React.RefObject<string | null>,
): void {
  switch (event.eventName) {
    case 'tool_call': {
      const data = event.data as {
        toolCallId?: string;
        toolName?: string;
        arguments?: unknown;
        status?: ToolStatus;
      };
      // Finalize any in-flight streaming bubble — once a tool call
      // fires the agent isn't actively typing user-facing text.
      streamingMsgIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'tool',
          toolCallId: data.toolCallId,
          toolName: data.toolName ?? '(unknown tool)',
          toolStatus: data.status ?? 'in_progress',
          toolArgsSummary: summarizeArgs(data.arguments),
        },
      ]);
      return;
    }
    case 'tool_result': {
      const data = event.data as {
        toolCallId?: string;
        isError?: boolean;
      };
      // Update the matching tool card in place (NOT a new card).
      setMessages((prev) =>
        prev.map((m) =>
          m.role === 'tool' && m.toolCallId === data.toolCallId
            ? { ...m, toolStatus: data.isError ? 'error' : 'completed' }
            : m,
        ),
      );
      return;
    }
    case 'stream_chunk': {
      const data = event.data as { content?: string; done?: boolean; toolCallId?: string };
      // tool_streaming events also use this channel — they include
      // toolCallId. Skip those for now (they belong to the tool card,
      // not the assistant bubble).
      if (data.toolCallId) return;
      const chunk = data.content ?? '';
      setMessages((prev) => {
        const id = streamingMsgIdRef.current;
        if (id) {
          return prev.map((m) =>
            m.id === id ? { ...m, text: (m.text ?? '') + chunk } : m,
          );
        }
        const newId = newMessageId();
        streamingMsgIdRef.current = newId;
        return [
          ...prev,
          { id: newId, role: 'assistant', text: chunk, streaming: true },
        ];
      });
      // Note: do NOT clear streamingMsgIdRef on done=true. The agent
      // emits a final `agent_response` carrying the canonical full
      // text; if we cleared the ref here, that response would create
      // a SECOND bubble with the same text (the duplicate the user
      // saw). Keep the ref alive so agent_response updates the same
      // bubble in place. The ref is cleared on tool_call (next turn)
      // and on user send (next conversation round).
      return;
    }
    case 'agent_response': {
      const data = event.data as { output?: string; status?: string };
      if (!data.output) return;
      // If we have a streaming bubble in flight, replace its text
      // with the canonical final string. Otherwise append a new
      // assistant bubble.
      const id = streamingMsgIdRef.current;
      if (id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: data.output, streaming: false } : m)),
        );
        streamingMsgIdRef.current = null;
      } else {
        setMessages((prev) => [
          ...prev,
          { id: newMessageId(), role: 'assistant', text: data.output },
        ]);
      }
      return;
    }
    case 'media_generated': {
      const data = event.data as { kind?: 'image' | 'video'; path?: string; project?: string };
      streamingMsgIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'media',
          mediaKind: data.kind ?? 'image',
          mediaPath: data.path,
          mediaProject: data.project,
        },
      ]);
      return;
    }
    case 'notification': {
      const data = event.data as { level?: string; message?: string };
      if (!data.message) return;
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'system',
          text: `[${data.level ?? 'info'}] ${data.message}`,
        },
      ]);
      return;
    }
    default:
      return;
  }
}
