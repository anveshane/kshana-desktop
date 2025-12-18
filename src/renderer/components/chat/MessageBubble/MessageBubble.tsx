import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../../../types/chat';
import CodeBlock from '../CodeBlock';
import MessageActions from '../MessageActions';
import ToolCallCard from '../ToolCallCard';
import TodoDisplay from '../TodoDisplay';
import type { TodoItem } from '../TodoDisplay';
import ErrorMessage from '../ErrorMessage/ErrorMessage';
import styles from './MessageBubble.module.scss';

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onDelete?: () => void;
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

function parseErrorMessage(content: string) {
  const parts = content.split('\n');
  const title = content.includes('kshana-ink') ? 'Backend Connection Error' : 'System Error';
  const firstLine = parts[0] || 'An unexpected error occurred';

  // Try to extract the main message
  const mainMessageMatch = firstLine.match(/^(?:Unable to send message: )?(?:Backend not ready: )?(.+)$/);
  const message = mainMessageMatch ? mainMessageMatch[1] : firstLine;

  const details: string[] = [];
  const troubleshooting: string[] = [];

  let currentSection: 'none' | 'details' | 'troubleshooting' = 'none';

  for (let i = 1; i < parts.length; i++) {
    const line = parts[i].trim();
    if (!line) continue;

    if (line.includes('Checked:') || line.includes('Contents of') || line.includes('Neither unpacked')) {
      currentSection = 'details';
      details.push(line);
      continue;
    }

    if (line.includes('Please ensure') || line.includes('Troubleshooting:') || line.includes('Run \'pnpm build\'')) {
      currentSection = 'troubleshooting';
      troubleshooting.push(line);
      continue;
    }

    if (currentSection === 'details') {
      details.push(line);
    } else if (currentSection === 'troubleshooting') {
      troubleshooting.push(line);
    } else {
      // If it looks like a path or diagnostic info, put it in details
      if (line.startsWith('-') || line.includes('/') || line.includes('\\')) {
        details.push(line);
      } else {
        troubleshooting.push(line);
      }
    }
  }

  return { title, message, details, troubleshooting };
}

export default function MessageBubble({
  message,
  isStreaming = false,
  onRegenerate,
  onDelete,
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
  const isToolCall = message.type === 'tool_call';
  const isTodoUpdate = message.type === 'todo_update';

  // Render tool call card
  if (isToolCall && message.meta) {
    const toolName = (message.meta.toolName as string) || 'tool';
    // Hide certain tools that are rendered elsewhere (like todo_write)
    const HIDDEN_TOOLS = new Set(['todo_write']);
    if (HIDDEN_TOOLS.has(toolName)) {
      return null; // Don't render hidden tools
    }
    const status = (message.meta.status as string) || 'executing';
    const args = (message.meta.args as Record<string, unknown>) || {};
    const result = message.meta.result;
    const duration = message.meta.duration as number | undefined;

    return (
      <div className={`${styles.container} ${styles.system}`}>
        <ToolCallCard
          toolName={toolName}
          args={args}
          status={status as 'executing' | 'completed' | 'error' | 'needs_confirmation'}
          result={result}
          duration={duration}
          toolCallId={message.meta.toolCallId as string | undefined}
        />
      </div>
    );
  }

  // Render todo display
  if (isTodoUpdate && message.meta?.todos) {
    const todos = message.meta.todos as TodoItem[];
    return (
      <div className={`${styles.container} ${styles.system}`}>
        <TodoDisplay todos={todos} />
      </div>
    );
  }

  // Handle dispatch_agent (plan) messages with markdown
  const isDispatchAgent = message.meta?.toolName === 'dispatch_agent';
  const parsedError = isError ? parseErrorMessage(message.content) : null;

  return (
    <div
      className={`${styles.container} ${styles[message.role]} ${isStreaming ? styles.streaming : ''
        } ${isIntermediate ? styles.intermediate : ''} ${isError ? styles.error : ''
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
              message={message}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
              showRegenerate={message.role === 'assistant' && !isIntermediate}
            />
          </div>
        )}
      </div>
      <div className={styles.body}>
        {isError && parsedError ? (
          <div className={styles.errorContainer}>
            <ErrorMessage
              title={parsedError.title}
              message={parsedError.message}
              details={parsedError.details}
              troubleshooting={parsedError.troubleshooting}
            />
          </div>
        ) : isSystem ? (
          <div className={styles.systemContent}>{message.content}</div>
        ) : isDispatchAgent && message.meta?.result ? (
          // Render plan from dispatch_agent result
          <ReactMarkdown
            remarkPlugins={remarkGfm ? [remarkGfm] : []}
            components={MarkdownComponents}
          >
            {(message.meta.result as Record<string, unknown>)?.plan as string || message.content}
          </ReactMarkdown>
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
