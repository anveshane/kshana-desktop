/**
 * Tests for `KshanaCoreManager` — the main-process owner of the
 * embedded `ConversationManager`.
 *
 * Goal: verify the manager translates AppSettings into env vars
 * BEFORE constructing ConversationManager, forwards every
 * ConversationEvents callback to the supplied event sink, and cleans
 * up correctly on stop()/restart().
 *
 * Strategy: mock `kshana-ink/manager` with a fake ConversationManager
 * whose runTask synchronously invokes provided ConversationEvents
 * callbacks. The mock records construction order so we can assert
 * env vars were set before the constructor ran.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { AppSettings } from '../shared/settingsTypes';

// ── Track construction order: each call to `new ConversationManager()`
// snapshots the relevant env vars at that moment. The test uses these
// snapshots to confirm the manager set env BEFORE construction.
const mockState: {
  envSnapshots: Array<Record<string, string | undefined>>;
  shutdownCalls: number;
  lastInstance: FakeConversationManager | null;
} = {
  envSnapshots: [],
  shutdownCalls: 0,
  lastInstance: null,
};

class FakeConversationManager {
  sessions = new Map<string, { id: string }>();

  constructor(_config: unknown) {
    mockState.envSnapshots.push({
      LLM_PROVIDER: process.env['LLM_PROVIDER'],
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'],
      COMFYUI_BASE_URL: process.env['COMFYUI_BASE_URL'],
      KSHANA_PROJECT_DIR: process.env['KSHANA_PROJECT_DIR'],
    });
    mockState.lastInstance = this;
  }

  createSession(_mode: 'local' | 'remote' = 'local') {
    const sessionId = `s-${this.sessions.size + 1}`;
    this.sessions.set(sessionId, { id: sessionId });
    return { id: sessionId, status: 'idle', taskHistory: [], lastActivity: Date.now() };
  }

  async configureSessionForProject(_sessionId: string, _opts: unknown) {
    // No-op in the mock
  }

  // The fake runTask invokes a couple of representative callbacks
  // synchronously so the test can assert the bridge wires them.
  // Signatures match the real ConversationEvents shape.
  async runTask(
    _sessionId: string,
    _task: string,
    events?: {
      onToolCall?: (sessionId: string, toolCallId: string, toolName: string, args: Record<string, unknown>, agentName?: string) => void;
      onAgentText?: (sessionId: string, text: string, isFinal: boolean) => void;
    },
  ) {
    events?.onToolCall?.('s-1', 'tc-1', 'kshana_run_to', { project: 'p1' });
    events?.onAgentText?.('s-1', 'done', true);
    return { status: 'completed' as const, output: 'done', todos: [] };
  }

  async redoNode(
    _sessionId: string,
    nodeId: string,
    opts?: { editedPrompt?: string },
  ) {
    return { ok: true, nodeId, editedPrompt: opts?.editedPrompt };
  }

  cancelTask(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  shutdown(): void {
    mockState.shutdownCalls += 1;
  }

  // No-ops for the rest of the surface
  setAutonomousMode(_sessionId: string, _enabled: boolean): void {}
  focusSessionProject(_sessionId: string, _project: string): void {}
  deleteSession(_sessionId: string): void {}
}

jest.mock('kshana-ink/manager', () => ({
  ConversationManager: FakeConversationManager,
}));

jest.mock('electron', () => ({
  app: { isPackaged: false },
}));

// Imported AFTER the jest.mock calls so the mock binds.
// eslint-disable-next-line @typescript-eslint/no-require-imports, import/first
const { KshanaCoreManager } = require('./kshanaCoreManager') as typeof import('./kshanaCoreManager');

const baseSettings: AppSettings = {
  backendMode: 'local',
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyCloudApiKey: '',
  comfyuiTimeout: 1800,
  llmProvider: 'openai',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: 'sk-test',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
  themeId: 'studio-neutral',
};

beforeEach(() => {
  mockState.envSnapshots = [];
  mockState.shutdownCalls = 0;
  mockState.lastInstance = null;
  delete process.env['LLM_PROVIDER'];
  delete process.env['OPENAI_API_KEY'];
  delete process.env['COMFYUI_BASE_URL'];
  delete process.env['KSHANA_PROJECT_DIR'];
});

describe('KshanaCoreManager', () => {
  it('start() writes LLM_PROVIDER and OPENAI_API_KEY to process.env BEFORE constructing ConversationManager', () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);

    expect(mockState.envSnapshots).toHaveLength(1);
    expect(mockState.envSnapshots[0]?.LLM_PROVIDER).toBe('openai');
    expect(mockState.envSnapshots[0]?.OPENAI_API_KEY).toBe('sk-test');
  });

  it('runTask forwards onToolCall events to the supplied eventCb with the original payload', async () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);
    const sessionId = mgr.createSession();
    const events: Array<{ eventName: string; sessionId: string; data: unknown }> = [];

    await mgr.runTask(sessionId, 'a task', {}, (e: { eventName: string; sessionId: string; data: unknown }) => events.push(e));

    const toolCallEvent = events.find((e) => e.eventName === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent?.sessionId).toBe('s-1');
    expect(toolCallEvent?.data).toMatchObject({ toolName: 'kshana_run_to', toolCallId: 'tc-1' });
  });

  it('runTask also forwards onAgentResponse events', async () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);
    const sessionId = mgr.createSession();
    const events: Array<{ eventName: string }> = [];

    await mgr.runTask(sessionId, 'task', {}, (e: { eventName: string; sessionId: string; data: unknown }) => events.push(e));

    expect(events.find((e) => e.eventName === 'agent_response')).toBeDefined();
  });

  it('cancelTask returns false when the session does not exist', () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);
    expect(mgr.cancelTask('does-not-exist')).toBe(false);
  });

  it('redoNode forwards editedPrompt unchanged to the underlying ConversationManager', async () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);
    const sessionId = mgr.createSession();
    const result = await mgr.redoNode(sessionId, 'shot_image:scene_1_shot_4', {
      editedPrompt: 'a brand new prompt',
    });
    expect(result).toMatchObject({
      nodeId: 'shot_image:scene_1_shot_4',
      editedPrompt: 'a brand new prompt',
    });
  });

  it('restart() calls shutdown() then constructs a fresh ConversationManager', () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);
    expect(mockState.envSnapshots).toHaveLength(1);
    mgr.restart({ ...baseSettings, llmProvider: 'gemini', googleApiKey: 'g-key' });
    expect(mockState.shutdownCalls).toBe(1);
    expect(mockState.envSnapshots).toHaveLength(2);
    expect(mockState.envSnapshots[1]?.LLM_PROVIDER).toBe('gemini');
  });

  it('runTask before start() returns an error-shaped result rather than throwing', async () => {
    const mgr = new KshanaCoreManager();
    const events: Array<{ eventName: string; data: unknown }> = [];
    const result = await mgr.runTask('any', 'task', {}, (e: { eventName: string; sessionId: string; data: unknown }) => events.push(e));
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not started|start\(\) first/i);
  });

  it('stop() calls shutdown() and subsequent runTask returns failed', async () => {
    const mgr = new KshanaCoreManager();
    mgr.start(baseSettings);
    const sessionId = mgr.createSession();
    mgr.stop();
    expect(mockState.shutdownCalls).toBe(1);
    const result = await mgr.runTask(sessionId, 'task', {}, () => {});
    expect(result.status).toBe('failed');
  });
});
