import { useMemo } from 'react';
import type { ChatMessage } from '../types/chat';

type Props = {
  messages: ChatMessage[];
};

const formatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

const roleLabels: Record<ChatMessage['role'], string> = {
  user: 'You',
  assistant: 'Kshana',
  system: 'System',
};

export default function MessageList({ messages }: Props) {
  const items = useMemo(() => messages, [messages]);

  return (
    <div className="chat-messages">
      {items.length === 0 && (
        <div className="chat-empty-state">
          <h3>Start your storyboard</h3>
          <p>
            Describe your idea, mention characters, or paste a brief. I&apos;ll plan
            scenes, generate prompts, and coordinate with LM Studio + ComfyUI.
          </p>
        </div>
      )}
      {items.map((message) => (
        <div key={message.id} className={`chat-message ${message.role}`}>
          <div className="chat-message-header">
            <span className="chat-role">{roleLabels[message.role]}</span>
            <span className="chat-type">{message.type}</span>
            <span className="chat-time">
              {formatter.format(new Date(message.timestamp))}
            </span>
          </div>
          <div className="chat-message-body">{message.content}</div>
        </div>
      ))}
    </div>
  );
}

