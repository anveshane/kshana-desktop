/**
 * ChatPanelEmbedded — minimal chat UI built directly on the typed
 * `window.kshana.*` IPC surface (via `useKshanaSession`).
 *
 * Replaces the WebSocket-backed legacy `ChatPanel.tsx` for the
 * embedded kshana-ink integration. Stays small and focused: a chat
 * input, a streaming message list, inline media thumbnails for
 * generated images/videos, a cancel button while a task is running.
 *
 * Future work (incremental, follow-up commits):
 *   - Reuse legacy MessageBubble + tool-call card components
 *   - Restore project setup panel, scene cards, todo prompts
 *   - Restore session resumption / chat persistence
 *
 * For now this is the new base. The legacy ChatPanel.tsx stays in tree
 * but is no longer imported (WorkspaceLayout switches to this file).
 */
import { useEffect, useRef, useState } from 'react';
import { useKshanaSession } from '../../../hooks/useKshanaSession';
import type { KshanaEvent } from '../../../../shared/kshanaIpc';

type Role = 'user' | 'assistant' | 'tool' | 'system' | 'media';

interface ChatMessage {
  id: string;
  role: Role;
  text?: string;
  toolName?: string;
  toolStatus?: string;
  mediaKind?: 'image' | 'video';
  mediaPath?: string;
  mediaProject?: string;
}

let nextMessageId = 1;
function newMessageId(): string {
  return `msg-${nextMessageId++}`;
}

export default function ChatPanelEmbedded() {
  const session = useKshanaSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Subscribe to streaming events once a session exists.
  useEffect(() => {
    if (!session.sessionId) return;
    const unsubscribe = session.subscribe('*', (event: KshanaEvent) => {
      handleEvent(event, setMessages);
    });
    return unsubscribe;
  }, [session.sessionId, session.subscribe]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !session.sessionId) return;

    setMessages((prev) => [
      ...prev,
      { id: newMessageId(), role: 'user', text },
    ]);
    setInput('');

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
      }}
    >
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #2a2c30', fontSize: 12, opacity: 0.7 }}>
        kshana embedded — session {session.sessionId ?? '(connecting…)'} · status: {session.status}
        {session.error ? ` · ${session.error}` : ''}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', marginTop: 32 }}>
            Type a task to begin. Examples: <em>"create a 30s noir story"</em>,
            <em>"open the parvati project"</em>.
          </div>
        ) : (
          messages.map((m) => <MessageRow key={m.id} message={m} />)
        )}
      </div>

      <footer style={{ padding: 12, borderTop: '1px solid #2a2c30', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            padding: 8,
            fontSize: 14,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {isRunning && (
            <button
              type="button"
              onClick={handleCancel}
              style={chipBtnStyle('#a13a3a')}
            >
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
    padding: '6px 14px',
    fontSize: 13,
    cursor: 'pointer',
  };
}

function MessageRow({ message: m }: { message: ChatMessage }) {
  if (m.role === 'media') {
    return (
      <div style={messageBubbleStyle('rgba(80,160,80,0.12)')}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
          generated {m.mediaKind} · {m.mediaProject ?? ''}
        </div>
        {m.mediaKind === 'image' ? (
          <img
            src={`file://${m.mediaPath}`}
            alt={`${m.mediaProject ?? ''} ${m.mediaPath ?? ''}`}
            style={{ maxWidth: '100%', borderRadius: 4 }}
            onError={(e) => {
              // Fallback to plain text if file:// can't resolve in dev
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div style={{ fontSize: 12 }}>📹 {m.mediaPath}</div>
        )}
      </div>
    );
  }
  if (m.role === 'tool') {
    return (
      <div style={messageBubbleStyle('rgba(80,120,200,0.12)')}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
          tool · {m.toolStatus ?? 'in_progress'}
        </div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
          {m.toolName}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        ...messageBubbleStyle(m.role === 'user' ? 'rgba(80,140,200,0.18)' : 'rgba(255,255,255,0.05)'),
        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{m.role}</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.text}</div>
    </div>
  );
}

function messageBubbleStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'inherit',
  };
}

/**
 * Translate a streaming KshanaEvent into a new ChatMessage (or
 * mutation of an existing one). Pure-ish — exported for tests later.
 */
function handleEvent(
  event: KshanaEvent,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): void {
  switch (event.eventName) {
    case 'tool_call': {
      const data = event.data as { toolCallId?: string; toolName?: string; status?: string };
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: 'tool',
          toolName: data.toolName ?? '(unknown tool)',
          toolStatus: data.status ?? 'in_progress',
        },
      ]);
      return;
    }
    case 'agent_response': {
      const data = event.data as { output?: string; status?: string };
      if (data.output) {
        setMessages((prev) => [
          ...prev,
          { id: newMessageId(), role: 'assistant', text: data.output },
        ]);
      }
      return;
    }
    case 'media_generated': {
      const data = event.data as { kind?: 'image' | 'video'; path?: string; project?: string };
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
      if (data.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: 'system',
            text: `[${data.level ?? 'info'}] ${data.message}`,
          },
        ]);
      }
      return;
    }
    default:
      // Other event types (progress, stream_chunk, todo_updated, …) are
      // intentionally not surfaced in this minimal panel. Follow-ups can
      // add UI for each as needed.
      return;
  }
}
