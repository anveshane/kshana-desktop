import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
} from 'lucide-react';
import type { ChatMessage } from '../../../types/chat';
import MessageBubble from '../MessageBubble';
import styles from './IntermediateMessageGroup.module.scss';

interface IntermediateMessageGroupProps {
  messages: ChatMessage[];
  isActive?: boolean;
  isComplete?: boolean;
  hasError?: boolean;
}

export default function IntermediateMessageGroup({
  messages,
  isActive = false,
  isComplete = false,
  hasError = false,
}: IntermediateMessageGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (messages.length === 0) return null;

  const firstMessage = messages[0];
  const toolName =
    firstMessage.type === 'tool_call'
      ? (firstMessage.meta?.tool_name as string) || 'tool'
      : firstMessage.type;

  const getStatusIcon = () => {
    if (hasError) return <XCircle size={14} className={styles.errorIcon} />;
    if (isComplete)
      return <CheckCircle2 size={14} className={styles.successIcon} />;
    if (isActive) return <Loader2 size={14} className={styles.loadingIcon} />;
    return <Wrench size={14} className={styles.icon} />;
  };

  const getStatusText = () => {
    if (hasError) return 'Failed';
    if (isComplete) return 'Complete';
    if (isActive) return 'Running...';
    return 'Pending';
  };

  return (
    <div
      className={`${styles.container} ${isActive ? styles.active : ''} ${hasError ? styles.error : ''}`}
    >
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown size={16} className={styles.chevron} />
        ) : (
          <ChevronRight size={16} className={styles.chevron} />
        )}
        {getStatusIcon()}
        <span className={styles.toolName}>{toolName}</span>
        <span className={styles.status}>{getStatusText()}</span>
        <span className={styles.count}>
          {messages.length} step{messages.length !== 1 ? 's' : ''}
        </span>
      </button>
      {isExpanded && (
        <div className={styles.content}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}
