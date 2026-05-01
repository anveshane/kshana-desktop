/**
 * `KshanaCoreManager` — main-process owner of the embedded
 * `ConversationManager` from kshana-ink. Replaces the legacy
 * spawn-and-WebSocket `localBackendManager` with an in-process
 * integration: kshana-ink's pipeline runs inside the Electron main
 * process, and events flow through callbacks to whoever owns the
 * IPC bridge.
 *
 * Lifetime: the manager is constructed once at app start, lives for
 * the duration of the Electron session, and is shut down on app quit
 * (or rebuilt on settings change via `restart()`).
 *
 * State ownership: `ConversationManager` already owns sessions,
 * AbortControllers, focused projects, and timer checkpoints. This
 * class is a thin facade that converts AppSettings → process.env
 * before constructing the manager, and translates the
 * `ConversationEvents` callback shape into a single
 * `KshanaCoreEvent` stream the IPC bridge can re-publish over
 * `webContents.send`.
 */
import { app } from 'electron';
import {
  ConversationManager,
  type ConversationManagerConfig,
  type ConversationEvents,
} from 'kshana-ink/manager';
import type { LLMClientConfig } from 'kshana-ink/core/llm';
import type { AppSettings } from '../shared/settingsTypes';
import { getComfyUiUrl } from './localBackendManager';

/**
 * Single normalized event the IPC bridge publishes downstream.
 * Mirrors the existing WebSocket `ServerMessage` shape so the renderer
 * doesn't have to learn a new schema — only the transport changes.
 */
export interface KshanaCoreEvent {
  /** The kshana-ink ServerMessageType (`tool_call`, `agent_response`, …). */
  eventName: string;
  /** Session this event belongs to. */
  sessionId: string;
  /** Shape depends on eventName. Untyped at this layer; the renderer narrows. */
  data: unknown;
}

export type KshanaCoreEventCallback = (event: KshanaCoreEvent) => void;

/** Subset of `ConversationManager.runTask` opts the IPC bridge forwards. */
export interface RunTaskOpts {
  stopAtStage?: string;
}

export interface RedoNodeOpts {
  editedPrompt?: string;
  frame?: string;
  scope?: 'prompt' | 'image_only';
}

export interface ConfigureProjectOpts {
  projectDir: string;
  templateId?: string;
  style?: string;
  duration?: number;
  autonomousMode?: boolean;
}

export interface RunResult {
  status: 'completed' | 'failed' | 'cancelled' | 'awaiting_input';
  output?: string;
  error?: string;
}

/**
 * Apply AppSettings to `process.env` in-place. Mirrors
 * `buildLocalBackendEnv()` from `localBackendManager.ts` but does NOT
 * set `KSHANA_HOST/PORT/PUBLIC_HOST` (no Fastify in this path) and
 * does NOT delete NODE_OPTIONS / TS_NODE_* (those are already owned
 * by the main process and we don't spawn anything).
 *
 * Exported for testing.
 */
export function applyEnvFromSettings(settings: AppSettings): void {
  const comfyUiUrl = getComfyUiUrl(settings);
  process.env['COMFYUI_BASE_URL'] = comfyUiUrl;

  if (isComfyCloudUrl(comfyUiUrl) && settings.comfyCloudApiKey.trim()) {
    process.env['COMFY_CLOUD_API_KEY'] = settings.comfyCloudApiKey.trim();
  } else {
    delete process.env['COMFY_CLOUD_API_KEY'];
  }

  const projectDir = settings.projectDir?.trim();
  if (projectDir) {
    process.env['KSHANA_PROJECT_DIR'] = projectDir;
  }

  switch (settings.llmProvider) {
    case 'gemini':
      process.env['LLM_PROVIDER'] = 'gemini';
      process.env['GOOGLE_API_KEY'] = settings.googleApiKey.trim();
      process.env['GEMINI_MODEL'] =
        settings.geminiModel.trim() || 'gemini-2.5-flash';
      break;
    case 'openai':
      process.env['LLM_PROVIDER'] = 'openai';
      process.env['OPENAI_API_KEY'] = settings.openaiApiKey.trim();
      process.env['OPENAI_BASE_URL'] =
        settings.openaiBaseUrl.trim() || 'https://api.openai.com/v1';
      process.env['OPENAI_MODEL'] = settings.openaiModel.trim() || 'gpt-4o';
      break;
    case 'openrouter':
      process.env['LLM_PROVIDER'] = 'openrouter';
      process.env['OPENROUTER_API_KEY'] = settings.openRouterApiKey.trim();
      process.env['OPENROUTER_MODEL'] =
        settings.openRouterModel.trim() || 'z-ai/glm-4.7-flash';
      break;
    case 'lmstudio':
    default:
      process.env['LLM_PROVIDER'] = 'lmstudio';
      process.env['LMSTUDIO_BASE_URL'] = withV1Suffix(
        settings.lmStudioUrl.trim() || 'http://127.0.0.1:1234',
      );
      process.env['LMSTUDIO_MODEL'] =
        settings.lmStudioModel.trim() || 'qwen3';
      break;
  }

  if (app.isPackaged) {
    process.env['NODE_ENV'] = 'production';
  }
}

function isComfyCloudUrl(url: string): boolean {
  return /(^|\.)cloud\.comfy\.org/.test(url);
}

function withV1Suffix(url: string): string {
  return /\/v1\/?$/.test(url) ? url : `${url.replace(/\/$/, '')}/v1`;
}

/**
 * Build the `LLMClientConfig` from settings. The provider routing
 * (`LLM_PROVIDER` env var) is set by `applyEnvFromSettings`;
 * kshana-ink's `getLLMConfig()` reads that env to dispatch. The
 * explicit `LLMClientConfig` here just carries baseUrl / apiKey /
 * model so the manager doesn't need to read env vars at construction
 * time for the active provider.
 */
function buildLLMConfig(settings: AppSettings): LLMClientConfig {
  switch (settings.llmProvider) {
    case 'gemini':
      return {
        apiKey: settings.googleApiKey.trim(),
        model: settings.geminiModel.trim() || 'gemini-2.5-flash',
      };
    case 'openai':
      return {
        apiKey: settings.openaiApiKey.trim(),
        baseUrl:
          settings.openaiBaseUrl.trim() || 'https://api.openai.com/v1',
        model: settings.openaiModel.trim() || 'gpt-4o',
      };
    case 'openrouter':
      return {
        apiKey: settings.openRouterApiKey.trim(),
        model: settings.openRouterModel.trim() || 'z-ai/glm-4.7-flash',
      };
    case 'lmstudio':
    default:
      return {
        baseUrl: withV1Suffix(
          settings.lmStudioUrl.trim() || 'http://127.0.0.1:1234',
        ),
        model: settings.lmStudioModel.trim() || 'qwen3',
      };
  }
}

/**
 * Translate a `ConversationEvents` object (the kshana-ink callback
 * surface) into a stream of `KshanaCoreEvent`s on `eventCb`. Each
 * callback's args are normalized into a `data` payload; the
 * `eventName` matches the existing WebSocket `ServerMessageType` so
 * the renderer doesn't have to learn new event names.
 *
 * Exported for testing — IPC bridge tests use this directly to verify
 * event translation independently of the full manager wiring.
 */
export function buildEventsAdapter(
  eventCb: KshanaCoreEventCallback,
): ConversationEvents {
  const emit = (eventName: string, sessionId: string, data: unknown) =>
    eventCb({ eventName, sessionId, data });

  return {
    onProgress: (sessionId, percentage, message) =>
      emit('progress', sessionId, { percentage, message }),
    onToolCall: (sessionId, toolCallId, toolName, args, agentName) =>
      emit('tool_call', sessionId, { toolCallId, toolName, arguments: args, agentName, status: 'in_progress' }),
    onToolResult: (sessionId, toolCallId, toolName, result, isError, agentName) =>
      emit('tool_result', sessionId, { toolCallId, toolName, result, isError, agentName }),
    onTodoUpdate: (sessionId, todos) =>
      emit('todo_updated', sessionId, { todos }),
    onAgentText: (sessionId, text, isFinal) =>
      emit('agent_response', sessionId, { output: text, status: isFinal ? 'completed' : 'running' }),
    onQuestion: (sessionId, question, isConfirmation, options, autoApproveTimeoutMs) =>
      emit('agent_question', sessionId, { question, isConfirmation, options, autoApproveTimeoutMs }),
    onAgentStatus: (sessionId, status, agentName) =>
      emit('status', sessionId, { status, agentName }),
    onStreamingText: (sessionId, chunk, done) =>
      emit('stream_chunk', sessionId, { content: chunk, done }),
    onToolStreaming: (sessionId, toolCallId, chunk, done, agentName, toolName, reset) =>
      emit('stream_chunk', sessionId, { content: chunk, done, toolCallId, agentName, toolName, reset }),
    onContextUsage: (sessionId, data) => emit('context_usage', sessionId, data),
    onPhaseTransition: (sessionId, data) => emit('phase_transition', sessionId, data),
    onTimelineUpdate: (sessionId, data) => emit('timeline_update', sessionId, data),
    onNotification: (sessionId, data) => emit('notification', sessionId, data),
    onProjectFocused: (sessionId, data) => emit('project_focused', sessionId, data),
    onMediaGenerated: (sessionId, data) => emit('media_generated', sessionId, data),
  };
}

export class KshanaCoreManager {
  private cm: ConversationManager | null = null;

  /**
   * Construct the embedded ConversationManager. Sets process.env
   * from settings BEFORE constructing the manager so any tool that
   * reads env vars at construction time sees the right values.
   */
  start(settings: AppSettings): void {
    applyEnvFromSettings(settings);
    const config: ConversationManagerConfig = {
      llmConfig: buildLLMConfig(settings),
    };
    this.cm = new ConversationManager(config);
  }

  /** Tear down the manager. Safe to call when not started. */
  stop(): void {
    if (this.cm) {
      this.cm.shutdown();
      this.cm = null;
    }
  }

  /** Replace the manager (used when settings change). */
  restart(settings: AppSettings): void {
    this.stop();
    this.start(settings);
  }

  /** Whether `start()` has run and the manager is alive. */
  isStarted(): boolean {
    return this.cm !== null;
  }

  /** Create a new session; returns the session id. */
  createSession(): string {
    const cm = this.requireStarted();
    const session = cm.createSession();
    return session.id;
  }

  async configureSessionForProject(
    sessionId: string,
    opts: ConfigureProjectOpts,
  ): Promise<void> {
    const cm = this.requireStarted();
    // Pass through whatever ConversationManager expects. The actual
    // shape may differ per kshana-ink version; we forward the opts
    // object as-is and let the manager validate.
    await (cm as unknown as { configureSessionForProject: (...a: unknown[]) => Promise<void> })
      .configureSessionForProject(sessionId, opts);
  }

  /**
   * Run a task on the given session. `eventCb` receives a stream of
   * KshanaCoreEvents (mirroring the existing WebSocket message types)
   * — typically the IPC bridge re-publishes each event over
   * `webContents.send('kshana:event', …)`.
   *
   * Returns an error-shaped result rather than throwing if the manager
   * hasn't been started — the caller (IPC bridge) shouldn't have to
   * try/catch every call.
   */
  async runTask(
    sessionId: string,
    task: string,
    opts: RunTaskOpts,
    eventCb: KshanaCoreEventCallback,
  ): Promise<RunResult> {
    if (!this.cm) {
      return { status: 'failed', error: 'KshanaCoreManager not started — call start() first.' };
    }
    const events = buildEventsAdapter(eventCb);
    try {
      const result = await (this.cm as unknown as {
        runTask: (
          sessionId: string,
          task: string,
          events?: ConversationEvents,
          opts?: RunTaskOpts,
        ) => Promise<{ status: string; output?: string; error?: string }>;
      }).runTask(sessionId, task, events, opts);
      return {
        status: result.status as RunResult['status'],
        ...(result.output ? { output: result.output } : {}),
        ...(result.error ? { error: result.error } : {}),
      };
    } catch (err) {
      return {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Mirror of ConversationManager.cancelTask — returns false if no session. */
  cancelTask(sessionId: string): boolean {
    if (!this.cm) return false;
    return (this.cm as unknown as { cancelTask: (s: string) => boolean }).cancelTask(sessionId);
  }

  async redoNode(
    sessionId: string,
    nodeId: string,
    opts?: RedoNodeOpts,
  ): Promise<{ ok: boolean; nodeId?: string; editedPrompt?: string; error?: string }> {
    if (!this.cm) return { ok: false, error: 'KshanaCoreManager not started' };
    return (this.cm as unknown as {
      redoNode: (s: string, n: string, o?: RedoNodeOpts) => Promise<{ ok: boolean; nodeId?: string; editedPrompt?: string; error?: string }>;
    }).redoNode(sessionId, nodeId, opts);
  }

  setAutonomousMode(sessionId: string, enabled: boolean): void {
    if (!this.cm) return;
    (this.cm as unknown as { setAutonomousMode: (s: string, e: boolean) => void }).setAutonomousMode(sessionId, enabled);
  }

  focusSessionProject(sessionId: string, projectName: string): void {
    if (!this.cm) return;
    (this.cm as unknown as { focusSessionProject: (s: string, p: string) => void }).focusSessionProject(sessionId, projectName);
  }

  deleteSession(sessionId: string): void {
    if (!this.cm) return;
    (this.cm as unknown as { deleteSession: (s: string) => void }).deleteSession(sessionId);
  }

  private requireStarted(): ConversationManager {
    if (!this.cm) {
      throw new Error('KshanaCoreManager not started — call start() first.');
    }
    return this.cm;
  }
}
