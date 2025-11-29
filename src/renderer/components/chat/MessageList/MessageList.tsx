import { useMemo, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../../types/chat';
import MessageBubble from '../MessageBubble';
import TypingIndicator from '../TypingIndicator';
import styles from './MessageList.module.scss';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  onRegenerate?: (messageId: string) => void;
}

export default function MessageList({
  messages,
  isStreaming = false,
  onRegenerate,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const items = useMemo(() => messages, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items, shouldAutoScroll]);

  // Check if user has scrolled up
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldAutoScroll(isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div ref={containerRef} className={styles.container}>
      {items.length === 0 && (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>Start your storyboard</h3>
          <p className={styles.emptyDescription}>
            Describe your idea, mention characters, or paste a brief. I&apos;ll
            plan scenes, generate prompts, and coordinate with LM Studio +
            ComfyUI.
          </p>
        </div>
      )}
      <div className={styles.messages}>
        {items.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={
              isStreaming &&
              message.role === 'assistant' &&
              message.id === items[items.length - 1]?.id
            }
            onRegenerate={
              onRegenerate ? () => onRegenerate(message.id) : undefined
            }
          />
        ))}
        {isStreaming && (
          <div className={styles.typingWrapper}>
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
