import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import styles from './ToolCallCard.module.scss';

export type ToolCallStatus =
  | 'executing'
  | 'completed'
  | 'error'
  | 'needs_confirmation';

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
const SPECIAL_RENDER_TOOLS = new Set([
  'think',
  'write_project_state',
  'read_project_state',
  'dispatch_agent',
]);

// User-friendly display names
const TOOL_DISPLAY_NAMES: Record<string, { gerund: string; past: string }> = {
  think: { gerund: 'Thinking', past: 'Thought' },
  ask_user: { gerund: 'Asking user', past: 'Asked user' },
  dispatch_agent: { gerund: 'Dispatching agent', past: 'Dispatched agent' },
  generate_image: { gerund: 'Generating image', past: 'Generated image' },
  generate_video: { gerund: 'Generating video', past: 'Generated video' },
  edit_image: { gerund: 'Editing image', past: 'Edited image' },
  wait_for_job: { gerund: 'Waiting for job', past: 'Job completed' },
  read_project_state: {
    gerund: 'Reading project state',
    past: 'Read project state',
  },
  write_project_state: {
    gerund: 'Saving project state',
    past: 'Saved project state',
  },
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
  return `${str.slice(0, maxLength)}...`;
}

function formatToolCall(name: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) {
    return `${name}()`;
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const maxLen = CONTENT_ARGS.has(key)
        ? MAX_ARG_LENGTH
        : MAX_ARG_LENGTH * 2;
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
  const nameField = obj.name || obj.title;
  const roleField = obj.role;

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

function formatProjectStateData(
  data: Record<string, unknown>,
  indent = 0,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(data)) {
    const capitalizedKey = capitalize(key);

    if (Array.isArray(value)) {
      nodes.push(
        <div key={key} className={styles.projectStateKey}>
          {prefix}
          <span className={styles.projectStateLabel}>{capitalizedKey}:</span>
        </div>,
      );
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          const formattedText = formatObjectAsText(obj);
          nodes.push(
            <div key={`${key}-${i}`} className={styles.projectStateValue}>
              {prefix} - {formattedText}
            </div>,
          );
        } else {
          nodes.push(
            <div key={`${key}-${i}`} className={styles.projectStateValue}>
              {prefix} - {String(item)}
            </div>,
          );
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      nodes.push(
        <div key={key} className={styles.projectStateKey}>
          {prefix}
          <span className={styles.projectStateLabel}>{capitalizedKey}:</span>
        </div>,
      );
      nodes.push(
        ...formatProjectStateData(value as Record<string, unknown>, indent + 1),
      );
    } else {
      nodes.push(
        <div key={key} className={styles.projectStateItem}>
          {prefix}
          <span className={styles.projectStateLabel}>{capitalizedKey}: </span>
          <span className={styles.projectStateValue}>{String(value)}</span>
        </div>,
      );
    }
  }

  return nodes;
}

function renderThinkTool(
  args: Record<string, unknown> | undefined,
  status: ToolCallStatus | undefined,
): React.ReactNode {
  const thought = args?.thought as string | undefined;
  const isExecuting = status === 'executing';

  return (
    <div className={styles.thinkTool}>
      <div className={styles.thinkHeader}>
        <span className={styles.thinkIcon}>💭</span>
        {isExecuting ? (
          <span className={styles.thinkText}>Thinking...</span>
        ) : (
          <span className={styles.thinkText}>{thought || 'Thinking...'}</span>
        )}
      </div>
      {thought && !isExecuting && (
        <div className={styles.thinkContent}>
          <ReactMarkdown>{thought}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function renderDispatchAgentTool(
  args: Record<string, unknown> | undefined,
  status: ToolCallStatus | undefined,
  result?: unknown,
): React.ReactNode {
  const task = args?.task as string | undefined;
  const context = args?.context as string | undefined;
  const isExecuting = status === 'executing';

  const resultObj = result as Record<string, unknown> | undefined;
  const plan = resultObj?.plan as string | undefined;

  return (
    <div className={styles.dispatchAgentTool}>
      <div className={styles.dispatchHeader}>
        {isExecuting ? (
          <>
            <span className={styles.dispatchIcon}>📝</span>
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
  const dataType = args?.data_type as string | undefined;
  const rawData = args?.data;
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
            <span className={styles.projectStateIcon}>
              {isRead ? '📖' : '📋'}
            </span>
            <span className={styles.projectStateText}>
              {isRead ? 'Reading' : 'Saving'} project state...
            </span>
          </>
        ) : (
          <>
            <span className={styles.projectStateIcon}>
              {isRead ? '📖' : '📋'}
            </span>
            <span className={styles.projectStateText}>
              {isRead ? 'Project State: ' : 'Project State Update: '}
            </span>
            <span className={styles.projectStateDataType}>
              {capitalizedDataType}
            </span>
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
  // CLI-style: Only show completed/error tools (not executing/started)
  // This matches the behavior we set in ChatPanel where we only show completed tools
  if (status === 'executing' || status === 'started') {
    return null; // Don't show executing/started state - matches CLI behavior
  }

  // CLI-style format: [TOOL] toolName
  const prefix = agentName ? `[${agentName}]` : '[TOOL]';

  // Format result for display - extract key information like file paths
  let resultDisplay = '';
  let filePath: string | undefined;
  let fileSize: string | undefined;
  let preview: string | undefined;

  if (result !== undefined) {
    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>;

      // Extract file information (common in Task tool results)
      if ('file_path' in resultObj || 'filePath' in resultObj) {
        filePath = (resultObj.file_path || resultObj.filePath) as string;
      }
      if ('file_saved' in resultObj && filePath) {
        // File was saved
      }
      if ('size' in resultObj) {
        const size = resultObj.size as number;
        fileSize =
          size < 1024 ? `${size} bytes` : `${(size / 1024).toFixed(1)} KB`;
      }
      if ('preview' in resultObj) {
        preview = String(resultObj.preview);
      }

      // Check if result has content field (like dispatch_content_agent results)
      if ('content' in resultObj && typeof resultObj.content === 'string') {
        resultDisplay = String(resultObj.content);
      } else if (
        'output' in resultObj &&
        typeof resultObj.output === 'string'
      ) {
        resultDisplay = String(resultObj.output);
      } else if (filePath && !resultDisplay) {
        // If we have a file path but no content, show the file path
        resultDisplay = `File: ${filePath}`;
      } else {
        // For other objects, show a summary
        const keys = Object.keys(resultObj);
        if (keys.length <= 3) {
          resultDisplay = JSON.stringify(result, null, 2);
        } else {
          resultDisplay = `{${keys.slice(0, 3).join(', ')}...}`;
        }
      }
    } else {
      resultDisplay = String(result);
    }
  }

  // Truncate long results for cleaner display
  const MAX_RESULT_LENGTH = 500;
  if (resultDisplay.length > MAX_RESULT_LENGTH) {
    resultDisplay = `${resultDisplay.substring(0, MAX_RESULT_LENGTH)}...`;
  }

  return (
    <div className={styles.container}>
      <div className={styles.cliStyle}>
        <span className={styles.cliPrefix}>{prefix}</span>
        <span className={styles.cliToolName}>{toolName}</span>
        {status === 'error' && (
          <span className={styles.cliError}> (error)</span>
        )}
        {duration !== undefined && (
          <span className={styles.cliDuration}>
            {' '}
            ({formatDuration(duration)})
          </span>
        )}
      </div>
      {(filePath || fileSize || resultDisplay) && (
        <div className={styles.cliResult}>
          {filePath && (
            <div className={styles.cliFilePath}>
              📄 {filePath}
              {fileSize && (
                <span className={styles.cliFileSize}> ({fileSize})</span>
              )}
            </div>
          )}
          {preview && (
            <div className={styles.cliPreview}>
              <details>
                <summary>Preview</summary>
                <pre className={styles.cliResultPre}>{preview}</pre>
              </details>
            </div>
          )}
          {resultDisplay && (
            <div className={styles.cliResultContent}>
              {typeof result === 'object' &&
              result !== null &&
              'content' in result ? (
                <ReactMarkdown>{resultDisplay}</ReactMarkdown>
              ) : (
                <pre className={styles.cliResultPre}>{resultDisplay}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
