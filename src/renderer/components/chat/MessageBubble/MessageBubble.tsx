import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../../../types/chat';
import CodeBlock from '../CodeBlock';
import MessageActions from '../MessageActions';
import styles from './MessageBubble.module.scss';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

const roleLabels: Record<ChatMessage['role'], string> = {
  user: 'You',
  assistant: 'Kshana',
  system: 'System',
};

const formatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

const MarkdownComponents = {
  code({ inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    return !inline && match ? (
      <CodeBlock code={codeString} language={language} />
    ) : (
      <code className={styles.inlineCode} {...props}>
        {children}
      </code>
    );
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        className={styles.link}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  h1: ({ children }: any) => <h1 className={styles.heading1}>{children}</h1>,
  h2: ({ children }: any) => <h2 className={styles.heading2}>{children}</h2>,
  h3: ({ children }: any) => <h3 className={styles.heading3}>{children}</h3>,
  ul: ({ children }: any) => <ul className={styles.list}>{children}</ul>,
  ol: ({ children }: any) => <ol className={styles.list}>{children}</ol>,
  blockquote: ({ children }: any) => (
    <blockquote className={styles.blockquote}>{children}</blockquote>
  ),
};

export default function MessageBubble({
  message,
  isStreaming = false,
  onRegenerate,
}: MessageBubbleProps) {
  const [remarkGfm, setRemarkGfm] = useState<any>(null);

  useEffect(() => {
    import('remark-gfm')
      .then((mod) => {
        setRemarkGfm(() => mod.default);
        return null;
      })
      .catch((err) => {
        console.error('Failed to load remark-gfm', err);
      });
  }, []);

  const isIntermediate = ['tool_call', 'progress', 'status'].includes(
    message.type,
  );
  const isError = message.type === 'error';
  const isSystem = message.role === 'system';

  return (
    <div
      className={`${styles.container} ${styles[message.role]} ${
        isStreaming ? styles.streaming : ''
      } ${isIntermediate ? styles.intermediate : ''} ${
        isError ? styles.error : ''
      }`}
    >
      <div className={styles.header}>
        <span className={styles.role}>{roleLabels[message.role]}</span>
        {message.type && message.type !== 'message' && (
          <span className={styles.type}>{message.type}</span>
        )}
        <span className={styles.time}>
          {formatter.format(new Date(message.timestamp))}
        </span>
        {!isSystem && (
          <div className={styles.actions}>
            <MessageActions
              content={message.content}
              onRegenerate={onRegenerate}
              showRegenerate={message.role === 'assistant' && !isIntermediate}
            />
          </div>
        )}
      </div>
      <div className={styles.body}>
        {isSystem ? (
          <div className={styles.systemContent}>{message.content}</div>
        ) : (
          <ReactMarkdown
            remarkPlugins={remarkGfm ? [remarkGfm] : []}
            components={MarkdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
