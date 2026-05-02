/**
 * Layer-2 e2e test bridge.
 *
 * Installs in-memory fakes for `window.kshana` and a minimal
 * `window.electron` so the renderer can run in a plain browser
 * (no Electron, no preload, no kshana-ink) for fast Playwright tests.
 *
 * Driven by JSON scenarios loaded via `window.__kshanaTest.loadScenario`.
 * A scenario maps incoming bridge calls to scripted streaming events
 * — same wire shape kshana-ink emits, so the chat UI's event handlers
 * don't know the difference.
 *
 * Imported by `index.tsx` only when `process.env.KSHANA_TEST_BRIDGE === '1'`.
 */
import type {
  KshanaEvent,
  KshanaEventName,
  CreateSessionResponse,
  ConfigureProjectRequest,
  OkResponse,
  RunTaskRequest,
  SendResponseRequest,
  CancelTaskRequest,
  CancelTaskResponse,
  RedoNodeRequest,
  FocusProjectRequest,
  SetAutonomousRequest,
  DeleteSessionRequest,
} from '../../shared/kshanaIpc';

// ── Scenario shape ───────────────────────────────────────────────────

export type ScenarioChannel =
  | 'runTask'
  | 'sendResponse'
  | 'redoNode'
  | 'focusProject';

export interface ScenarioEmit {
  /** Delay in ms before this event fires, relative to the rule trigger. */
  after?: number;
  event: KshanaEventName;
  data: unknown;
}

export interface ScenarioRule {
  on: {
    channel: ScenarioChannel;
    /** Substring match against the inbound payload's main text/id field. */
    match?: string;
  };
  emit: ScenarioEmit[];
}

export interface Scenario {
  /** Pre-set project so ChatPanelEmbedded auto-focuses on mount. */
  project?: { name: string; directory?: string };
  rules: ScenarioRule[];
}

// ── Test API exposed on window.__kshanaTest ──────────────────────────

interface RecordedCall {
  channel: string;
  args: unknown;
  at: number;
}

export interface KshanaTestApi {
  loadScenario(scenario: Scenario): void;
  /** Pick a scenario from the bundled catalog by name. */
  loadScenarioByName(name: string): boolean;
  /** All scenarios available in the bundled catalog. */
  listScenarios(): string[];
  emit(eventName: KshanaEventName, data: unknown): void;
  getCalls(channel?: string): RecordedCall[];
  getProject(): { name: string | null; directory: string | null };
  reset(): void;
}

// ── Internal state ───────────────────────────────────────────────────

interface ListenerSlot {
  eventName: KshanaEventName | '*';
  cb: (event: KshanaEvent) => void;
  active: boolean;
}

interface BridgeState {
  scenario: Scenario;
  listeners: ListenerSlot[];
  calls: RecordedCall[];
  sessionId: string;
  project: { name: string | null; directory: string | null };
  timers: Set<ReturnType<typeof setTimeout>>;
}

const state: BridgeState = {
  scenario: { rules: [] },
  listeners: [],
  calls: [],
  sessionId: 'test-session-1',
  project: { name: null, directory: null },
  timers: new Set(),
};

function record(channel: string, args: unknown): void {
  state.calls.push({ channel, args, at: Date.now() });
}

function emitEvent(eventName: KshanaEventName, data: unknown): void {
  const event: KshanaEvent = {
    eventName,
    sessionId: state.sessionId,
    data,
  };
  // Snapshot to avoid mutation-during-iteration when a listener
  // unsubscribes itself.
  for (const slot of state.listeners.slice()) {
    if (!slot.active) continue;
    if (slot.eventName === '*' || slot.eventName === eventName) {
      slot.cb(event);
    }
  }
}

function applyMatchingRules(channel: ScenarioChannel, payloadText: string): void {
  for (const rule of state.scenario.rules) {
    if (rule.on.channel !== channel) continue;
    if (rule.on.match && !payloadText.includes(rule.on.match)) continue;
    for (const step of rule.emit) {
      const delay = step.after ?? 0;
      const timer = setTimeout(() => {
        state.timers.delete(timer);
        emitEvent(step.event, step.data);
      }, delay);
      state.timers.add(timer);
    }
  }
}

/**
 * Returns a promise that resolves after the longest `after` delay among
 * scripted emits for any matching rule on the given channel — i.e. when
 * the last event for this turn has fired. This lets the fake `runTask`
 * stay pending for the duration of the streaming window, mirroring real
 * kshana-ink behavior so `useKshanaSession.status` correctly transitions
 * idle → running → idle around the playback.
 *
 * If no rule matches, resolves immediately.
 */
function whenLastEventFires(
  channel: ScenarioChannel,
  payloadText: string,
): Promise<void> {
  let maxDelay = 0;
  let matched = false;
  for (const rule of state.scenario.rules) {
    if (rule.on.channel !== channel) continue;
    if (rule.on.match && !payloadText.includes(rule.on.match)) continue;
    matched = true;
    for (const step of rule.emit) {
      maxDelay = Math.max(maxDelay, step.after ?? 0);
    }
  }
  if (!matched) return Promise.resolve();
  return new Promise<void>((resolve) => {
    // Add a small grace so the last setTimeout in applyMatchingRules
    // fires *before* this one resolves.
    const timer = setTimeout(() => {
      state.timers.delete(timer);
      resolve();
    }, maxDelay + 5);
    state.timers.add(timer);
  });
}

// ── Fake kshana bridge ───────────────────────────────────────────────

const fakeKshana = {
  createSession(): Promise<CreateSessionResponse> {
    record('createSession', undefined);
    return Promise.resolve({ sessionId: state.sessionId });
  },
  configureProject(req: ConfigureProjectRequest): Promise<OkResponse> {
    record('configureProject', req);
    return Promise.resolve({ ok: true });
  },
  async runTask(req: RunTaskRequest): Promise<OkResponse> {
    record('runTask', req);
    applyMatchingRules('runTask', req.task);
    // Stay pending until the last scripted event fires so the chat UI's
    // `isRunning` correctly reflects the streaming window.
    await whenLastEventFires('runTask', req.task);
    return { ok: true };
  },
  async sendResponse(req: SendResponseRequest): Promise<OkResponse> {
    record('sendResponse', req);
    applyMatchingRules('sendResponse', req.response);
    await whenLastEventFires('sendResponse', req.response);
    return { ok: true };
  },
  cancelTask(req: CancelTaskRequest): Promise<CancelTaskResponse> {
    record('cancelTask', req);
    return Promise.resolve({ cancelled: true });
  },
  redoNode(req: RedoNodeRequest): Promise<OkResponse> {
    record('redoNode', req);
    applyMatchingRules('redoNode', req.nodeId);
    return Promise.resolve({ ok: true });
  },
  focusProject(req: FocusProjectRequest): Promise<OkResponse> {
    record('focusProject', req);
    applyMatchingRules('focusProject', req.projectName);
    return Promise.resolve({ ok: true });
  },
  setAutonomous(req: SetAutonomousRequest): Promise<OkResponse> {
    record('setAutonomous', req);
    return Promise.resolve({ ok: true });
  },
  deleteSession(req: DeleteSessionRequest): Promise<OkResponse> {
    record('deleteSession', req);
    return Promise.resolve({ ok: true });
  },
  on(
    eventName: KshanaEventName | '*',
    cb: (event: KshanaEvent) => void,
  ): () => void {
    const slot: ListenerSlot = { eventName, cb, active: true };
    state.listeners.push(slot);
    return () => {
      slot.active = false;
    };
  },
};

// ── Minimal fake window.electron ─────────────────────────────────────
//
// We only stub the surface that the embedded chat path actually
// touches when running under TestApp. WorkspaceContext / LandingScreen
// flows are bypassed by TestApp, so most of the tree is a no-op.

function noop(): void {}
function noopAsync(): Promise<void> {
  return Promise.resolve();
}
function emptyTree() {
  return Promise.resolve({
    name: 'fake-project',
    path: state.project.directory ?? '/tmp/fake-project.kshana',
    type: 'directory' as const,
    children: [],
  });
}

const fakeElectron = {
  ipcRenderer: {
    sendMessage: noop,
    on: () => () => {},
    once: noop,
  },
  backend: {
    start: () => Promise.resolve({ status: 'idle' }),
    restart: () => Promise.resolve({ status: 'idle' }),
    stop: () => Promise.resolve({ status: 'idle' }),
    getState: () => Promise.resolve({ status: 'idle' }),
    getConnectionInfo: () => Promise.resolve({}),
    onStateChange: () => () => {},
  },
  settings: {
    get: () => Promise.resolve({}),
    update: () => Promise.resolve({}),
    onChange: () => () => {},
  },
  project: {
    selectDirectory: () => Promise.resolve(state.project.directory),
    selectVideoFile: () => Promise.resolve(null),
    selectAudioFile: () => Promise.resolve(null),
    getAudioDuration: () => Promise.resolve(0),
    getAudioWaveform: () => Promise.resolve({ peaks: [], duration: 0 }),
    generateWordCaptions: () => Promise.resolve({ success: false }),
    readTree: emptyTree,
    readFile: () => Promise.resolve(null),
    readFileGuarded: () => Promise.resolve(''),
    readFileBufferGuarded: () => Promise.resolve(''),
    checkFileExists: () => Promise.resolve(true),
    listDirectory: () => Promise.resolve([]),
    statPath: () =>
      Promise.resolve({ isFile: false, isDirectory: true, size: 0 }),
    readAllFiles: () => Promise.resolve([]),
    readProjectSnapshot: () =>
      Promise.resolve({ files: {}, directories: [], projectRoot: '' }),
    mkdir: noopAsync,
    readFileBase64: () => Promise.resolve(null),
    writeFile: noopAsync,
    writeFileBinary: noopAsync,
    createFile: () => Promise.resolve(null),
    createFolder: () => Promise.resolve(null),
    rename: (p: string) => Promise.resolve(p),
    delete: noopAsync,
    move: (p: string) => Promise.resolve(p),
    copy: (p: string) => Promise.resolve(p),
    copyFileExact: noopAsync,
    revealInFinder: noopAsync,
    watchDirectory: noopAsync,
    watchManifest: noopAsync,
    watchImagePlacements: noopAsync,
    watchInfographicPlacements: noopAsync,
    refreshAssets: () => Promise.resolve({ success: true }),
    unwatchDirectory: noopAsync,
    getRecent: () => Promise.resolve([]),
    addRecent: noopAsync,
    removeRecent: noopAsync,
    renameProject: (p: string) => Promise.resolve(p),
    deleteProject: noopAsync,
    getResourcesPath: () => Promise.resolve(''),
    saveVideoFile: () => Promise.resolve(null),
    exportChatJson: () => Promise.resolve({ ok: true }),
    composeTimelineVideo: () => Promise.resolve({ success: false }),
    exportCapcut: () => Promise.resolve({ success: false }),
    onFileChange: () => () => {},
    onManifestWritten: () => () => {},
  },
  remotion: {
    renderInfographics: () => Promise.resolve({ jobId: 'fake' }),
    cancelJob: noopAsync,
    getJob: () => Promise.resolve(null),
    renderFromServerRequest: () => Promise.resolve({ success: false }),
    onProgress: () => () => {},
    onJobComplete: () => () => {},
  },
  logger: {
    init: noopAsync,
    logUserInput: noopAsync,
    logAgentText: noopAsync,
    logToolStart: noopAsync,
    logToolComplete: noopAsync,
    logQuestion: noopAsync,
    logStatusChange: noopAsync,
    logPhaseTransition: noopAsync,
    logTodoUpdate: noopAsync,
    logError: noopAsync,
    logSessionEnd: noopAsync,
    getLogPaths: () =>
      Promise.resolve({ uiLog: '', phaseLog: '', workflowLog: '' }),
  },
  updates: {
    getStatus: () =>
      Promise.resolve({ phase: 'idle', checkedAt: Date.now() }),
    checkNow: () =>
      Promise.resolve({ phase: 'not-available', checkedAt: Date.now() }),
    onStatusChange: () => () => {},
  },
  app: {
    getVersion: () => Promise.resolve('0.0.0-test'),
  },
};

// ── Test API ─────────────────────────────────────────────────────────

const testApi: KshanaTestApi = {
  loadScenario(scenario: Scenario): void {
    state.scenario = scenario;
    if (scenario.project) {
      state.project = {
        name: scenario.project.name,
        directory:
          scenario.project.directory ??
          `/tmp/${scenario.project.name}.kshana`,
      };
    }
  },
  loadScenarioByName(name: string): boolean {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const { getScenarioByName } = require('./scenarioCatalog');
    const s = getScenarioByName(name);
    if (!s) return false;
    testApi.loadScenario(s);
    return true;
  },
  listScenarios(): string[] {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const { listScenarioNames } = require('./scenarioCatalog');
    return listScenarioNames();
  },
  emit(eventName: KshanaEventName, data: unknown): void {
    emitEvent(eventName, data);
  },
  getCalls(channel?: string): RecordedCall[] {
    return channel
      ? state.calls.filter((c) => c.channel === channel)
      : state.calls.slice();
  },
  getProject() {
    return { ...state.project };
  },
  reset(): void {
    for (const t of state.timers) clearTimeout(t);
    state.timers.clear();
    state.scenario = { rules: [] };
    state.listeners = [];
    state.calls = [];
    state.project = { name: null, directory: null };
  },
};

// ── Install ──────────────────────────────────────────────────────────

declare global {
  interface Window {
    __kshanaTest?: KshanaTestApi;
  }
}

(window as unknown as Record<string, unknown>).kshana = fakeKshana;
(window as unknown as Record<string, unknown>).electron = fakeElectron;
window.__kshanaTest = testApi;

// Resolve scenario in priority order:
//   1. Playwright initScript pre-seed (`__pendingScenario`)
//   2. URL query param (`?scenario=NAME`) — for manual testing
//   3. Nothing — TestApp shows a picker
const pending = (window as unknown as { __pendingScenario?: Scenario })
  .__pendingScenario;
if (pending) {
  testApi.loadScenario(pending);
  // eslint-disable-next-line no-console
  console.log('[test-bridge] applied __pendingScenario');
} else {
  const params = new URLSearchParams(window.location.search);
  const scenarioName = params.get('scenario');
  if (scenarioName) {
    const ok = testApi.loadScenarioByName(scenarioName);
    // eslint-disable-next-line no-console
    console.log(
      `[test-bridge] ?scenario=${scenarioName} → ${ok ? 'loaded' : 'NOT FOUND'}`,
    );
  }
}

// eslint-disable-next-line no-console
console.log('[test-bridge] installed fake window.kshana + window.electron');
