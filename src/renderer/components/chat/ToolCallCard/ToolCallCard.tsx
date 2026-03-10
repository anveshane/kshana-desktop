import { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ChevronRight } from 'lucide-react';
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
  onFileClick?: (filePath: string) => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatToolCall(name: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) {
    return `${name}()`;
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      parts.push(`${key}=${JSON.stringify(value)}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=${String(value)}`);
    } else if (Array.isArray(value)) {
      parts.push(`${key}=${JSON.stringify(value, null, 2)}`);
    } else if (value !== null && typeof value === 'object') {
      parts.push(`${key}=${JSON.stringify(value, null, 2)}`);
    }
  }

  return `${name}(${parts.join(', ')})`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function isRoutineTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return (
    normalized.includes('read') ||
    normalized.includes('list') ||
    normalized.includes('scan') ||
    normalized === 'search_files' ||
    normalized.includes('todo')
  );
}

export function isGenerationTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return (
    normalized.includes('generate_image') ||
    normalized.includes('generate_video')
  );
}

export function prefersInlineTextPreview(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return (
    normalized === 'import_file' ||
    normalized === 'generate_content' ||
    normalized.includes('write') ||
    normalized.includes('create')
  );
}

type CompactToolSummary = {
  projectName?: string;
  phase?: string;
  phaseStatus?: string;
  completedPhasesCount?: number;
  activeBatches?: number;
  activeImageBatches?: number;
  activeVideoBatches?: number;
  failedBatches?: number;
  failedVideoBatches?: number;
  assetsCount?: number;
  warning?: string;
  nextSteps: string[];
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function toDisplayPhase(phase: string): string {
  return phase
    .split('_')
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(' ');
}

function extractTopNextSteps(nextAction: string | undefined): string[] {
  if (!nextAction) return [];
  const lines = nextAction
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.replace(/^\*\*(.+)\*\*$/, '$1'))
    .map((line) => line.replace(/^[-*]\s+/, ''))
    .map((line) => line.replace(/^\d+\.\s+/, ''))
    .map((line) => line.replace(/\*\*/g, ''))
    .filter((line) => !/^phase ready/i.test(line));

  return lines.slice(0, 3);
}

function buildCompactSummary(
  toolName: string,
  resultObj: Record<string, unknown>,
): CompactToolSummary | null {
  if (toolName !== 'read_project' && toolName !== 'read_background_generation') {
    return null;
  }

  const summary: CompactToolSummary = {
    nextSteps: extractTopNextSteps(
      typeof resultObj.next_action === 'string' ? resultObj.next_action : undefined,
    ),
  };

  const errorText =
    typeof resultObj.error === 'string'
      ? resultObj.error
      : typeof resultObj.message === 'string' && resultObj.status === 'error'
        ? resultObj.message
        : undefined;
  if (errorText) {
    summary.warning = errorText;
  }

  const project = getRecord(resultObj.project);
  if (project) {
    if (typeof project.title === 'string') {
      summary.projectName = project.title;
    }
    if (typeof project.currentPhase === 'string') {
      summary.phase = toDisplayPhase(project.currentPhase);
    }

    const phases = getRecord(project.phases);
    if (phases) {
      let completedCount = 0;
      let currentPhaseStatus: string | undefined;
      const currentPhaseKey =
        typeof project.currentPhase === 'string' ? project.currentPhase : undefined;
      for (const [phaseKey, phaseValue] of Object.entries(phases)) {
        const phaseObj = getRecord(phaseValue);
        const phaseStatus = typeof phaseObj?.status === 'string' ? phaseObj.status : '';
        if (phaseStatus === 'completed') {
          completedCount += 1;
        }
        if (currentPhaseKey && phaseKey === currentPhaseKey) {
          currentPhaseStatus = phaseStatus;
        }
      }
      summary.completedPhasesCount = completedCount;
      if (currentPhaseStatus) {
        summary.phaseStatus = currentPhaseStatus.replace(/_/g, ' ');
      }
    }

    if (Array.isArray(project.assets)) {
      summary.assetsCount = project.assets.length;
    }

    const backgroundGeneration = getRecord(project.backgroundGeneration);
    if (backgroundGeneration) {
      const batches = Array.isArray(backgroundGeneration.batches)
        ? backgroundGeneration.batches
        : [];
      summary.activeBatches = batches.filter((batch) => {
        const batchObj = getRecord(batch);
        return batchObj?.status === 'running' || batchObj?.status === 'queued';
      }).length;
      summary.activeImageBatches = batches.filter((batch) => {
        const batchObj = getRecord(batch);
        return (
          batchObj?.kind === 'image' &&
          (batchObj?.status === 'running' || batchObj?.status === 'queued')
        );
      }).length;
      summary.activeVideoBatches = batches.filter((batch) => {
        const batchObj = getRecord(batch);
        return (
          batchObj?.kind === 'video' &&
          (batchObj?.status === 'running' || batchObj?.status === 'queued')
        );
      }).length;
      summary.failedBatches = batches.filter((batch) => {
        const batchObj = getRecord(batch);
        return (
          batchObj?.status === 'failed' ||
          (typeof batchObj?.failedItems === 'number' && batchObj.failedItems > 0)
        );
      }).length;
    }
  }

  if (toolName === 'read_background_generation') {
    if (Array.isArray(resultObj.active_batch_ids)) {
      summary.activeBatches = resultObj.active_batch_ids.length;
    }

    const batches = Array.isArray(resultObj.batches) ? resultObj.batches : [];
    summary.activeImageBatches = batches.filter((batch) => {
      const batchObj = getRecord(batch);
      return (
        batchObj?.kind === 'image' &&
        (batchObj?.status === 'running' || batchObj?.status === 'queued')
      );
    }).length;
    summary.activeVideoBatches = batches.filter((batch) => {
      const batchObj = getRecord(batch);
      return (
        batchObj?.kind === 'video' &&
        (batchObj?.status === 'running' || batchObj?.status === 'queued')
      );
    }).length;
    summary.failedVideoBatches = batches.filter((batch) => {
      const batchObj = getRecord(batch);
      return (
        batchObj?.kind === 'video' &&
        (batchObj?.status === 'failed' ||
          (typeof batchObj?.failed_items === 'number' && batchObj.failed_items > 0))
      );
    }).length;
  }

  const hasSignal =
    Boolean(summary.projectName) ||
    Boolean(summary.phase) ||
    Boolean(summary.phaseStatus) ||
    summary.completedPhasesCount !== undefined ||
    summary.activeBatches !== undefined ||
    summary.assetsCount !== undefined ||
    Boolean(summary.warning) ||
    summary.nextSteps.length > 0;

  return hasSignal ? summary : null;
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

function renderGenerationTool(
  toolName: string,
  args: Record<string, unknown> | undefined,
  status: ToolCallStatus | undefined,
  result?: unknown,
): React.ReactNode {
  const sceneNumber = args?.scene_number as number | undefined;
  const prompt =
    (args?.prompt as string | undefined) ||
    (args?.motion_prompt as string | undefined);
  const promptFile =
    (args?.prompt_file as string | undefined) ||
    (args?.motion_prompt_file as string | undefined);
  const referenceImages = Array.isArray(args?.reference_images)
    ? args?.reference_images
    : [];
  const imageType = args?.image_type as string | undefined;
  const generationMode = args?.generation_mode as string | undefined;
  const aspectRatio = args?.aspect_ratio as string | undefined;
  const resultObj =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : undefined;
  const resultSummary =
    typeof resultObj?.summary === 'string'
      ? resultObj.summary
      : typeof resultObj?.content === 'string'
        ? resultObj.content
        : typeof result === 'string'
          ? result
          : undefined;

  return (
    <div className={styles.generateTool}>
      <div className={styles.generateHeader}>
        <span className={styles.generateTitle}>
          {toolName.replace(/_/g, ' ')}
        </span>
        <span className={styles.generateState}>
          {status === 'executing' ? 'In progress' : 'Completed'}
        </span>
      </div>
      <div className={styles.generateMeta}>
        {sceneNumber !== undefined && <span>Scene {sceneNumber}</span>}
        {imageType && <span>{imageType}</span>}
        {generationMode && <span>{generationMode}</span>}
        {aspectRatio && <span>{aspectRatio}</span>}
      </div>
      {prompt && (
        <div className={styles.generateSection}>
          <div className={styles.resultLabel}>Prompt</div>
          <div className={styles.generatePrompt}>{prompt}</div>
        </div>
      )}
      {promptFile && (
        <div className={styles.generateSection}>
          <div className={styles.resultLabel}>Prompt file</div>
          <div className={styles.generatePrompt}>{promptFile}</div>
        </div>
      )}
      {referenceImages.length > 0 && (
        <div className={styles.generateSection}>
          <div className={styles.resultLabel}>References</div>
          <div className={styles.referenceList}>
            {referenceImages.map((reference, index) => {
              const ref =
                reference && typeof reference === 'object'
                  ? (reference as Record<string, unknown>)
                  : null;
              const label =
                (typeof ref?.name === 'string' && ref.name) ||
                (typeof ref?.image_id === 'string' && ref.image_id) ||
                `Reference ${index + 1}`;
              return (
                <span key={`${label}-${index}`} className={styles.referenceChip}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {resultSummary && status !== 'executing' && (
        <div className={styles.generateSection}>
          <div className={styles.resultLabel}>Summary</div>
          <div className={styles.generateResult}>
            <ReactMarkdown>{resultSummary}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export function shouldToolStartExpanded(
  _toolName: string,
  _status: ToolCallStatus,
): boolean {
  return false;
}

export default function ToolCallCard({
  toolName,
  args,
  status = 'executing',
  result,
  duration,
  agentName,
  streamingContent,
  onFileClick,
}: ToolCallCardProps) {
  const isExecuting = status === 'executing';

  // Important/generative tools stay open, routine tools collapse after completion.
  const [isExpanded, setIsExpanded] = useState(
    () => shouldToolStartExpanded(toolName, status),
  );

  const effectiveExpanded = isExpanded;

  const isError = status === 'error';
  const isCompleted = status === 'completed';
  const needsConfirmation = status === 'needs_confirmation';

  // CLI-style format: [TOOL] toolName
  const prefix = agentName ? `[${agentName}]` : '[TOOL]';

  // Format result for display - extract key information like file paths
  let resultDisplay = '';
  let filePath: string | undefined;
  let fileSize: string | undefined;
  let preview: string | undefined;
  let summaryText: string | undefined;
  let nextActionText: string | undefined;
  let compactSummary: CompactToolSummary | null = null;
  let rawDetails: string | undefined;

  if (result !== undefined) {
    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>;
      const isProjectSummaryTool =
        toolName === 'read_project' || toolName === 'read_background_generation';

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
      if ('summary' in resultObj && typeof resultObj.summary === 'string') {
        summaryText = resultObj.summary;
      }
      if (
        'next_action' in resultObj &&
        typeof resultObj.next_action === 'string'
      ) {
        nextActionText = resultObj.next_action;
      }
      compactSummary = buildCompactSummary(toolName, resultObj);

      // Check if result has content field (like dispatch_content_agent results)
      if ('content' in resultObj && typeof resultObj.content === 'string') {
        resultDisplay = String(resultObj.content);
      } else if (
        'output' in resultObj &&
        typeof resultObj.output === 'string'
      ) {
        resultDisplay = String(resultObj.output);
      } else if (
        preview &&
        prefersInlineTextPreview(toolName) &&
        !isGenerationTool(toolName)
      ) {
        resultDisplay = preview;
        preview = undefined;
      } else if (filePath && !resultDisplay) {
        // If we have a file path but no content, show the file path
        resultDisplay = `File: ${filePath}`;
      } else if (summaryText || nextActionText) {
        // Structured guidance results are rendered in dedicated sections below.
        resultDisplay = '';
      } else if (isProjectSummaryTool) {
        // Keep project/background payload behind details; default to summary-first UI.
        resultDisplay = '';
      } else {
        // Show full object result in expanded view
        resultDisplay = JSON.stringify(result, null, 2);
      }

      if (isProjectSummaryTool) {
        summaryText = undefined;
        nextActionText = undefined;
        rawDetails = JSON.stringify(result, null, 2);
      }
    } else {
      resultDisplay = String(result);
    }
  }

  const borderClass = isExecuting
    ? styles.borderExecuting
    : isError
      ? styles.borderError
      : needsConfirmation
        ? styles.borderNeedsConfirmation
      : isCompleted
        ? styles.borderCompleted
        : styles.borderDefault;

  const toolCallText = formatToolCall(toolName, args);

  const renderSpecialContent = (): React.ReactNode | null => {
    if (toolName === 'think') {
      return renderThinkTool(args, status);
    }
    if (toolName === 'dispatch_agent') {
      return renderDispatchAgentTool(args, status, result);
    }
    if (toolName === 'read_project_state' || toolName === 'write_project_state') {
      return renderProjectStateTool(toolName, args, status);
    }
    if (isGenerationTool(toolName)) {
      return renderGenerationTool(toolName, args, status, result);
    }
    return null;
  };

  const specialContent = renderSpecialContent();

  return (
    <div className={`${styles.container} ${borderClass}`}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronRight
          size={14}
          className={effectiveExpanded ? styles.chevronExpanded : styles.chevron}
        />
        {isExecuting ? (
          <AlertCircle size={14} className={styles.statusIconExecuting} />
        ) : isError ? (
          <XCircle size={14} className={styles.statusIconError} />
        ) : needsConfirmation ? (
          <AlertCircle
            size={14}
            className={styles.statusIconNeedsConfirmation}
          />
        ) : (
          <CheckCircle2 size={14} className={styles.statusIconCompleted} />
        )}
        <span className={styles.toolName}>{toolName}</span>
        <span className={styles.cliPrefix}>{prefix}</span>
        <span className={styles.cliToolName}>
          {isExecuting
            ? 'Running'
            : isError
              ? 'Failed'
              : needsConfirmation
                ? 'Needs confirmation'
                : 'Success'}
        </span>
        {!isExecuting && duration !== undefined && duration > 0 && (
          <span className={styles.duration}>{formatDuration(duration)}</span>
        )}
      </button>

      {effectiveExpanded && (
        <div className={styles.content}>
          <div className={styles.toolCall}>
            <span className={styles.toolCallCode}>{toolCallText}</span>
          </div>

          {needsConfirmation && (
            <div className={styles.confirmationState}>
              Waiting for your confirmation before this tool can continue.
            </div>
          )}

          {specialContent}

          {!isExecuting &&
            (filePath ||
              fileSize ||
              resultDisplay ||
              summaryText ||
              nextActionText ||
              compactSummary) &&
            !specialContent && (
            <div className={styles.cliResult}>
              {compactSummary && (
                <div className={styles.summaryCard}>
                  <div className={styles.resultLabel}>Summary</div>
                  <ul className={styles.summaryList}>
                    {compactSummary.projectName && (
                      <li>Project: {compactSummary.projectName}</li>
                    )}
                    {compactSummary.phase && (
                      <li>
                        Phase: {compactSummary.phase}
                        {compactSummary.phaseStatus
                          ? ` (${compactSummary.phaseStatus})`
                          : ''}
                      </li>
                    )}
                    {compactSummary.completedPhasesCount !== undefined && (
                      <li>Completed phases: {compactSummary.completedPhasesCount}</li>
                    )}
                    {compactSummary.activeBatches !== undefined && (
                      <li>Background batches active: {compactSummary.activeBatches}</li>
                    )}
                    {(compactSummary.activeImageBatches !== undefined ||
                      compactSummary.activeVideoBatches !== undefined) && (
                      <li>
                        Image batches: {compactSummary.activeImageBatches ?? 0} ·
                        Video batches: {compactSummary.activeVideoBatches ?? 0}
                      </li>
                    )}
                    {(compactSummary.failedBatches !== undefined ||
                      compactSummary.failedVideoBatches !== undefined) && (
                      <li>
                        Failed batches: {compactSummary.failedBatches ?? 0}
                        {compactSummary.failedVideoBatches !== undefined
                          ? ` (video: ${compactSummary.failedVideoBatches})`
                          : ''}
                      </li>
                    )}
                    {compactSummary.assetsCount !== undefined && (
                      <li>Assets generated: {compactSummary.assetsCount}</li>
                    )}
                  </ul>
                  {compactSummary.warning && (
                    <div className={styles.summaryWarning}>{compactSummary.warning}</div>
                  )}
                  {compactSummary.nextSteps.length > 0 && (
                    <div className={styles.summaryNextSteps}>
                      <div className={styles.resultLabel}>Next</div>
                      <ul className={styles.summaryList}>
                        {compactSummary.nextSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {filePath && (
                <button
                  type="button"
                  className={styles.cliFilePath}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileClick?.(filePath);
                  }}
                  title="Click to open in Preview"
                >
                  📄 {filePath}
                  {fileSize && (
                    <span className={styles.cliFileSize}> ({fileSize})</span>
                  )}
                </button>
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
              {summaryText && (
                <div className={styles.cliResultContent}>
                  <div className={styles.resultLabel}>Summary</div>
                  <pre className={styles.cliResultPre}>{summaryText}</pre>
                </div>
              )}
              {nextActionText && (
                <div className={styles.cliResultContent}>
                  <div className={styles.resultLabel}>Next Action</div>
                  <div className={styles.resultContentMarkdown}>
                    <ReactMarkdown>{nextActionText}</ReactMarkdown>
                  </div>
                </div>
              )}
              {rawDetails && (
                <div className={styles.cliPreview}>
                  <details>
                    <summary>Details</summary>
                    <pre className={styles.cliResultPre}>{rawDetails}</pre>
                  </details>
                </div>
              )}
            </div>
            )}

          {isError && !resultDisplay && (
            <div className={styles.errorResult}>
              <div className={styles.errorLabel}>Error</div>
              <pre className={styles.errorMessage}>Tool failed.</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
