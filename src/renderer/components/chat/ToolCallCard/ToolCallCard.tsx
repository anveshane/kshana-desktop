import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import styles from './ToolCallCard.module.scss';

export type ToolCallStatus = 'executing' | 'completed' | 'error' | 'needs_confirmation';

export interface ToolCallCardProps {
  toolName: string;
  args?: Record<string, unknown>;
  status?: ToolCallStatus;
  result?: unknown;
  duration?: number;
  toolCallId?: string;
  agentName?: string;
  streamingContent?: string;
}

// Tools with special rendering
const SPECIAL_RENDER_TOOLS = new Set(['think', 'write_project_state', 'read_project_state', 'dispatch_agent']);

// User-friendly display names
const TOOL_DISPLAY_NAMES: Record<string, { gerund: string; past: string }> = {
  think: { gerund: 'Thinking', past: 'Thought' },
  ask_user: { gerund: 'Asking user', past: 'Asked user' },
  dispatch_agent: { gerund: 'Dispatching agent', past: 'Dispatched agent' },
  generate_image: { gerund: 'Generating image', past: 'Generated image' },
  generate_video: { gerund: 'Generating video', past: 'Generated video' },
  edit_image: { gerund: 'Editing image', past: 'Edited image' },
  wait_for_job: { gerund: 'Waiting for job', past: 'Job completed' },
  read_project_state: { gerund: 'Reading project state', past: 'Read project state' },
  write_project_state: { gerund: 'Saving project state', past: 'Saved project state' },
};

function getDisplayName(toolName: string, isExecuting: boolean): string {
  const names = TOOL_DISPLAY_NAMES[toolName];
  if (!names) {
    return isExecuting ? `Running ${toolName}` : `Ran ${toolName}`;
  }
  return isExecuting ? names.gerund : names.past;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

const MAX_ARG_LENGTH = 80;
const CONTENT_ARGS = new Set(['content', 'data', 'text', 'body', 'message']);

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

function formatToolCall(name: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) {
    return `${name}()`;
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const maxLen = CONTENT_ARGS.has(key) ? MAX_ARG_LENGTH : MAX_ARG_LENGTH * 2;
      const displayValue = truncateString(value.replace(/\n/g, '\\n'), maxLen);
      parts.push(`${key}="${displayValue}"`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=${String(value)}`);
    } else if (Array.isArray(value)) {
      const jsonStr = JSON.stringify(value);
      parts.push(`${key}=${truncateString(jsonStr, MAX_ARG_LENGTH)}`);
    } else if (value !== null && typeof value === 'object') {
      const jsonStr = JSON.stringify(value);
      parts.push(`${key}=${truncateString(jsonStr, MAX_ARG_LENGTH)}`);
    }
  }

  return `${name}(${parts.join(', ')})`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatObjectAsText(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  const nameField = obj['name'] || obj['title'];
  const roleField = obj['role'];

  if (nameField) {
    let line = String(nameField);
    if (roleField) {
      line += ` (${roleField})`;
    }
    parts.push(line);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (['name', 'title', 'role'].includes(key)) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(`${capitalize(key)}: ${value}`);
    }
  }

  return parts.join(' | ');
}

function formatProjectStateData(data: Record<string, unknown>, indent = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(data)) {
    const capitalizedKey = capitalize(key);

    if (Array.isArray(value)) {
      nodes.push(
        <div key={key} className={styles.projectStateKey}>
          {prefix}
          <span className={styles.projectStateLabel}>{capitalizedKey}:</span>
        </div>
      );
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          const formattedText = formatObjectAsText(obj);
          nodes.push(
            <div key={`${key}-${i}`} className={styles.projectStateValue}>
              {prefix}  - {formattedText}
            </div>
          );
        } else {
          nodes.push(
            <div key={`${key}-${i}`} className={styles.projectStateValue}>
              {prefix}  - {String(item)}
            </div>
          );
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      nodes.push(
        <div key={key} className={styles.projectStateKey}>
          {prefix}
          <span className={styles.projectStateLabel}>{capitalizedKey}:</span>
        </div>
      );
      nodes.push(...formatProjectStateData(value as Record<string, unknown>, indent + 1));
    } else {
      nodes.push(
        <div key={key} className={styles.projectStateItem}>
          {prefix}
          <span className={styles.projectStateLabel}>{capitalizedKey}: </span>
          <span className={styles.projectStateValue}>{String(value)}</span>
        </div>
      );
    }
  }

  return nodes;
}

function renderThinkTool(
  args: Record<string, unknown> | undefined,
  status: ToolCallStatus | undefined,
): React.ReactNode {
  const thought = args?.['thought'] as string | undefined;
  const isExecuting = status === 'executing';

  return (
    <div className={styles.thinkTool}>
      <div className={styles.thinkHeader}>
        <span className={styles.thinkIcon}>💭</span>
        {isExecuting ? (
          <Loader2 size={14} className={styles.spinner} />
        ) : (
          <span className={styles.thinkText}>{thought || 'Thinking...'}</span>
        )}
      </div>
    </div>
  );
}

function renderDispatchAgentTool(
  args: Record<string, unknown> | undefined,
  status: ToolCallStatus | undefined,
  result?: unknown,
): React.ReactNode {
  const task = args?.['task'] as string | undefined;
  const context = args?.['context'] as string | undefined;
  const isExecuting = status === 'executing';

  const resultObj = result as Record<string, unknown> | undefined;
  const plan = resultObj?.['plan'] as string | undefined;

  return (
    <div className={styles.dispatchAgentTool}>
      <div className={styles.dispatchHeader}>
        {isExecuting ? (
          <>
            <span className={styles.dispatchIcon}>📝</span>
            <Loader2 size={14} className={styles.spinner} />
            <span className={styles.dispatchText}> Planning...</span>
          </>
        ) : (
          <span className={styles.dispatchText}>📝 Plan Complete</span>
        )}
      </div>
      <div className={styles.dispatchContent}>
        {task && (
          <div className={styles.dispatchSection}>
            <div className={styles.dispatchLabel}>Task:</div>
            <div className={styles.dispatchValue}>{task}</div>
          </div>
        )}
        {context && (
          <div className={styles.dispatchSection}>
            <div className={styles.dispatchLabel}>Context:</div>
            <div className={styles.dispatchValue}>{context}</div>
          </div>
        )}
        {plan && !isExecuting && (
          <div className={styles.dispatchSection}>
            <div className={styles.dispatchLabel}>Plan:</div>
            <div className={styles.dispatchPlan}>
              <ReactMarkdown>{plan}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderProjectStateTool(
  toolName: string,
  args: Record<string, unknown> | undefined,
  status: ToolCallStatus | undefined,
): React.ReactNode {
  const dataType = args?.['data_type'] as string | undefined;
  const rawData = args?.['data'];
  const isExecuting = status === 'executing';
  const isRead = toolName === 'read_project_state';

  let data: Record<string, unknown> | undefined;
  if (typeof rawData === 'string') {
    try {
      data = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      data = { value: rawData };
    }
  } else if (typeof rawData === 'object' && rawData !== null) {
    data = rawData as Record<string, unknown>;
  }

  const capitalizedDataType = capitalize(dataType || 'unknown');

  return (
    <div className={styles.projectStateTool}>
      <div className={styles.projectStateHeader}>
        {isExecuting ? (
          <>
            <span className={styles.projectStateIcon}>{isRead ? '📖' : '📋'}</span>
            <Loader2 size={14} className={styles.spinner} />
            <span className={styles.projectStateText}>
              {isRead ? 'Reading' : 'Saving'} project state...
            </span>
          </>
        ) : (
          <>
            <span className={styles.projectStateIcon}>{isRead ? '📖' : '📋'}</span>
            <span className={styles.projectStateText}>
              {isRead ? 'Project State: ' : 'Project State Update: '}
            </span>
            <span className={styles.projectStateDataType}>{capitalizedDataType}</span>
          </>
        )}
      </div>
      {!isExecuting && data && (
        <div className={styles.projectStateData}>
          {formatProjectStateData(data)}
        </div>
      )}
    </div>
  );
}

export default function ToolCallCard({
  toolName,
  args,
  status = 'executing',
  result,
  duration,
  agentName,
  streamingContent,
}: ToolCallCardProps) {
  // Always expand if executing, error, needs_confirmation, or has result/streaming content
  const [isExpanded, setIsExpanded] = useState(
    status === 'executing' || 
    status === 'error' || 
    status === 'needs_confirmation' || 
    result !== undefined || 
    streamingContent !== undefined
  );

  useEffect(() => {
    if (status === 'executing' || status === 'needs_confirmation' || result !== undefined || streamingContent !== undefined) {
      setIsExpanded(true);
    }
  }, [status, result, streamingContent]);

  // Special rendering for think tool
  if (toolName === 'think') {
    return <>{renderThinkTool(args, status)}</>;
  }

  // Special rendering for dispatch_agent (planning) tool
  if (toolName === 'dispatch_agent') {
    return <>{renderDispatchAgentTool(args, status, result)}</>;
  }

  // Special rendering for project state tools
  if (toolName === 'write_project_state' || toolName === 'read_project_state') {
    return <>{renderProjectStateTool(toolName, args, status)}</>;
  }

  // Standard tool display
  const isExecuting = status === 'executing';
  const displayName = getDisplayName(toolName, isExecuting);
  const toolCallStr = formatToolCall(toolName, args);

  const getStatusIcon = () => {
    switch (status) {
      case 'executing':
        return <Loader2 size={14} className={styles.statusIconExecuting} />;
      case 'completed':
        return <CheckCircle2 size={14} className={styles.statusIconCompleted} />;
      case 'error':
        return <XCircle size={14} className={styles.statusIconError} />;
      case 'needs_confirmation':
        return <AlertCircle size={14} className={styles.statusIconNeedsConfirmation} />;
      default:
        return <div className={styles.statusIconDefault}>○</div>;
    }
  };

  const getBorderColor = () => {
    switch (status) {
      case 'executing':
        return styles.borderExecuting;
      case 'completed':
        return styles.borderCompleted;
      case 'error':
        return styles.borderError;
      case 'needs_confirmation':
        return styles.borderNeedsConfirmation;
      default:
        return styles.borderDefault;
    }
  };

  return (
    <div className={`${styles.container} ${getBorderColor()}`}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.expandButton}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDown size={14} className={styles.chevron} />
          ) : (
            <ChevronRight size={14} className={styles.chevron} />
          )}
        </button>
        {getStatusIcon()}
        <span className={styles.toolName}>
          {agentName && <span className={styles.agentName}>[{agentName}] </span>}
          {displayName}
        </span>
        {duration !== undefined && status !== 'executing' && (
          <span className={styles.duration}>({formatDuration(duration)})</span>
        )}
      </div>
      <div className={styles.toolCallSummary}>
        <code className={styles.toolCallCode}>{toolCallStr}</code>
      </div>
      {(isExpanded || streamingContent) && (
        <div className={styles.content}>
          {streamingContent && (
            <div className={styles.streamingContent}>
              <div className={styles.streamingLabel}>Output:</div>
              <pre className={styles.streamingPre}>{streamingContent}</pre>
            </div>
          )}
          {status === 'error' && result !== undefined && (
            <div className={styles.errorResult}>
              <span className={styles.errorLabel}>Error:</span>
              <span className={styles.errorMessage}>
                {typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}
              </span>
            </div>
          )}
          {status === 'completed' && result !== undefined && (
            <div className={styles.result}>
              <span className={styles.resultLabel}>Result:</span>
              {typeof result === 'object' && result !== null ? (
                // Check if result has content field (like dispatch_content_agent results)
                'content' in result && typeof (result as Record<string, unknown>).content === 'string' ? (
                  <div className={styles.resultContentMarkdown}>
                    <ReactMarkdown>{String((result as Record<string, unknown>).content)}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className={styles.resultContent}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )
              ) : (
                <pre className={styles.resultContent}>{String(result)}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

