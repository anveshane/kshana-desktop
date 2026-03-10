import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Download, Trash2 } from 'lucide-react';
import type { BackendState } from '../../../../shared/backendTypes';
import type { AppSettings } from '../../../../shared/settingsTypes';
import type {
  ChatExportPayload,
  ChatSnapshotUiState,
  PersistedChatMessage,
} from '../../../../shared/chatTypes';
import type {
  RemotionServerRenderRequest,
  RemotionServerRenderResult,
  RemotionServerRenderProgress,
} from '../../../../shared/remotionTypes';
import type {
  ChatMessage,
  ChatQuestionOption,
  ChatTodoItemMeta,
  ChatToolCallMeta,
} from '../../../types/chat';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useAgent } from '../../../contexts/AgentContext';
import {
  createChatSnapshot,
  loadChatSnapshot,
  saveChatSnapshot,
} from '../../../services/chatPersistence';
import QuestionPrompt from '../QuestionPrompt';
import TodoPrompt from '../TodoPrompt';
import MessageList from '../MessageList';
import ChatInput from '../ChatInput';
import StatusBar, { AgentStatus } from '../StatusBar';
import ProjectSetupPanel, {
  type SetupDurationOption,
  type SetupPanelMode,
  type SetupStep,
  type SetupTemplateOption,
} from '../ProjectSetupPanel';
import {
  failExecutingToolCalls,
  isCancelAckStatus,
} from './chatPanelStopUtils';
import {
  buildCompletedToolMeta,
  buildPhaseTransitionSummary,
  findActiveToolCall,
  normalizeQuestionPayload,
  summarizeTodoUpdate,
  withToolAlias,
  type ActiveToolCallEntry,
} from './chatPanelEventUtils';
import {
  applyDesktopRemotionQueryParams,
  extractIncomingFileOpPath,
  isAbsoluteWirePath,
} from './chatPanelPathProtocolUtils';
import { pathBasename } from '../../../utils/pathNormalizer';
import styles from './ChatPanel.module.scss';

// Message types that shouldn't create new messages if same type already exists
const DEDUPE_TYPES = ['progress', 'comfyui_progress', 'error'];
const backgroundGenerationEventDedupe = new Set<string>();

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const DEFAULT_WS_PATH = '/api/v1/ws/chat';
const SNAPSHOT_SAVE_DEBOUNCE_MS = 500;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const OUTBOUND_ACTION_QUEUE_CAP = 200;
const CONNECTION_BANNER_DEDUPE_MS = 5000;
const STOP_ACK_TIMEOUT_MS = 12000;
const SETTINGS_RECONNECT_DEBOUNCE_MS = 400;
const PROJECT_SETUP_FILE = 'project-setup.json';
const PROJECT_SETUP_STORAGE_KEY = 'kshana.pendingProjectSetup';
const DEFAULT_SETUP_TEMPLATE_ID = 'narrative';
const DEFAULT_SETUP_STYLE_ID = 'cinematic_realism';
const DEFAULT_SETUP_DURATION_SECONDS = 120;

interface LiveToolStreamState {
  toolCallId?: string;
  toolName?: string;
  agentName?: string;
  text: string;
}

interface ProjectSetupPersisted {
  version: 1;
  templateId: string;
  style: string;
  duration: number;
}

interface TemplateCatalogResponse {
  templates?: SetupTemplateOption[];
  durationPresets?: Record<string, SetupDurationOption[]>;
}

interface ConfigureProjectPayload {
  templateId: string;
  style: string;
  duration: number;
  projectDir: string;
  projectName?: string;
}

const FALLBACK_TEMPLATE_CATALOG: TemplateCatalogResponse = {
  templates: [
    {
      id: 'narrative',
      displayName: 'Narrative Story Video',
      description: 'Create a video from a story idea or complete narrative.',
      defaultStyle: DEFAULT_SETUP_STYLE_ID,
      styles: [
        {
          id: 'cinematic_realism',
          displayName: 'Cinematic Realism',
          description: 'Photorealistic cinematic style with dramatic lighting.',
        },
      ],
    },
  ],
  durationPresets: {
    narrative: [
      { label: '1 minute', seconds: 60 },
      { label: '2 minutes', seconds: 120 },
      { label: '3 minutes', seconds: 180 },
      { label: '5 minutes', seconds: 300 },
    ],
  },
};

const VALID_AGENT_STATUS: AgentStatus[] = [
  'idle',
  'thinking',
  'executing',
  'waiting',
  'completed',
  'error',
];

const makeId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const resolvePreferredDuration = (
  templateId: string,
  durationPresets: Record<string, SetupDurationOption[]>,
): number => {
  const presets = durationPresets[templateId] || [];
  const explicitDefault = presets.find(
    (candidate) => candidate.seconds === DEFAULT_SETUP_DURATION_SECONDS,
  );
  return (
    explicitDefault?.seconds ??
    presets[0]?.seconds ??
    DEFAULT_SETUP_DURATION_SECONDS
  );
};

const normalizeProjectDirectory = (value: string): string => {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
};

const getProjectNameFromDirectory = (value: string): string => {
  return (
    normalizeProjectDirectory(value).split('/').pop()?.replace(/\.kshana$/i, '') ||
    value
  );
};

const normalizeComparableChatText = (value: string): string => {
  return value.trim().replace(/\r\n/g, '\n');
};

const ORIGINAL_INPUT_FILE = 'original_input.md';

const normalizeHttpUrl = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const resolveComfyUIOverride = (settings: AppSettings | null): string | null => {
  const mode = settings?.comfyuiMode ?? 'inherit';
  if (mode !== 'custom') {
    return null;
  }
  return normalizeHttpUrl(settings?.comfyuiUrl);
};

const getComfyUISettingsKey = (settings: AppSettings | null): string => {
  const mode = settings?.comfyuiMode ?? 'inherit';
  const override =
    mode === 'custom' ? resolveComfyUIOverride(settings) ?? '__invalid__' : '__inherit__';
  return `${mode}:${override}`;
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);

  // New state for StatusBar
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentName, setAgentName] = useState('Kshana');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentPhase, setCurrentPhase] = useState<string | undefined>();
  const [phaseDisplayName, setPhaseDisplayName] = useState<
    string | undefined
  >();
  const [contextUsagePercentage, setContextUsagePercentage] = useState<
    number | undefined
  >(undefined);
  const [contextWasCompressed, setContextWasCompressed] = useState(false);
  const [sessionTimerStartedAt, setSessionTimerStartedAt] = useState<
    number | undefined
  >(undefined);
  const [sessionTimerCompletedAt, setSessionTimerCompletedAt] = useState<
    number | undefined
  >(undefined);
  const [liveToolStream, setLiveToolStream] =
    useState<LiveToolStreamState | null>(null);
  const [hasUserSentMessage, setHasUserSentMessage] = useState(false);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [isStopPending, setIsStopPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [setupPanelMode, setSetupPanelMode] = useState<SetupPanelMode>('hidden');
  const [setupStep, setSetupStep] = useState<SetupStep>('template');
  const [setupTemplates, setSetupTemplates] = useState<SetupTemplateOption[]>([]);
  const [setupDurationPresets, setSetupDurationPresets] = useState<
    Record<string, SetupDurationOption[]>
  >({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isLoadingSetupCatalog, setIsLoadingSetupCatalog] = useState(false);
  const [isConfiguringProjectSetup, setIsConfiguringProjectSetup] =
    useState(false);
  const [isProjectSetupConfigured, setIsProjectSetupConfigured] =
    useState(false);

  const { setConnectionStatus, projectDirectory, registerProjectSwitchGuard } =
    useWorkspace();
  const agentContext = useAgent();

  const wsRef = useRef<WebSocket | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const awaitingResponseRef = useRef(false);
  // Track active tool calls by UI key and attach backend toolCallIds when available.
  const activeToolCallsRef = useRef<Map<string, ActiveToolCallEntry>>(new Map());
  const toolCallSequenceRef = useRef<Map<string, number>>(new Map());
  // Track the last todo message ID for in-place updates
  const lastTodoMessageIdRef = useRef<string | null>(null);
  // Track the last question message ID to avoid duplicates
  const lastQuestionMessageIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const settingsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comfyUISettingsKeyRef = useRef<string>('');
  const appSettingsRef = useRef<AppSettings | null>(null);
  const pendingOutboundActionsRef = useRef<string[]>([]);
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const connectionBannerRef = useRef<{ key: string; at: number } | null>(null);
  const currentProjectDirectoryRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const agentStatusRef = useRef<AgentStatus>('idle');
  const agentNameRef = useRef('Kshana');
  const statusMessageRef = useRef('');
  const currentPhaseRef = useRef<string | undefined>(undefined);
  const phaseDisplayNameRef = useRef<string | undefined>(undefined);
  const contextUsagePercentageRef = useRef<number | undefined>(undefined);
  const contextWasCompressedRef = useRef(false);
  const sessionTimerStartedAtRef = useRef<number | undefined>(undefined);
  const sessionTimerCompletedAtRef = useRef<number | undefined>(undefined);
  const hasUserSentMessageRef = useRef(false);
  const liveToolStreamRef = useRef<LiveToolStreamState | null>(null);
  const isTaskRunningRef = useRef(false);
  const isStopPendingRef = useRef(false);
  const supportsProjectStateSyncRef = useRef(true);
  const stopRequestRef = useRef<{
    promise: Promise<boolean>;
    resolve: (success: boolean) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const isConfiguringProjectSetupRef = useRef(false);
  const sendClientActionRef = useRef<
    (message: Record<string, unknown>) => Promise<void>
  >(async () => {});

  const resolveAgentStatus = useCallback((value?: string): AgentStatus => {
    if (value && VALID_AGENT_STATUS.includes(value as AgentStatus)) {
      return value as AgentStatus;
    }
    return 'idle';
  }, []);

  const resetConversationRefs = useCallback(() => {
    lastAssistantIdRef.current = null;
    awaitingResponseRef.current = false;
    activeToolCallsRef.current.clear();
    toolCallSequenceRef.current.clear();
    lastTodoMessageIdRef.current = null;
    lastQuestionMessageIdRef.current = null;
    backgroundGenerationEventDedupe.clear();
    contextUsagePercentageRef.current = undefined;
    contextWasCompressedRef.current = false;
    sessionTimerStartedAtRef.current = undefined;
    sessionTimerCompletedAtRef.current = undefined;
    liveToolStreamRef.current = null;
    setLiveToolStream(null);
  }, []);
  const appendMessage = useCallback(
    (message: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<ChatMessage>) => {
      const id = message.id ?? makeId();
      const timestamp = message.timestamp ?? Date.now();
      const newMessage = { ...message, id, timestamp };
      setMessages((prev) => {
        const updated = [...prev, newMessage];
        return updated;
      });
      return id;
    },
    [],
  );

  const appendSystemMessage = useCallback(
    (content: string, type = 'status') => {
      // Dedupe progress messages - update last matching one within recent history
      if (DEDUPE_TYPES.includes(type)) {
        setMessages((prev) => {
          // Look back at the last 5 messages to find a match
          // This handles cases where a notification might interleave with progress updates
          const searchLimit = Math.min(prev.length, 5);
          const startIndex = prev.length - 1;

          for (let i = 0; i < searchLimit; i++) {
            const idx = startIndex - i;
            const msg = prev[idx];

            if (msg.role === 'system' && msg.type === type) {
              // Update existing message
              return prev.map((m, index) =>
                index === idx ? { ...m, content, timestamp: Date.now() } : m,
              );
            }
          }

          // Create new message if no match found
          const id = makeId();
          return [
            ...prev,
            { id, role: 'system', type, content, timestamp: Date.now() },
          ];
        });
        return;
      }
      appendMessage({
        role: 'system',
        type,
        content,
      });
    },
    [appendMessage],
  );

  const appendTimelineEvent = useCallback(
    (content: string, meta?: Record<string, unknown>) => {
      appendMessage({
        role: 'system',
        type: 'timeline_event',
        content,
        meta,
      });
    },
    [appendMessage],
  );

  useEffect(() => {
    messagesRef.current = messages;
    agentStatusRef.current = agentStatus;
    agentNameRef.current = agentName;
    statusMessageRef.current = statusMessage;
    currentPhaseRef.current = currentPhase;
    phaseDisplayNameRef.current = phaseDisplayName;
    contextUsagePercentageRef.current = contextUsagePercentage;
    contextWasCompressedRef.current = contextWasCompressed;
    sessionTimerStartedAtRef.current = sessionTimerStartedAt;
    sessionTimerCompletedAtRef.current = sessionTimerCompletedAt;
    hasUserSentMessageRef.current = hasUserSentMessage;
    liveToolStreamRef.current = liveToolStream;
    isTaskRunningRef.current = isTaskRunning;
    isStopPendingRef.current = isStopPending;
    sessionIdRef.current = sessionId;
  }, [
    messages,
    agentStatus,
    agentName,
    statusMessage,
    currentPhase,
    phaseDisplayName,
    contextUsagePercentage,
    contextWasCompressed,
    sessionTimerStartedAt,
    sessionTimerCompletedAt,
    hasUserSentMessage,
    liveToolStream,
    isTaskRunning,
    isStopPending,
    sessionId,
  ]);

  useEffect(() => {
    isConfiguringProjectSetupRef.current = isConfiguringProjectSetup;
  }, [isConfiguringProjectSetup]);

  const appendConnectionBanner = useCallback(
    (key: string, content: string) => {
      const now = Date.now();
      const lastBanner = connectionBannerRef.current;
      if (
        lastBanner &&
        lastBanner.key === key &&
        now - lastBanner.at < CONNECTION_BANNER_DEDUPE_MS
      ) {
        return;
      }
      connectionBannerRef.current = { key, at: now };
      appendSystemMessage(content, 'error');
    },
    [appendSystemMessage],
  );

  const fetchTemplateCatalog = useCallback(async (): Promise<TemplateCatalogResponse> => {
    const backendState = await window.electron.backend.getState();
    const baseUrl =
      backendState.serverUrl || `http://localhost:${backendState.port ?? 8001}`;
    const response = await fetch(`${baseUrl}/api/v1/templates`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Template request failed with status ${response.status}`);
    }

    const parsed = (await response.json()) as TemplateCatalogResponse;
    return {
      templates: parsed.templates || [],
      durationPresets: parsed.durationPresets || {},
    };
  }, []);

  const ensureTemplateCatalogLoaded = useCallback(async (): Promise<{
    templates: SetupTemplateOption[];
    durationPresets: Record<string, SetupDurationOption[]>;
  }> => {
    if (setupTemplates.length > 0 && Object.keys(setupDurationPresets).length > 0) {
      return {
        templates: setupTemplates,
        durationPresets: setupDurationPresets,
      };
    }

    setIsLoadingSetupCatalog(true);
    try {
      const catalog = await fetchTemplateCatalog();
      const templates =
        catalog.templates && catalog.templates.length > 0
          ? catalog.templates
          : FALLBACK_TEMPLATE_CATALOG.templates || [];
      const durationPresets =
        catalog.durationPresets && Object.keys(catalog.durationPresets).length > 0
          ? catalog.durationPresets
          : FALLBACK_TEMPLATE_CATALOG.durationPresets || {};

      setSetupTemplates(templates);
      setSetupDurationPresets(durationPresets);
      setSetupError(null);
      return { templates, durationPresets };
    } catch (error) {
      const templates = FALLBACK_TEMPLATE_CATALOG.templates || [];
      const durationPresets = FALLBACK_TEMPLATE_CATALOG.durationPresets || {};
      setSetupTemplates(templates);
      setSetupDurationPresets(durationPresets);
      setSetupError(
        `Could not load setup options from backend. Using defaults. ${
          error instanceof Error ? error.message : ''
        }`.trim(),
      );
      return { templates, durationPresets };
    } finally {
      setIsLoadingSetupCatalog(false);
    }
  }, [
    fetchTemplateCatalog,
    setupDurationPresets,
    setupTemplates,
  ]);

  const persistProjectSetup = useCallback(
    async (config: ConfigureProjectPayload): Promise<void> => {
      if (!projectDirectory) return;

      const payload: ProjectSetupPersisted = {
        version: 1,
        templateId: config.templateId,
        style: config.style,
        duration: config.duration,
      };

      try {
        await window.electron.project.writeFile(
          `${projectDirectory}/${PROJECT_SETUP_FILE}`,
          JSON.stringify(payload, null, 2),
        );
      } catch (error) {
        console.warn('[ChatPanel] Failed to persist project setup:', error);
      }
    },
    [projectDirectory],
  );

  const loadPersistedSetupForDirectory = useCallback(
    async (
      targetProjectDirectory: string,
    ): Promise<ProjectSetupPersisted | null> => {
      try {
        const content = await window.electron.project.readFile(
          `${targetProjectDirectory}/${PROJECT_SETUP_FILE}`,
        );
        if (!content) return null;
        const parsed = JSON.parse(content) as ProjectSetupPersisted;
        if (
          parsed &&
          parsed.version === 1 &&
          typeof parsed.templateId === 'string' &&
          typeof parsed.style === 'string' &&
          typeof parsed.duration === 'number'
        ) {
          return parsed;
        }
      } catch {
        // Ignore malformed or missing setup files.
      }
      return null;
    },
    [],
  );

  const configureProjectSetup = useCallback(
    async (config: ConfigureProjectPayload): Promise<void> => {
      if (!projectDirectory) return;

      const normalizedConfig: ConfigureProjectPayload = {
        ...config,
        projectName:
          config.projectName ?? getProjectNameFromDirectory(config.projectDir),
      };

      setSetupError(null);
      setIsConfiguringProjectSetup(true);
      setIsProjectSetupConfigured(false);
      try {
        await sendClientActionRef.current({
          type: 'configure_project',
          data: normalizedConfig,
        });
        await persistProjectSetup(normalizedConfig);
      } catch (error) {
        setSetupError(
          `Failed to configure project setup: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
        setIsConfiguringProjectSetup(false);
      }
    },
    [persistProjectSetup, projectDirectory],
  );

  const openSetupWizard = useCallback(async () => {
    await ensureTemplateCatalogLoaded();
    setSetupError(null);
    setSetupPanelMode('wizard');
    setSetupStep('template');
  }, [ensureTemplateCatalogLoaded]);

  const loadPersistedSetup = useCallback(async (): Promise<ProjectSetupPersisted | null> => {
    if (!projectDirectory) {
      return null;
    }
    return loadPersistedSetupForDirectory(projectDirectory);
  }, [loadPersistedSetupForDirectory, projectDirectory]);

  const deriveDefaultSetup = useCallback(
    (
      templates: SetupTemplateOption[],
      durationPresets: Record<string, SetupDurationOption[]>,
    ): ConfigureProjectPayload | null => {
      const template =
        templates.find((candidate) => candidate.id === DEFAULT_SETUP_TEMPLATE_ID) ||
        templates[0];
      if (!template) return null;

      const style =
        template.styles.find((candidate) => candidate.id === template.defaultStyle)
          ?.id ||
        template.styles.find((candidate) => candidate.id === DEFAULT_SETUP_STYLE_ID)
          ?.id ||
        template.styles[0]?.id ||
        DEFAULT_SETUP_STYLE_ID;

      const duration =
        resolvePreferredDuration(template.id, durationPresets);

      if (!projectDirectory) return null;

      return {
        templateId: template.id,
        style,
        duration,
        projectDir: projectDirectory,
        projectName: getProjectNameFromDirectory(projectDirectory),
      };
    },
    [projectDirectory],
  );

  const applySetupSelection = useCallback(
    (config: ConfigureProjectPayload) => {
      setSelectedTemplateId(config.templateId);
      setSelectedStyleId(config.style);
      setSelectedDuration(config.duration);
    },
    [],
  );

  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      const template =
        setupTemplates.find((candidate) => candidate.id === templateId) || null;
      if (!template || !projectDirectory) return;

      const style =
        template.styles.find((candidate) => candidate.id === template.defaultStyle)
          ?.id ||
        template.styles[0]?.id ||
        DEFAULT_SETUP_STYLE_ID;
      const duration =
        resolvePreferredDuration(templateId, setupDurationPresets);

      setSelectedTemplateId(templateId);
      setSelectedStyleId(style);
      setSelectedDuration(duration);
      setSetupStep('style');
    },
    [projectDirectory, setupDurationPresets, setupTemplates],
  );

  const handleSelectStyle = useCallback((styleId: string) => {
    setSelectedStyleId(styleId);
    setSetupStep('duration');
  }, []);

  const handleSelectDuration = useCallback(
    (duration: number) => {
      if (!projectDirectory || !selectedTemplateId || !selectedStyleId) {
        return;
      }

      const payload: ConfigureProjectPayload = {
        templateId: selectedTemplateId,
        style: selectedStyleId,
        duration,
        projectDir: projectDirectory,
        projectName: getProjectNameFromDirectory(projectDirectory),
      };

      setSelectedDuration(duration);
      setSetupPanelMode('wizard');
      setSetupStep('duration');
      void configureProjectSetup(payload);
    },
    [
      configureProjectSetup,
      projectDirectory,
      selectedStyleId,
      selectedTemplateId,
    ],
  );

  const handleSetupBack = useCallback(() => {
    if (setupStep === 'style') {
      setSetupStep('template');
      return;
    }
    if (setupStep === 'duration') {
      setSetupStep('style');
    }
  }, [setupStep]);

  const handleSetupEdit = useCallback(async () => {
    await openSetupWizard();
  }, [openSetupWizard]);

  const resolveStopRequest = useCallback(
    (success: boolean, errorMessage?: string): boolean => {
      const pending = stopRequestRef.current;
      if (!pending) {
        return false;
      }

      clearTimeout(pending.timeoutId);
      stopRequestRef.current = null;
      setIsStopPending(false);

      if (success) {
        setIsTaskRunning(false);
      } else {
        setIsTaskRunning(true);
        const message = errorMessage || 'Failed to stop task.';
        appendSystemMessage(message, 'error');
      }

      pending.resolve(success);
      return true;
    },
    [appendSystemMessage],
  );

  const failActiveToolCalls = useCallback((reason: string) => {
    const now = Date.now();
    const activeEntries = Array.from(activeToolCallsRef.current.values());
    const updated = failExecutingToolCalls(
      messagesRef.current,
      activeEntries,
      reason,
      now,
    );

    messagesRef.current = updated;
    setMessages(updated);
    activeToolCallsRef.current.clear();
    toolCallSequenceRef.current.clear();
    setIsStreaming(false);
    lastAssistantIdRef.current = null;
    liveToolStreamRef.current = null;
    setLiveToolStream(null);
  }, []);

  const updateLiveToolStream = useCallback(
    (params: {
      toolCallId?: string;
      toolName?: string;
      agentName?: string;
      content?: string;
      reset?: boolean;
    }) => {
      const nextAgentName = params.agentName || agentNameRef.current;
      setLiveToolStream((previous) => {
        const matchesPrevious =
          (params.toolCallId &&
            previous?.toolCallId &&
            previous.toolCallId === params.toolCallId) ||
          (!params.toolCallId &&
            previous?.toolName === params.toolName &&
            previous?.agentName === nextAgentName);

        const baseText =
          params.reset || !matchesPrevious ? '' : previous?.text || '';
        const nextText = `${baseText}${params.content || ''}`;

        if (!nextText.trim()) {
          return previous;
        }

        return {
          toolCallId: params.toolCallId || previous?.toolCallId,
          toolName: params.toolName || previous?.toolName,
          agentName: nextAgentName,
          text: nextText,
        };
      });
    },
    [],
  );

  const clearLiveToolStream = useCallback(
    (params?: {
      toolCallId?: string;
      toolName?: string;
      agentName?: string;
    }) => {
      if (!params?.toolCallId && !params?.toolName) {
        liveToolStreamRef.current = null;
        setLiveToolStream(null);
        return;
      }

      setLiveToolStream((previous) => {
        if (!previous) {
          return previous;
        }

        if (params.toolCallId && previous.toolCallId === params.toolCallId) {
          return null;
        }

        const agentMatches =
          !params.agentName || previous.agentName === params.agentName;
        if (
          !params.toolCallId &&
          params.toolName &&
          previous.toolName === params.toolName &&
          agentMatches
        ) {
          return null;
        }

        return previous;
      });
    },
    [],
  );

  const completeLiveToolStream = useCallback(
    (params?: {
      toolCallId?: string;
      toolName?: string;
      agentName?: string;
    }) => {
      const currentStream = liveToolStreamRef.current;
      if (!currentStream?.text.trim()) {
        return;
      }

      const agentMatches =
        !params?.agentName || currentStream.agentName === params.agentName;
      const toolCallMatches =
        !params?.toolCallId || currentStream.toolCallId === params.toolCallId;
      const toolNameMatches =
        !params?.toolName || currentStream.toolName === params.toolName;

      if (!agentMatches || !toolCallMatches || !toolNameMatches) {
        return;
      }

      const persistedContent = currentStream.text;
      const persistedAuthor = currentStream.agentName || agentNameRef.current;

      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (
          lastMessage?.role === 'assistant' &&
          lastMessage.author === persistedAuthor &&
          lastMessage.content === persistedContent
        ) {
          return prev;
        }

        return [
          ...prev,
          {
            id: makeId(),
            role: 'assistant',
            type: 'agent_text',
            content: persistedContent,
            timestamp: Date.now(),
            author: persistedAuthor,
          },
        ];
      });

      liveToolStreamRef.current = null;
      setLiveToolStream(null);
    },
    [],
  );

  const ensureActiveToolCallEntry = useCallback(
    (params: {
      toolCallId?: string;
      toolName?: string;
      agentName?: string;
    }): [string, ActiveToolCallEntry] | null => {
      if (!params.toolName) {
        return null;
      }

      const existing = findActiveToolCall(activeToolCallsRef.current.entries(), {
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        agentName: params.agentName,
      });
      if (existing) {
        return existing;
      }

      const now = Date.now();
      const sequence =
        (toolCallSequenceRef.current.get(params.toolName) ?? 0) + 1;
      toolCallSequenceRef.current.set(params.toolName, sequence);
      const fallbackKey = `${params.toolName}-${sequence}`;
      const key = params.toolCallId || fallbackKey;
      const messageId = appendMessage({
        role: 'system',
        type: 'tool_call',
        content: '',
        author: params.agentName,
        meta: {
          toolCallId: params.toolCallId || key,
          toolName: params.toolName,
          args: {},
          startedArgs: {},
          status: 'executing',
          result: undefined,
          duration: undefined,
        },
      });

      const entry: ActiveToolCallEntry = {
        messageId,
        startTime: now,
        toolName: params.toolName,
        startedArgs: {},
        agentName: params.agentName,
        knownToolCallIds: params.toolCallId ? [params.toolCallId] : [],
        isProvisional: true,
      };
      activeToolCallsRef.current.set(key, entry);
      return [key, entry];
    },
    [appendMessage],
  );

  const markRunInterrupted = useCallback(
    (
      reason: string,
      options?: {
        status?: AgentStatus;
        statusMessage?: string;
      },
    ): boolean => {
      const hasExecutingToolCard = messagesRef.current.some((message) => {
        const meta = message.meta as ChatToolCallMeta | undefined;
        return message.type === 'tool_call' && meta?.status === 'executing';
      });
      const hasActiveRunUi =
        isTaskRunningRef.current ||
        isStopPendingRef.current ||
        isStreaming ||
        activeToolCallsRef.current.size > 0 ||
        hasExecutingToolCard;

      if (!hasActiveRunUi) {
        return false;
      }

      if (isStopPendingRef.current) {
        resolveStopRequest(false, reason);
      } else {
        setIsStopPending(false);
        setIsTaskRunning(false);
      }

      awaitingResponseRef.current = false;
      setAgentStatus(options?.status ?? 'error');
      setStatusMessage(options?.statusMessage ?? reason);
      clearLiveToolStream();
      failActiveToolCalls(reason);
      return true;
    },
    [clearLiveToolStream, failActiveToolCalls, isStreaming, resolveStopRequest],
  );

  const getRendererErrorMessage = useCallback(
    (error: unknown, fallback: string): string => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        const message = (error as { message: string }).message.trim();
        if (message) {
          return message;
        }
      }
      return fallback;
    },
    [],
  );
  const buildSnapshotUiState = useCallback((): ChatSnapshotUiState => {
    return {
      agentStatus: agentStatusRef.current,
      agentName: agentNameRef.current,
      statusMessage: statusMessageRef.current,
      currentPhase: currentPhaseRef.current,
      phaseDisplayName: phaseDisplayNameRef.current,
      contextUsagePercentage: contextUsagePercentageRef.current,
      contextWasCompressed: contextWasCompressedRef.current,
      sessionTimerStartedAt: sessionTimerStartedAtRef.current,
      sessionTimerCompletedAt: sessionTimerCompletedAtRef.current,
      hasUserSentMessage: hasUserSentMessageRef.current,
      isTaskRunning: isTaskRunningRef.current,
    };
  }, []);

  const persistSnapshot = useCallback(
    async (targetProjectDirectory: string): Promise<void> => {
      const currentProjectDirectory = currentProjectDirectoryRef.current;
      if (!currentProjectDirectory) {
        return;
      }

      if (
        normalizeProjectDirectory(targetProjectDirectory) !==
        normalizeProjectDirectory(currentProjectDirectory)
      ) {
        // Skip stale snapshot writes scheduled before project root switched.
        return;
      }

      const snapshot = createChatSnapshot({
        projectDirectory: targetProjectDirectory,
        sessionId: sessionIdRef.current,
        messages: messagesRef.current,
        uiState: buildSnapshotUiState(),
      });
      await saveChatSnapshot(snapshot);
    },
    [buildSnapshotUiState],
  );

  const scheduleSnapshotSave = useCallback(
    (targetProjectDirectory: string | null | undefined) => {
      if (!targetProjectDirectory) {
        return;
      }
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
      }
      snapshotSaveTimeoutRef.current = setTimeout(() => {
        snapshotSaveTimeoutRef.current = null;
        void persistSnapshot(targetProjectDirectory).catch((error) => {
          console.error('[ChatPanel] Failed to persist chat snapshot:', error);
        });
      }, SNAPSHOT_SAVE_DEBOUNCE_MS);
    },
    [persistSnapshot],
  );

  const hasQueuedOutboundActionType = useCallback((type: string): boolean => {
    return pendingOutboundActionsRef.current.some((payload) => {
      try {
        const parsed = JSON.parse(payload) as { type?: unknown };
        return parsed.type === type;
      } catch {
        return false;
      }
    });
  }, []);

  const syncProjectState = useCallback(
    async (
      socket?: WebSocket,
      targetProjectDirectory?: string | null,
    ): Promise<void> => {
      const activeSocket = socket ?? wsRef.current;
      if (
        !activeSocket ||
        activeSocket.readyState !== WebSocket.OPEN ||
        !targetProjectDirectory ||
        !supportsProjectStateSyncRef.current
      ) {
        return;
      }

      try {
        const snapshot =
          await window.electron.project.readProjectSnapshot(
            targetProjectDirectory,
          );
        activeSocket.send(
          JSON.stringify({
            type: 'project_state_sync',
            data: snapshot,
          }),
        );
      } catch (error) {
        console.warn('[ChatPanel] Failed to sync project state:', error);
      }
    },
    [],
  );

  const syncConfiguredProject = useCallback(
    async (
      socket?: WebSocket,
      targetProjectDirectory?: string | null,
    ): Promise<void> => {
      const activeSocket = socket ?? wsRef.current;
      if (
        !activeSocket ||
        activeSocket.readyState !== WebSocket.OPEN ||
        !targetProjectDirectory
      ) {
        return;
      }

      const persistedSetup =
        await loadPersistedSetupForDirectory(targetProjectDirectory);
      if (!persistedSetup) {
        return;
      }

      activeSocket.send(
        JSON.stringify({
          type: 'configure_project',
          data: {
            templateId: persistedSetup.templateId,
            style: persistedSetup.style,
            duration: persistedSetup.duration,
            projectDir: targetProjectDirectory,
            projectName: getProjectNameFromDirectory(targetProjectDirectory),
          },
        }),
      );
    },
    [loadPersistedSetupForDirectory],
  );

  const flushSnapshotSave = useCallback(
    (targetProjectDirectory: string | null | undefined) => {
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
        snapshotSaveTimeoutRef.current = null;
      }
      if (!targetProjectDirectory) {
        return;
      }
      void persistSnapshot(targetProjectDirectory).catch((error) => {
        console.error('[ChatPanel] Failed to flush chat snapshot:', error);
      });
    },
    [persistSnapshot],
  );

  const persistOriginalInputIfNeeded = useCallback(
    async (
      content: string,
      optionsToIgnore: string[] = [],
    ): Promise<void> => {
      if (!projectDirectory) {
        return;
      }

      const normalizedContent = normalizeComparableChatText(content);
      if (!normalizedContent) {
        return;
      }

      if (
        optionsToIgnore.some(
          (option) =>
            normalizeComparableChatText(option) === normalizedContent,
        )
      ) {
        return;
      }

      const inputPath = `${projectDirectory}/${ORIGINAL_INPUT_FILE}`;
      try {
        const existingContent =
          await window.electron.project.readFile(inputPath);
        if (existingContent && normalizeComparableChatText(existingContent)) {
          return;
        }

        await window.electron.project.writeFile(inputPath, content.trim());
      } catch (error) {
        console.warn('[ChatPanel] Failed to persist original input:', error);
      }
    },
    [projectDirectory],
  );

  const restoreSnapshot = useCallback(
    async (targetProjectDirectory: string) => {
      const pendingStop = stopRequestRef.current;
      if (pendingStop) {
        clearTimeout(pendingStop.timeoutId);
        stopRequestRef.current = null;
        pendingStop.resolve(false);
      }

      const snapshot = await loadChatSnapshot(targetProjectDirectory);
      resetConversationRefs();
      if (!snapshot) {
        setMessages([]);
        setSessionId(null);
        setAgentStatus('idle');
        setAgentName('Kshana');
        setStatusMessage('Ready');
        setCurrentPhase(undefined);
        setPhaseDisplayName(undefined);
        setContextUsagePercentage(undefined);
        setContextWasCompressed(false);
        setSessionTimerStartedAt(undefined);
        setSessionTimerCompletedAt(undefined);
        setHasUserSentMessage(false);
        setIsTaskRunning(false);
        setIsStopPending(false);
        return;
      }

      setMessages(
        (snapshot.messages as ChatMessage[]).filter(
          (msg) => !(msg.type === 'greeting' && msg.role === 'system'),
        ),
      );

      const firstUserMessage = snapshot.messages.find(
        (message) =>
          message.role === 'user' &&
          message.type === 'message' &&
          normalizeComparableChatText(message.content),
      );
      if (firstUserMessage) {
        void persistOriginalInputIfNeeded(firstUserMessage.content);
      }

      setSessionId(snapshot.sessionId);
      setAgentStatus(resolveAgentStatus(snapshot.uiState.agentStatus));
      setAgentName(snapshot.uiState.agentName || 'Kshana');
      setStatusMessage(snapshot.uiState.statusMessage || 'Ready');
      setCurrentPhase(snapshot.uiState.currentPhase);
      setPhaseDisplayName(snapshot.uiState.phaseDisplayName);
      setContextUsagePercentage(snapshot.uiState.contextUsagePercentage);
      setContextWasCompressed(Boolean(snapshot.uiState.contextWasCompressed));
      setSessionTimerStartedAt(snapshot.uiState.sessionTimerStartedAt);
      setSessionTimerCompletedAt(snapshot.uiState.sessionTimerCompletedAt);
      setHasUserSentMessage(Boolean(snapshot.uiState.hasUserSentMessage));
      setIsTaskRunning(Boolean(snapshot.uiState.isTaskRunning));
      setIsStopPending(false);
    },
    [persistOriginalInputIfNeeded, resetConversationRefs, resolveAgentStatus],
  );

  const clearChat = useCallback(() => {
    const pendingStop = stopRequestRef.current;
    if (pendingStop) {
      clearTimeout(pendingStop.timeoutId);
      stopRequestRef.current = null;
      pendingStop.resolve(false);
    }

    setMessages([]);
    setSessionId(null);
    resetConversationRefs();
    setAgentStatus('idle');
    setAgentName('Kshana');
    setStatusMessage('Ready');
    setCurrentPhase(undefined);
    setPhaseDisplayName(undefined);
    setContextUsagePercentage(undefined);
    setContextWasCompressed(false);
    setSessionTimerStartedAt(undefined);
    setSessionTimerCompletedAt(undefined);
    setHasUserSentMessage(false);
    setIsTaskRunning(false);
    setIsStopPending(false);
    scheduleSnapshotSave(projectDirectory);
  }, [projectDirectory, resetConversationRefs, scheduleSnapshotSave]);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const appendAssistantChunk = useCallback(
    (content: string, type: string, author?: string) => {
      // Always process chunks - create message even with empty content to show thinking state
      const trimmedContent = content || '';

      // Streaming types that should accumulate in the same message
      const streamingTypes = [
        'text_chunk',
        'agent_text',
        'coordinator_response',
        'stream_chunk',
      ];
      const isStreamingType = streamingTypes.includes(type);
      // Normalize stream_chunk to agent_text for comparison
      const normalizedType = type === 'stream_chunk' ? 'agent_text' : type;

      setMessages((prev) => {
        // If we're streaming and have an active message, ALWAYS append to it
        // This matches CLI behavior where chunks accumulate smoothly
        if (isStreamingType && lastAssistantIdRef.current) {
          const existingMessage = prev.find(
            (msg) => msg.id === lastAssistantIdRef.current,
          );

          if (
            existingMessage &&
            existingMessage.role === 'assistant' &&
            existingMessage.type !== 'tool_call' && // Don't append to tool calls
            (existingMessage.type === 'agent_text' ||
              existingMessage.type === 'stream_chunk' ||
              existingMessage.type === normalizedType)
          ) {
            setIsStreaming(true);
            // Append content to existing message (smooth accumulation like CLI)
            return prev.map((message) => {
              if (message.id === lastAssistantIdRef.current) {
                const newContent = `${message.content || ''}${trimmedContent}`;
                return {
                  ...message,
                  content: newContent,
                  type: normalizedType, // Update to normalized type
                  author: message.author || author || 'Kshana',
                  timestamp: Date.now(), // Update timestamp to show it's active
                };
              }
              return message;
            });
          }
        }

        // Check for duplicate content only for substantial chunks (not during active streaming)
        // This prevents duplicate messages when stream restarts
        // Note: We check if we're currently streaming by seeing if lastAssistantIdRef points to a message
        const currentlyStreaming =
          lastAssistantIdRef.current &&
          prev.some(
            (msg) =>
              msg.id === lastAssistantIdRef.current && msg.role === 'assistant',
          );

        if (trimmedContent.length > 50 && !currentlyStreaming) {
          const contentHash = trimmedContent.substring(0, 100);
          for (
            let i = prev.length - 1;
            i >= Math.max(0, prev.length - 3);
            i--
          ) {
            const msg = prev[i];
            if (
              msg.role === 'assistant' &&
              msg.content &&
              msg.type === normalizedType &&
              msg.content.substring(0, 100) === contentHash
            ) {
              // Found duplicate - reuse this message and start streaming into it
              lastAssistantIdRef.current = msg.id;
              setIsStreaming(isStreamingType);
              return prev.map((m) =>
                m.id === msg.id
                  ? {
                    ...m,
                    content: m.content + trimmedContent,
                    timestamp: Date.now(),
                  }
                  : m,
              );
            }
          }
        }

        // Check if we already have an empty assistant message we can reuse
        // But NOT if it's a tool call - tool calls should be separate
        const lastMessage = prev[prev.length - 1];
        if (
          lastMessage &&
          lastMessage.role === 'assistant' &&
          lastMessage.type !== 'tool_call' &&
          lastMessage.type !== 'agent_question' && // Don't reuse questions
          (lastMessage.type === normalizedType ||
            (isStreamingType &&
              (lastMessage.type === 'agent_text' ||
                lastMessage.type === 'stream_chunk'))) &&
          (!lastMessage.content || lastMessage.content.trim().length === 0)
        ) {
          // Reuse the empty message
          lastAssistantIdRef.current = lastMessage.id;
          setIsStreaming(isStreamingType);
          return prev.map((msg) =>
            msg.id === lastMessage.id
              ? {
                ...msg,
                content: trimmedContent,
                type: normalizedType,
                author: msg.author || author || 'Kshana',
                timestamp: Date.now(),
              }
              : msg,
          );
        }

        // Create new message for new stream
        const id = makeId();
        lastAssistantIdRef.current = id;
        setIsStreaming(isStreamingType);
        return [
          ...prev,
          {
            id,
            role: 'assistant',
            type: normalizedType,
            content: trimmedContent,
            timestamp: Date.now(),
            author: author || 'Kshana',
          },
        ];
      });
    },
    [],
  );

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'client_disconnect');
      } catch {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptRef.current = 0;
  }, []);

  const flushPendingOutboundActions = useCallback((socket?: WebSocket) => {
    const targetSocket = socket ?? wsRef.current;
    if (!targetSocket || targetSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (pendingOutboundActionsRef.current.length > 0) {
      const payload = pendingOutboundActionsRef.current.shift();
      if (!payload) break;
      targetSocket.send(payload);
    }
  }, []);

  const queueOutboundAction = useCallback((payload: string) => {
    pendingOutboundActionsRef.current.push(payload);
    if (pendingOutboundActionsRef.current.length > OUTBOUND_ACTION_QUEUE_CAP) {
      pendingOutboundActionsRef.current = pendingOutboundActionsRef.current.slice(
        pendingOutboundActionsRef.current.length - OUTBOUND_ACTION_QUEUE_CAP,
      );
    }
  }, []);

  // Debounce status updates to prevent flicker
  const statusUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const debouncedSetStatus = useCallback(
    (status: AgentStatus, message: string) => {
      if (statusUpdateTimeoutRef.current) {
        clearTimeout(statusUpdateTimeoutRef.current);
      }
      statusUpdateTimeoutRef.current = setTimeout(() => {
        setAgentStatus(status);
        setStatusMessage(message);
      }, 100); // 100ms debounce
    },
    [],
  );

  /**
   * Handle server payload from kshana-ink WebSocket.
   * kshana-ink messages have the format: { type, sessionId, timestamp, data: {...} }
   */
  const handleServerPayload = useCallback(
    (payload: Record<string, unknown>) => {
      // Extract data from kshana-ink message format
      const data = (payload.data as Record<string, unknown>) ?? payload;
      const messageType = payload.type as string;
      const payloadSessionId =
        typeof payload.sessionId === 'string' ? payload.sessionId : null;

      if (payloadSessionId && payloadSessionId !== sessionIdRef.current) {
        setSessionId(payloadSessionId);
      }

      // Extract optional agent name logic (if provided by backend)
      // Use functional update to avoid dependency on agentName
      setAgentName((prevAgentName) => {
        const currentAgentName =
          (data.agentName as string) ??
          (payload.agentName as string) ??
          prevAgentName;
        return currentAgentName;
      });

      const requestId =
        typeof payload.requestId === 'string' ? payload.requestId : '';
      const opId =
        typeof data.opId === 'string' && data.opId.trim()
          ? data.opId
          : (requestId || undefined);

      const sendRequestResponse = (
        responseType: string,
        responseRequestId: string,
        responseData: Record<string, unknown>,
        errorMessage?: string,
      ) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !responseRequestId) {
          return;
        }
        ws.send(
          JSON.stringify(
            errorMessage
              ? {
                type: responseType,
                requestId: responseRequestId,
                error: errorMessage,
                data: responseData,
              }
              : {
                type: responseType,
                requestId: responseRequestId,
                data: responseData,
              },
          ),
        );
      };

      const getWirePath = (pathValue: unknown): string | null => {
        if (typeof pathValue !== 'string') return null;
        const trimmed = pathValue.trim();
        if (!trimmed) return null;
        if (isAbsoluteWirePath(trimmed)) return null;
        return trimmed;
      };

      const formatFileOpError = (error: unknown, fallback: string): string =>
        getRendererErrorMessage(error, fallback);

      const isNoEntryError = (error: unknown, errorMessage: string): boolean => {
        if (errorMessage.includes('[ENOENT]')) {
          return true;
        }
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: string }).code === 'ENOENT'
        ) {
          return true;
        }
        return false;
      };

      switch (messageType) {
        case 'status': {
          // kshana-ink status: { status: 'connected' | 'ready' | 'busy' | 'completed' | 'error', message?: string, agentName?: string }
          const statusMsg =
            (data.message as string) ??
            (data.status as string) ??
            'Status update';
          const status = data.status as string;
          const agentNameFromStatus = (data.agentName as string) ?? agentName;
          const isCancelAck = isCancelAckStatus(status, statusMsg);

          // Update agent name if it changed
          if (agentNameFromStatus !== agentName) {
            setAgentName(agentNameFromStatus);
          }

          // Map status to agent status with debouncing
          switch (status) {
            case 'connected':
              setAgentStatus('idle');
              setStatusMessage('Connected');
              window.electron.logger.logStatusChange(
                'idle',
                agentNameFromStatus,
                'Connected',
              );
              break;
            case 'busy':
              // Update status only - don't create placeholder messages
              // Real agent text will come through stream_chunk messages
              debouncedSetStatus('thinking', statusMsg || 'Thinking...');
              setIsTaskRunning(true);
              window.electron.logger.logStatusChange(
                'thinking',
                agentNameFromStatus,
                statusMsg || 'Thinking...',
              );
              break;
            case 'ready':
              debouncedSetStatus(
                'waiting',
                statusMsg || 'Waiting for input...',
              );
              setIsTaskRunning(false);
              if (isConfiguringProjectSetupRef.current) {
                setIsConfiguringProjectSetup(false);
                setIsProjectSetupConfigured(true);
                setSetupPanelMode('hidden');
              }
              if (isCancelAck) {
                resolveStopRequest(true);
              }
              window.electron.logger.logStatusChange(
                'waiting',
                agentNameFromStatus,
                statusMsg || 'Waiting for input...',
              );
              break;
            case 'completed':
              debouncedSetStatus('completed', statusMsg || 'Task completed');
              setIsTaskRunning(false);
              if (isStopPendingRef.current) {
                resolveStopRequest(true);
              }
              window.electron.logger.logStatusChange(
                'completed',
                agentNameFromStatus,
                statusMsg || 'Task completed',
              );
              break;
            case 'error':
              debouncedSetStatus('error', statusMsg);
              setIsTaskRunning(false);
              if (isConfiguringProjectSetupRef.current) {
                setIsConfiguringProjectSetup(false);
                setSetupError(statusMsg || 'Failed to configure project setup.');
              }
              if (isStopPendingRef.current) {
                resolveStopRequest(false, statusMsg || 'Failed to stop task.');
              }
              window.electron.logger.logStatusChange(
                'error',
                agentNameFromStatus,
                statusMsg,
              );
              break;
            default:
              setStatusMessage(statusMsg);
              window.electron.logger.logStatusChange(
                status,
                agentNameFromStatus,
                statusMsg,
              );
          }
          break;
        }
        case 'progress': {
          // kshana-ink progress: { iteration, maxIterations, status }
          const { iteration, maxIterations, status: progressStatus } = data;
          const percent = maxIterations
            ? Math.round(
              ((iteration as number) / (maxIterations as number)) * 100,
            )
            : 0;
          const details = [
            progressStatus ? `${progressStatus}` : null,
            percent ? `Progress: ${percent}%` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          setStatusMessage(details || 'Processing...');
          break;
        }
        case 'stream_chunk': {
          // kshana-ink stream_chunk: { content, done }
          const content = (data.content as string) ?? '';
          const done = (data.done as boolean) ?? false;
          const streamAgentName =
            typeof data.agentName === 'string' ? data.agentName : agentName;
          const streamToolCallId =
            typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
          const streamToolName =
            typeof data.toolName === 'string' ? data.toolName : undefined;

          if (streamToolCallId || streamToolName) {
            if (content || data.reset) {
              updateLiveToolStream({
                toolCallId: streamToolCallId,
                toolName: streamToolName,
                agentName: streamAgentName,
                content,
                reset: Boolean(data.reset),
              });
            }
            let matchedToolCall = findActiveToolCall(
              activeToolCallsRef.current.entries(),
              {
                toolCallId: streamToolCallId,
                toolName: streamToolName,
                agentName: streamAgentName,
              },
            );

            if (!matchedToolCall && streamToolName) {
              matchedToolCall = ensureActiveToolCallEntry({
                toolCallId: streamToolCallId,
                toolName: streamToolName,
                agentName: streamAgentName,
              });
            }

            if (matchedToolCall) {
              const [entryKey, entry] = matchedToolCall;
              activeToolCallsRef.current.set(
                entryKey,
                withToolAlias(entry, streamToolCallId),
              );
              setMessages((prev) =>
                prev.map((message) => {
                  if (message.id !== entry.messageId) {
                    return message;
                  }

                  const existingMeta = (message.meta || {}) as ChatToolCallMeta;
                  const previousStreamingContent =
                    typeof existingMeta.streamingContent === 'string'
                      ? existingMeta.streamingContent
                      : '';
                  const nextStreamingContent = data.reset
                    ? content
                    : `${previousStreamingContent}${content}`;

                  return {
                    ...message,
                    timestamp: Date.now(),
                    meta: {
                      ...existingMeta,
                      toolCallId:
                        streamToolCallId ||
                        existingMeta.toolCallId ||
                        entryKey,
                      streamingContent: nextStreamingContent,
                      status: 'executing',
                    },
                  };
                }),
              );
              break;
            }
          }

          // Skip empty chunks
          if (!content && !done) {
            break;
          }

          // FILTER: Skip repetitive meta-commentary messages that make it look like a loop
          // But show warnings for blocked messages to help with debugging
          const skipPatterns = [
            /^I apologize for/i,
            /^I understand\.? I will now/i,
            /^I am (still )?stuck/i,
            /^I need to (create|transition)/i,
            /^Please manually/i,
          ];

          const trimmedContent = content.trim();
          const isBlockedMessage = /^I am blocked/i.test(trimmedContent);
          const shouldSkip = skipPatterns.some((pattern) =>
            pattern.test(trimmedContent),
          );

          // Show warning for blocked messages instead of hiding them completely
          if (isBlockedMessage && !done) {
            console.warn(
              '[ChatPanel] Agent loop detected - blocked message:',
              trimmedContent.substring(0, 100),
            );
            // Show a condensed warning message to user
            appendSystemMessage(
              '⚠️ Agent retrying phase transition (circuit breaker will activate if needed)...',
              'status',
            );
            // Still skip the actual blocked message text to avoid clutter
            break;
          }

          if (shouldSkip && !done) {
            console.log(
              '[ChatPanel] Skipping redundant thinking message:',
              trimmedContent.substring(0, 50),
            );
            break;
          }

          setAgentStatus('thinking'); // Agent is generating reasoning/thinking text

          // Create/update message with stream chunk content (thinking happens before tool calls)
          appendAssistantChunk(content, 'stream_chunk', agentName);

          if (done) {
            setIsStreaming(false);
            // Clear the ref so next stream starts fresh
            lastAssistantIdRef.current = null;
          }
          break;
        }
        case 'stream_end': {
          lastAssistantIdRef.current = null;
          setIsStreaming(false);
          setAgentStatus('idle');
          break;
        }
        case 'tool_call': {
          // Server sends tool_call events: { toolName, toolCallId (empty), arguments, status, result?, error? }
          // Status: 'started' (from onToolCall) or 'completed'/'error' (from onToolResult)
          const toolName = (data.toolName as string) ?? 'tool';
          const toolStatus = (data.status as string) ?? 'started';
          const eventAgentName =
            typeof data.agentName === 'string' ? data.agentName : agentName;
          const args = (data.arguments as Record<string, unknown>) ?? {};
          const { result } = data;
          const { error } = data;
          const toolCallId = (data.toolCallId as string) || '';

          if (toolStatus === 'completed' || toolStatus === 'error') {
            debouncedSetStatus('thinking', 'Processing...');

            // Clean thinking/reasoning content from result if it exists
            let cleanedResult = result ?? error;
            const cleanThinkingTags = (text: string): string => {
              return text
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, '')
                .replace(/<think[\s\S]*?\/>/gi, '')
                .trim();
            };

            if (
              cleanedResult &&
              typeof cleanedResult === 'object' &&
              'content' in cleanedResult
            ) {
              const content = cleanedResult.content as string;
              const cleanedContent = cleanThinkingTags(content);
              cleanedResult = { ...cleanedResult, content: cleanedContent };
            } else if (typeof cleanedResult === 'string') {
              cleanedResult = cleanThinkingTags(cleanedResult);
            }

            const now = Date.now();
            let duration = (data.duration as number) ?? 0;
            const matchedToolCall = findActiveToolCall(
              activeToolCallsRef.current.entries(),
              {
                toolCallId,
                toolName,
                agentName: eventAgentName,
              },
            );
            const activeKey = matchedToolCall?.[0] ?? null;
            const activeEntry = matchedToolCall?.[1];
            if (!duration && activeEntry) {
              duration = Math.max(0, now - activeEntry.startTime);
            }

            // Log tool completion
            window.electron.logger.logToolComplete(
              toolName,
              cleanedResult,
              duration,
              toolStatus === 'error',
            );

            const startedArgs = activeEntry?.startedArgs || {};
            const completedToolMeta = buildCompletedToolMeta({
              toolName,
              toolCallId: toolCallId || activeKey || undefined,
              args,
              startedArgs,
              result: cleanedResult,
              duration,
              status: toolStatus === 'error' ? 'error' : 'completed',
            });

            // Update existing tool call message (if it exists), otherwise append
            lastAssistantIdRef.current = null;
            setIsStreaming(false);

            if (activeEntry) {
              activeToolCallsRef.current.delete(activeKey as string);
              completeLiveToolStream({
                toolCallId: toolCallId || activeKey || undefined,
                toolName,
                agentName: eventAgentName,
              });
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === activeEntry.messageId
                    ? {
                      ...msg,
                      meta: {
                        ...(msg.meta || {}),
                        ...completedToolMeta,
                      },
                      timestamp: Date.now(),
                    }
                    : msg,
                ),
              );
            } else {
              completeLiveToolStream({
                toolCallId: completedToolMeta.toolCallId,
                toolName,
                agentName: eventAgentName,
              });
              appendMessage({
                role: 'system',
                type: 'tool_call',
                content: '',
                author: eventAgentName,
                meta: {
                  ...completedToolMeta,
                  toolCallId: completedToolMeta.toolCallId || makeId(),
                },
              });
            }

            // Check for phase transitions in update_project results
            if (
              toolName === 'update_project' &&
              cleanedResult &&
              typeof cleanedResult === 'object'
            ) {
              const resultObj = cleanedResult as Record<string, unknown>;

              // Update current phase from any update_project result
              if (resultObj.current_phase) {
                setCurrentPhase(resultObj.current_phase as string);
              }
              if (resultObj.new_phase_name) {
                setPhaseDisplayName(resultObj.new_phase_name as string);
              }

              if (resultObj._phaseTransition) {
                const transition = resultObj._phaseTransition as {
                  fromPhase: string;
                  toPhase: string;
                  displayName?: string;
                };
                window.electron.logger.logPhaseTransition(
                  transition.fromPhase,
                  transition.toPhase,
                  true,
                  `Transitioned to ${transition.displayName || transition.toPhase}`,
                );
                // Update phase state
                setCurrentPhase(transition.toPhase);
                setPhaseDisplayName(
                  transition.displayName || transition.toPhase,
                );
              }
            }
          } else if (toolStatus === 'started') {
            const now = Date.now();
            debouncedSetStatus('executing', `Running ${toolName}...`);
            window.electron.logger.logToolStart(toolName, args);
            window.electron.logger.logStatusChange(
              'executing',
              eventAgentName,
              `Running ${toolName}...`,
            );
            const matchedToolCall = findActiveToolCall(
              activeToolCallsRef.current.entries(),
              {
                toolCallId,
                toolName,
                agentName: eventAgentName,
              },
            );

            if (matchedToolCall) {
              const [existingKey, existingEntry] = matchedToolCall;
              const nextKey = toolCallId || existingKey;
              const hydratedEntry = withToolAlias(
                {
                  ...existingEntry,
                  toolName,
                  startedArgs: args,
                  agentName: eventAgentName,
                  isProvisional: false,
                },
                toolCallId,
              );

              if (existingKey !== nextKey) {
                activeToolCallsRef.current.delete(existingKey);
              }
              activeToolCallsRef.current.set(nextKey, hydratedEntry);

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== existingEntry.messageId) {
                    return msg;
                  }

                  const existingMeta = (msg.meta || {}) as ChatToolCallMeta;
                  return {
                    ...msg,
                    author: eventAgentName,
                    timestamp: Date.now(),
                    meta: {
                      ...existingMeta,
                      toolCallId:
                        toolCallId ||
                        (existingMeta.toolCallId as string | undefined) ||
                        nextKey,
                      toolName,
                      args,
                      startedArgs: args,
                      status: 'executing',
                    },
                  };
                }),
              );
            } else {
              const sequence =
                (toolCallSequenceRef.current.get(toolName) ?? 0) + 1;
              toolCallSequenceRef.current.set(toolName, sequence);
              const fallbackKey = `${toolName}-${sequence}`;
              const key = toolCallId || fallbackKey;

              const messageId = appendMessage({
                role: 'system',
                type: 'tool_call',
                content: '',
                author: eventAgentName,
                meta: {
                  toolCallId: toolCallId || key,
                  toolName,
                  args,
                  startedArgs: args,
                  status: 'executing',
                  result: undefined,
                  duration: undefined,
                },
              });

              activeToolCallsRef.current.set(key, {
                messageId,
                startTime: now,
                toolName,
                startedArgs: args,
                agentName: eventAgentName,
                knownToolCallIds: toolCallId ? [toolCallId] : [],
                isProvisional: false,
              });
            }
          }
          break;
        }
        case 'agent_response': {
          // kshana-ink agent_response: { output, status }
          const output = (data.output as string) ?? '';
          const responseStatus = data.status as string;
          if (output) {
            const normalizedOutput = normalizeComparableChatText(output);

            // Log agent response
            window.electron.logger.logAgentText(output, agentName);

            // Replace last assistant message if it exists (could be agent_text or stream_chunk)
            // to avoid duplicates
            setMessages((prev) => {
              // Find the last assistant message that's not a question or tool call
              let lastAssistantIdx = -1;
              for (let i = prev.length - 1; i >= 0; i--) {
                const msg = prev[i];
                if (
                  msg.role === 'assistant' &&
                  msg.type !== 'agent_question' &&
                  msg.type !== 'tool_call' &&
                  (msg.type === 'agent_text' ||
                    msg.type === 'stream_chunk' ||
                    msg.type === 'agent_response')
                ) {
                  lastAssistantIdx = i;
                  break;
                }
              }

              if (
                lastAssistantIdx >= 0 &&
                lastAssistantIdRef.current === prev[lastAssistantIdx].id
              ) {
                // Update existing message
                return prev.map((msg, idx) =>
                  idx === lastAssistantIdx
                    ? {
                      ...msg,
                      type: 'agent_response',
                      content: output,
                      timestamp: Date.now(),
                      author: agentName,
                    }
                    : msg,
                );
              }

              const mirrorsExistingQuestion = prev.some((msg) => {
                if (msg.type !== 'agent_question') {
                  return false;
                }

                return (
                  normalizeComparableChatText(msg.content) === normalizedOutput
                );
              });
              if (mirrorsExistingQuestion) {
                return prev;
              }

              // Check if output already exists in messages to avoid duplicates
              const existingMessage = prev.find(
                (msg) =>
                  msg.role === 'assistant' &&
                  normalizeComparableChatText(msg.content) === normalizedOutput &&
                  msg.type === 'agent_response',
              );
              if (existingMessage) {
                // Already have this exact message, don't create duplicate
                return prev;
              }

              // Create new message only if we don't have a matching one
              const id = makeId();
              lastAssistantIdRef.current = id;
              return [
                ...prev,
                {
                  id,
                  role: 'assistant',
                  type: 'agent_response',
                  content: output,
                  timestamp: Date.now(),
                  author: agentName,
                },
              ];
            });
            lastAssistantIdRef.current = null;
            setIsStreaming(false);
          }

          if (responseStatus === 'completed') {
            setAgentStatus('completed');
            setStatusMessage('Completed');
            setIsTaskRunning(false);
            if (isStopPendingRef.current) {
              resolveStopRequest(true);
            }
            window.electron.logger.logStatusChange(
              'completed',
              agentName,
              'Completed',
            );
          } else if (responseStatus === 'cancelled') {
            setAgentStatus('waiting');
            setStatusMessage('Task cancelled');
            setIsTaskRunning(false);
            resolveStopRequest(true);
            window.electron.logger.logStatusChange(
              'waiting',
              agentName,
              'Task cancelled',
            );
          } else if (responseStatus === 'max_iterations') {
            setAgentStatus('error');
            setStatusMessage('Agent reached maximum iterations');
            setIsTaskRunning(false);
            if (isStopPendingRef.current) {
              resolveStopRequest(false, 'Agent reached maximum iterations.');
            }
            window.electron.logger.logStatusChange(
              'error',
              agentName,
              'Agent reached maximum iterations',
            );
            appendSystemMessage(
              'Agent reached maximum iterations before finishing. Try a narrower request or continue from current output.',
              'error',
            );
          } else if (responseStatus === 'error') {
            setAgentStatus('error');
            setStatusMessage('Error');
            setIsTaskRunning(false);
            if (isStopPendingRef.current) {
              resolveStopRequest(false, 'Failed to stop task.');
            }
            window.electron.logger.logStatusChange('error', agentName, 'Error');
            window.electron.logger.logError(
              'An error occurred while processing your request.',
            );
            appendSystemMessage(
              'An error occurred while processing your request.',
              'error',
            );
          }
          break;
        }
        case 'agent_question': {
          const normalizedQuestion = normalizeQuestionPayload(data);
          const {
            question,
            options,
            questionType,
            autoApproveTimeoutMs,
            defaultOption,
            isConfirmation,
          } = normalizedQuestion;

          if (question) {
            setAgentStatus('waiting');
            setStatusMessage('Waiting for your input');
            window.electron.logger.logStatusChange(
              'waiting',
              agentName,
              'Waiting for your input',
            );

            // Log question
            window.electron.logger.logQuestion(
              question,
              options,
              questionType === 'confirm' || isConfirmation,
              autoApproveTimeoutMs
                ? Math.ceil(autoApproveTimeoutMs / 1000)
                : undefined,
            );

            // Update existing question message if it exists to avoid duplicates
            setMessages((prev) => {
              if (lastQuestionMessageIdRef.current) {
                const existingQuestion = prev.find(
                  (msg) => msg.id === lastQuestionMessageIdRef.current,
                );
                if (
                  existingQuestion &&
                  existingQuestion.type === 'agent_question'
                ) {
                  // Update existing question
                  return prev.map((msg) =>
                    msg.id === lastQuestionMessageIdRef.current
                      ? {
                        ...msg,
                        content: question,
                        meta: {
                          options,
                          questionType,
                          isConfirmation,
                          autoApproveTimeoutMs,
                          defaultOption,
                        },
                        timestamp: Date.now(),
                      }
                      : msg,
                  );
                }
              }

              // Check if the same question already exists
              const duplicateQuestion = prev.find(
                (msg) =>
                  msg.type === 'agent_question' && msg.content === question,
              );
              if (duplicateQuestion) {
                lastQuestionMessageIdRef.current = duplicateQuestion.id;
                return prev;
              }

              // Create new question message
              const id = makeId();
              lastQuestionMessageIdRef.current = id;
              return [
                ...prev,
                {
                  id,
                  role: 'assistant',
                  type: 'agent_question',
                  content: question,
                  author: agentName,
                  timestamp: Date.now(),
                  meta: {
                    options,
                    questionType,
                    isConfirmation,
                    autoApproveTimeoutMs,
                    defaultOption,
                  },
                },
              ];
            });

            appendTimelineEvent(`Question: ${question}`);

            lastAssistantIdRef.current = null;
            setIsStreaming(false);
            awaitingResponseRef.current = true;
            setIsTaskRunning(false);
          }
          break;
        }
        case 'todo_update': {
          // kshana-ink todo_update: { todos }
          const todos = (data.todos as ChatTodoItemMeta[]) || [];
          if (todos?.length) {
            // Log todo update
            window.electron.logger.logTodoUpdate(
              todos.map((t) => ({
                content: t.content || t.task || t.id || 'Task',
                status: t.status || 'pending',
              })),
            );

            if (lastTodoMessageIdRef.current) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === lastTodoMessageIdRef.current
                    ? {
                      ...msg,
                      meta: {
                        ...(msg.meta || {}),
                        todos,
                        summary: summarizeTodoUpdate(todos),
                      },
                      timestamp: Date.now(),
                    }
                    : msg,
                ),
              );
            } else {
              const messageId = appendMessage({
                role: 'system',
                type: 'todo_update',
                content: '',
                meta: {
                  todos,
                  summary: summarizeTodoUpdate(todos),
                },
              });
              lastTodoMessageIdRef.current = messageId;
            }
            appendTimelineEvent(summarizeTodoUpdate(todos));
          }
          break;
        }
        case 'phase_transition': {
          const fromPhase =
            typeof data.fromPhase === 'string' ? data.fromPhase : undefined;
          const toPhase =
            typeof data.toPhase === 'string' ? data.toPhase : undefined;
          const displayName =
            typeof data.displayName === 'string'
              ? data.displayName
              : undefined;
          const description =
            typeof data.description === 'string'
              ? data.description
              : undefined;
          if (!toPhase) {
            break;
          }

          setCurrentPhase(toPhase);
          setPhaseDisplayName(displayName || toPhase);
          appendTimelineEvent(
            buildPhaseTransitionSummary({
              fromPhase,
              toPhase,
              displayName,
              description,
            }),
            {
              fromPhase,
              toPhase,
              displayName,
              description,
            },
          );
          window.electron.logger.logPhaseTransition(
            fromPhase || '',
            toPhase,
            true,
            description || displayName || toPhase,
          );
          break;
        }
        case 'context_usage': {
          const percentage =
            typeof data.percentage === 'number' ? data.percentage : undefined;
          if (percentage === undefined) {
            break;
          }
          setContextUsagePercentage(percentage);
          setContextWasCompressed(Boolean(data.wasCompressed));
          break;
        }
        case 'notification': {
          const level =
            data.level === 'warning' || data.level === 'error'
              ? (data.level as 'warning' | 'error')
              : 'info';
          const notificationMessage =
            typeof data.message === 'string' ? data.message : '';
          if (notificationMessage) {
            appendMessage({
              role: 'system',
              type: 'notification',
              content: notificationMessage,
              meta: { level },
            });
          }
          break;
        }
        case 'session_timer': {
          const startedAt =
            typeof data.productionStartedAt === 'number'
              ? data.productionStartedAt
              : undefined;
          const completedAt =
            typeof data.productionCompletedAt === 'number'
              ? data.productionCompletedAt
              : undefined;
          setSessionTimerStartedAt(startedAt);
          setSessionTimerCompletedAt(completedAt);
          break;
        }
        case 'background_generation': {
          const batchId = String(data.batchId ?? '');
          const kind = ((data.kind as 'image' | 'video' | undefined) ?? 'image');
          const batchStatus = (data.status as
            | 'queued'
            | 'running'
            | 'completed'
            | 'failed'
            | undefined) ?? 'running';
          const totalItems = Number(data.totalItems ?? 0);
          const completedItems = Number(data.completedItems ?? 0);
          const failedItems = Number(data.failedItems ?? 0);
          const kindLabel = kind === 'video' ? 'video' : 'image';

          if (batchStatus === 'queued' || batchStatus === 'running') {
            const progress =
              totalItems > 0 ? ` (${Math.min(completedItems, totalItems)}/${totalItems})` : '';
            setStatusMessage(`Background ${kindLabel} generation ${batchStatus}${progress}.`);
            break;
          }

          const dedupeKey = `${batchId}:${batchStatus}`;
          if (backgroundGenerationEventDedupe.has(dedupeKey)) {
            break;
          }
          backgroundGenerationEventDedupe.add(dedupeKey);

          if (batchStatus === 'completed') {
            appendSystemMessage(
              `Background ${kindLabel} generation finished (${completedItems}/${totalItems}).`,
              'status',
            );
          } else if (batchStatus === 'failed') {
            appendSystemMessage(
              `Background ${kindLabel} generation finished with failures (${completedItems}/${totalItems}, failed: ${failedItems}).`,
              'status',
            );
          }
          break;
        }
        case 'error': {
          const errorMsg = (data.message as string) ?? 'An error occurred';
          const errorCode = (data.code as string) ?? '';
          const isUnsupportedProjectStateSync =
            errorCode === 'unknown_message_type' &&
            /project_state_sync/i.test(errorMsg);
          const isTransientNetworkError =
            errorCode === 'transient_network_error' ||
            /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|connection reset|network error|fetch failed/i.test(
              errorMsg,
            );

          if (isUnsupportedProjectStateSync) {
            supportsProjectStateSyncRef.current = false;
            console.warn(
              '[ChatPanel] Backend does not support project_state_sync; disabling snapshot sync.',
            );
            break;
          }

          if (errorCode === 'cancel_failed' && isStopPendingRef.current) {
            resolveStopRequest(false, errorMsg);
            break;
          }

          if (isTransientNetworkError) {
            const retryMessage =
              `Transient network issue while contacting the model: ${errorMsg}. ` +
              'Please retry your last step.';
            appendSystemMessage(retryMessage, 'status');
            setAgentStatus('waiting');
            setStatusMessage('Connection issue. Ready to retry.');
            setIsTaskRunning(false);
            window.electron.logger.logError(
              errorMsg,
              data as Record<string, unknown>,
            );
            window.electron.logger.logStatusChange(
              'waiting',
              agentName,
              'Connection issue. Ready to retry.',
            );
            break;
          }
          appendSystemMessage(errorMsg, 'error');
          setAgentStatus('error');
          setStatusMessage(errorMsg);
          setIsTaskRunning(false);
          if (
            /session already has a running task/i.test(errorMsg) ||
            /task interrupted|backend unavailable|connection to backend lost/i.test(
              errorMsg,
            )
          ) {
            markRunInterrupted(errorMsg, {
              status: 'error',
              statusMessage: errorMsg,
            });
          }
          window.electron.logger.logError(
            errorMsg,
            data as Record<string, unknown>,
          );
          window.electron.logger.logStatusChange('error', agentName, errorMsg);
          break;
        }
        case 'remotion_render_request': {
          const request = data as Partial<RemotionServerRenderRequest>;
          const requestId =
            typeof request.requestId === 'string'
              ? request.requestId.trim()
              : '';
          if (!requestId) {
            console.warn(
              '[ChatPanel] remotion_render_request missing requestId',
              payload,
            );
            break;
          }

          const sendResult = (result: RemotionServerRenderResult) => {
            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
              return;
            }
            ws.send(
              JSON.stringify({
                type: 'remotion_render_result',
                data: result,
              }),
            );
          };

          if (!projectDirectory) {
            sendResult({
              requestId,
              status: 'failed',
              error:
                'No active project selected on desktop for Remotion rendering.',
            });
            break;
          }

          const requestedProjectDir =
            typeof request.projectDir === 'string'
              ? request.projectDir.trim()
              : '';
          const normalizeProjectPath = (value: string) =>
            value.replace(/\\/g, '/').replace(/\/+$/, '');
          if (
            requestedProjectDir &&
            normalizeProjectPath(requestedProjectDir) !==
            normalizeProjectPath(projectDirectory)
          ) {
            sendResult({
              requestId,
              status: 'failed',
              error:
                'Requested project directory does not match the active desktop project.',
            });
            break;
          }

          const requestPayload: RemotionServerRenderRequest = {
            requestId,
            projectDir: projectDirectory,
            placements: Array.isArray(request.placements)
              ? request.placements
              : [],
            components: Array.isArray(request.components)
              ? request.components
              : [],
            indexContent:
              typeof request.indexContent === 'string'
                ? request.indexContent
                : '',
            componentSource:
              request.componentSource &&
                typeof request.componentSource === 'object'
                ? request.componentSource
                : undefined,
          };

          void window.electron.remotion
            .renderFromServerRequest(
              projectDirectory,
              requestPayload,
              (progress: RemotionServerRenderProgress) => {
                const ws = wsRef.current;
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                  return;
                }
                ws.send(
                  JSON.stringify({
                    type: 'remotion_render_progress',
                    data: progress,
                  }),
                );
              },
            )
            .then((result) => {
              sendResult(result);
              if (result.status !== 'completed') {
                appendSystemMessage(
                  `Desktop Remotion render failed: ${result.error || 'Unknown error'}`,
                  'error',
                );
              }
            })
            .catch((error: unknown) => {
              const errorMessage = getRendererErrorMessage(
                error,
                'Desktop Remotion render failed.',
              );
              sendResult({
                requestId,
                status: 'failed',
                error: errorMessage,
              });
              appendSystemMessage(
                `Desktop Remotion render failed: ${errorMessage}`,
                'error',
              );
            });
          break;
        }
        case 'file_read_request': {
          const requestedPath = getWirePath(data.path);
          if (!requestedPath) {
            const reason = 'Invalid or unsafe file path for file_read_request.';
            sendRequestResponse('file_read_response', requestId, {}, reason);
            appendSystemMessage(`⚠️ ${reason}`, 'error');
            break;
          }
          void window.electron.project
            .readFileGuarded(requestedPath, {
              opId,
              source: 'agent_ws',
            })
            .then((content) => {
              sendRequestResponse(
                'file_read_response',
                requestId,
                { content },
              );
            })
            .catch((error) => {
              const reason = formatFileOpError(
                error,
                'Failed to read file from desktop workspace.',
              );
              sendRequestResponse('file_read_response', requestId, {}, reason);
              appendSystemMessage(
                `⚠️ Failed to read file: ${pathBasename(requestedPath)}. ${reason}`,
                'error',
              );
            });
          break;
        }
        case 'file_list_request': {
          const requestedPath = getWirePath(data.path);
          if (!requestedPath) {
            const reason = 'Invalid or unsafe directory path for file_list_request.';
            sendRequestResponse('file_list_response', requestId, {}, reason);
            appendSystemMessage(`⚠️ ${reason}`, 'error');
            break;
          }
          void window.electron.project
            .listDirectory(requestedPath, {
              opId,
              source: 'agent_ws',
            })
            .then((entries) => {
              sendRequestResponse('file_list_response', requestId, { entries });
            })
            .catch((error) => {
              const reason = formatFileOpError(
                error,
                'Failed to list directory from desktop workspace.',
              );
              sendRequestResponse('file_list_response', requestId, {}, reason);
              appendSystemMessage(
                `⚠️ Failed to list directory: ${pathBasename(requestedPath)}. ${reason}`,
                'error',
              );
            });
          break;
        }
        case 'file_exists_request': {
          const requestedPath = getWirePath(data.path);
          if (!requestedPath) {
            sendRequestResponse('file_exists_response', requestId, { exists: false });
            break;
          }
          void window.electron.project
            .statPath(requestedPath, {
              opId,
              source: 'agent_ws',
            })
            .then(() => {
              sendRequestResponse(
                'file_exists_response',
                requestId,
                { exists: true },
              );
            })
            .catch((error) => {
              const reason = formatFileOpError(
                error,
                'Failed to check file existence.',
              );
              if (isNoEntryError(error, reason)) {
                sendRequestResponse(
                  'file_exists_response',
                  requestId,
                  { exists: false },
                );
                return;
              }
              sendRequestResponse('file_exists_response', requestId, {}, reason);
              appendSystemMessage(
                `⚠️ Failed to check path existence: ${pathBasename(requestedPath)}. ${reason}`,
                'error',
              );
            });
          break;
        }
        case 'file_stat_request': {
          const requestedPath = getWirePath(data.path);
          if (!requestedPath) {
            const reason = 'Invalid or unsafe path for file_stat_request.';
            sendRequestResponse('file_stat_response', requestId, {}, reason);
            appendSystemMessage(`⚠️ ${reason}`, 'error');
            break;
          }
          void window.electron.project
            .statPath(requestedPath, {
              opId,
              source: 'agent_ws',
            })
            .then((stat) => {
              sendRequestResponse('file_stat_response', requestId, stat);
            })
            .catch((error) => {
              const reason = formatFileOpError(
                error,
                'Failed to stat path in desktop workspace.',
              );
              sendRequestResponse('file_stat_response', requestId, {}, reason);
              appendSystemMessage(
                `⚠️ Failed to stat path: ${pathBasename(requestedPath)}. ${reason}`,
                'error',
              );
            });
          break;
        }
        case 'file_read_buffer_request': {
          const requestedPath = getWirePath(data.path);
          if (!requestedPath) {
            const reason =
              'Invalid or unsafe file path for file_read_buffer_request.';
            sendRequestResponse('file_buffer_response', requestId, {}, reason);
            appendSystemMessage(`⚠️ ${reason}`, 'error');
            break;
          }
          void window.electron.project
            .readFileBufferGuarded(requestedPath, {
              opId,
              source: 'agent_ws',
            })
            .then((base64Data) => {
              sendRequestResponse(
                'file_buffer_response',
                requestId,
                { data: base64Data },
              );
            })
            .catch((error) => {
              const reason = formatFileOpError(
                error,
                'Failed to read binary file from desktop workspace.',
              );
              sendRequestResponse('file_buffer_response', requestId, {}, reason);
              appendSystemMessage(
                `⚠️ Failed to read binary file: ${pathBasename(requestedPath)}. ${reason}`,
                'error',
              );
            });
          break;
        }
        case 'file_write': {
          const filePath = extractIncomingFileOpPath(data);
          const fileWriteRequestId = requestId;
          const fileContent = data.content as string;
          if (!filePath) {
            appendSystemMessage(
              '⚠️ Failed to save file: missing file path in server payload.',
              'error',
            );
            if (fileWriteRequestId) {
              sendRequestResponse(
                'file_write_ack',
                fileWriteRequestId,
                { success: false },
                'Missing file path in file write payload.',
              );
            }
            break;
          }
          if (isAbsoluteWirePath(filePath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute file path from server: ${filePath}`,
              'error',
            );
            if (fileWriteRequestId) {
              sendRequestResponse(
                'file_write_ack',
                fileWriteRequestId,
                { success: false },
                `Unsafe absolute file path rejected: ${filePath}`,
              );
            }
            break;
          }
          if (filePath && fileContent !== undefined) {
            window.electron.project.writeFile(filePath, fileContent, {
              opId,
              source: 'agent_ws',
            }).then(() => {
              if (fileWriteRequestId) {
                sendRequestResponse('file_write_ack', fileWriteRequestId, {
                  success: true,
                });
              }
            }).catch((err) => {
              console.error('[ChatPanel] file_write failed:', filePath, err);
              const reason = formatFileOpError(
                err,
                'Unknown file write error.',
              );
              if (fileWriteRequestId) {
                sendRequestResponse(
                  'file_write_ack',
                  fileWriteRequestId,
                  { success: false },
                  reason,
                );
              }
              appendSystemMessage(
                `⚠️ Failed to save file: ${pathBasename(filePath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_write_command': {
          const commandPayload = {
            ...data,
            relativePath: data.path,
            content: data.content,
          };
          const syntheticPayload = {
            ...payload,
            type: 'file_write',
            data: commandPayload,
          };
          handleServerPayload(syntheticPayload as Record<string, unknown>);
          break;
        }
        case 'file_write_binary': {
          const binPath = extractIncomingFileOpPath(data);
          const fileWriteRequestId = requestId;
          const binContent = data.content as string;
          if (!binPath) {
            appendSystemMessage(
              '⚠️ Failed to save binary file: missing file path in server payload.',
              'error',
            );
            if (fileWriteRequestId) {
              sendRequestResponse(
                'file_write_ack',
                fileWriteRequestId,
                { success: false },
                'Missing file path in binary write payload.',
              );
            }
            break;
          }
          if (isAbsoluteWirePath(binPath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute file path from server: ${binPath}`,
              'error',
            );
            if (fileWriteRequestId) {
              sendRequestResponse(
                'file_write_ack',
                fileWriteRequestId,
                { success: false },
                `Unsafe absolute file path rejected: ${binPath}`,
              );
            }
            break;
          }
          if (binPath && binContent) {
            window.electron.project.writeFileBinary(binPath, binContent, {
              opId,
              source: 'agent_ws',
            }).then(() => {
              if (fileWriteRequestId) {
                sendRequestResponse('file_write_ack', fileWriteRequestId, {
                  success: true,
                });
              }
            }).catch((err) => {
              console.error('[ChatPanel] file_write_binary failed:', binPath, err);
              const reason = formatFileOpError(
                err,
                'Unknown binary write error.',
              );
              if (fileWriteRequestId) {
                sendRequestResponse(
                  'file_write_ack',
                  fileWriteRequestId,
                  { success: false },
                  reason,
                );
              }
              appendSystemMessage(
                `⚠️ Failed to save binary file: ${pathBasename(binPath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_write_buffer_command': {
          const commandPayload = {
            ...data,
            relativePath: data.path,
            content: data.data,
          };
          const syntheticPayload = {
            ...payload,
            type: 'file_write_binary',
            data: commandPayload,
          };
          handleServerPayload(syntheticPayload as Record<string, unknown>);
          break;
        }
        case 'file_mkdir': {
          const mkdirPath = extractIncomingFileOpPath(data);
          const mkdirRequestId = requestId;
          if (!mkdirPath) {
            appendSystemMessage(
              '⚠️ Failed to create directory: missing path in server payload.',
              'error',
            );
            if (mkdirRequestId) {
              sendRequestResponse(
                'file_write_ack',
                mkdirRequestId,
                { success: false },
                'Missing directory path in mkdir payload.',
              );
            }
            break;
          }
          if (isAbsoluteWirePath(mkdirPath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute directory path from server: ${mkdirPath}`,
              'error',
            );
            if (mkdirRequestId) {
              sendRequestResponse(
                'file_write_ack',
                mkdirRequestId,
                { success: false },
                `Unsafe absolute directory path rejected: ${mkdirPath}`,
              );
            }
            break;
          }
          if (mkdirPath) {
            window.electron.project.mkdir(mkdirPath, {
              opId,
              source: 'agent_ws',
            }).then(() => {
              if (mkdirRequestId) {
                sendRequestResponse('file_write_ack', mkdirRequestId, {
                  success: true,
                });
              }
            }).catch((err) => {
              console.error('[ChatPanel] file_mkdir failed:', mkdirPath, err);
              const reason = formatFileOpError(
                err,
                'Unknown mkdir error.',
              );
              if (mkdirRequestId) {
                sendRequestResponse(
                  'file_write_ack',
                  mkdirRequestId,
                  { success: false },
                  reason,
                );
              }
              appendSystemMessage(
                `⚠️ Failed to create directory: ${pathBasename(mkdirPath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_mkdir_command': {
          const commandPayload = {
            ...data,
            relativePath: data.path,
          };
          const syntheticPayload = {
            ...payload,
            type: 'file_mkdir',
            data: commandPayload,
          };
          handleServerPayload(syntheticPayload as Record<string, unknown>);
          break;
        }
        case 'file_rm': {
          const rmPath = extractIncomingFileOpPath(data);
          const rmRequestId = requestId;
          if (!rmPath) {
            appendSystemMessage(
              '⚠️ Failed to delete path: missing path in server payload.',
              'error',
            );
            if (rmRequestId) {
              sendRequestResponse(
                'file_write_ack',
                rmRequestId,
                { success: false },
                'Missing path in delete payload.',
              );
            }
            break;
          }
          if (isAbsoluteWirePath(rmPath)) {
            appendSystemMessage(
              `⚠️ Rejected unsafe absolute delete path from server: ${rmPath}`,
              'error',
            );
            if (rmRequestId) {
              sendRequestResponse(
                'file_write_ack',
                rmRequestId,
                { success: false },
                `Unsafe absolute delete path rejected: ${rmPath}`,
              );
            }
            break;
          }
          if (rmPath) {
            window.electron.project.delete(rmPath, {
              opId,
              source: 'agent_ws',
            }).then(() => {
              if (rmRequestId) {
                sendRequestResponse('file_write_ack', rmRequestId, {
                  success: true,
                });
              }
            }).catch((err) => {
              console.error('[ChatPanel] file_rm failed:', rmPath, err);
              const reason = formatFileOpError(
                err,
                'Unknown delete error.',
              );
              if (rmRequestId) {
                sendRequestResponse(
                  'file_write_ack',
                  rmRequestId,
                  { success: false },
                  reason,
                );
              }
              appendSystemMessage(
                `⚠️ Failed to delete path: ${pathBasename(rmPath)}. ${reason}`,
                'error',
              );
            });
          }
          break;
        }
        case 'file_delete_command':
        case 'file_delete_dir_command': {
          const commandPayload = {
            ...data,
            relativePath: data.path,
          };
          const syntheticPayload = {
            ...payload,
            type: 'file_rm',
            data: commandPayload,
          };
          handleServerPayload(syntheticPayload as Record<string, unknown>);
          break;
        }
        case 'file_copy_command': {
          const sourcePath = getWirePath(data.src);
          const destinationPath = getWirePath(data.dest);
          if (!sourcePath || !destinationPath) {
            const reason = 'Invalid source or destination path for file copy.';
            sendRequestResponse('file_write_ack', requestId, { success: false }, reason);
            appendSystemMessage(`⚠️ ${reason}`, 'error');
            break;
          }
          void window.electron.project
            .copyFileExact(sourcePath, destinationPath, {
              opId,
              source: 'agent_ws',
            })
            .then(() => {
              sendRequestResponse('file_write_ack', requestId, { success: true });
            })
            .catch((error) => {
              const reason = formatFileOpError(
                error,
                'Failed to copy file in desktop workspace.',
              );
              sendRequestResponse(
                'file_write_ack',
                requestId,
                { success: false },
                reason,
              );
              appendSystemMessage(
                `⚠️ Failed to copy file: ${pathBasename(sourcePath)}. ${reason}`,
                'error',
              );
            });
          break;
        }
        case 'batch_write_command': {
          const operations = Array.isArray(data.operations)
            ? data.operations
            : [];
          if (operations.length === 0) {
            sendRequestResponse('file_write_ack', requestId, { success: true });
            break;
          }
          void (async () => {
            try {
              for (const operation of operations) {
                const op = operation as Record<string, unknown>;
                const opPath = getWirePath(op.path);
                const opContent =
                  typeof op.content === 'string' ? op.content : '';
                if (!opPath) {
                  throw new Error('Invalid path in batch_write_command operation.');
                }
                // eslint-disable-next-line no-await-in-loop
                await window.electron.project.writeFile(opPath, opContent, {
                  opId,
                  source: 'agent_ws',
                });
              }
              sendRequestResponse('file_write_ack', requestId, { success: true });
            } catch (error) {
              const reason = formatFileOpError(
                error,
                'Failed to apply batch file writes in desktop workspace.',
              );
              sendRequestResponse(
                'file_write_ack',
                requestId,
                { success: false },
                reason,
              );
              appendSystemMessage(`⚠️ ${reason}`, 'error');
            }
          })();
          break;
        }
        default:
          console.warn(
            '[ChatPanel] Unhandled message type:',
            messageType,
            payload,
          );
          break;
      }
    },
    [
      agentName,
      appendAssistantChunk,
      appendMessage,
      appendSystemMessage,
      appendTimelineEvent,
      debouncedSetStatus,
      getRendererErrorMessage,
      projectDirectory,
      resolveStopRequest,
    ],
  );

  const connectWebSocket = useCallback(async (): Promise<WebSocket> => {
    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    // Prevent concurrent connection attempts
    if (connectingRef.current) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve(wsRef.current);
          } else if (!connectingRef.current) {
            clearInterval(checkInterval);
            reject(new Error('Connection attempt failed'));
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Connection timeout'));
        }, 10000);
      });
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    connectingRef.current = true;
    setConnectionState('connecting');

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        return;
      }

      const attempt = reconnectAttemptRef.current;
      const baseDelay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** attempt,
        RECONNECT_MAX_DELAY_MS,
      );
      const jitter = Math.floor(Math.random() * Math.max(250, baseDelay * 0.3));
      const delay = baseDelay + jitter;
      reconnectAttemptRef.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket().catch((error) => {
          appendConnectionBanner(
            'reconnect_failed',
            `Reconnection failed: ${(error as Error).message}. Retrying...`,
          );
          scheduleReconnect();
        });
      }, delay);
    };

    try {
      const currentState = await window.electron.backend.getState();
      if (currentState.status !== 'ready') {
        const errorMsg = currentState.message
          ? `Backend not ready: ${currentState.message}`
          : `Backend not ready (status: ${currentState.status})`;
        throw new Error(errorMsg);
      }

      const baseUrl = currentState.serverUrl || `http://localhost:${currentState.port ?? 8001}`;
      const wsBase = baseUrl.replace(/^http/, 'ws');
      const url = new URL(DEFAULT_WS_PATH, wsBase);
      url.searchParams.set('channel', 'chat');
      url.searchParams.set('mode', 'remote');
      const getDesktopVersion = window.electron.app?.getVersion;
      const desktopVersion = getDesktopVersion
        ? await getDesktopVersion().catch(() => null)
        : null;
      applyDesktopRemotionQueryParams(url, desktopVersion);
      const effectiveSettings =
        appSettingsRef.current ?? (await window.electron.settings.get().catch(() => null));
      if (!appSettingsRef.current && effectiveSettings) {
        appSettingsRef.current = effectiveSettings;
      }
      const comfyUIUrl = resolveComfyUIOverride(effectiveSettings);
      if (comfyUIUrl) {
        url.searchParams.set('comfyui_url', comfyUIUrl);
      }

      console.log('[ChatPanel] Connecting to WebSocket:', {
        projectDirectory,
        hasProjectDir: !!projectDirectory,
        serverUrl: baseUrl,
        desktopVersion,
        comfyuiMode: effectiveSettings?.comfyuiMode ?? 'inherit',
        hasComfyUIUrl: !!comfyUIUrl,
      });

      if (projectDirectory) {
        url.searchParams.set('project_dir', projectDirectory);
        console.log(
          '[ChatPanel] Set project_dir query param:',
          projectDirectory,
        );
      } else {
        console.warn(
          '[ChatPanel] No projectDirectory available - files may not be saved correctly',
        );
      }

      if (sessionIdRef.current) {
        url.searchParams.set('sessionId', sessionIdRef.current);
      }

      console.log('[ChatPanel] Final WebSocket URL:', url.toString());

      return await new Promise((resolve, reject) => {
        const socket = new WebSocket(url.toString());
        wsRef.current = socket;

        const timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            connectingRef.current = false;
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        socket.onopen = () => {
          clearTimeout(timeout);
          connectingRef.current = false;
          setConnectionState('connected');
          reconnectAttemptRef.current = 0;
          connectionBannerRef.current = null;
          // Clear connection error messages on successful connect
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                !(
                  msg.role === 'system' &&
                  msg.type === 'error' &&
                  (msg.content?.includes('Connection to backend lost') ||
                    msg.content?.includes('WebSocket connection error') ||
                    msg.content?.includes('Reconnection failed'))
                ),
            ),
          );
          const hasQueuedConfigureProject =
            hasQueuedOutboundActionType('configure_project');
          void (async () => {
            await syncProjectState(socket, projectDirectory);
            flushPendingOutboundActions(socket);
            if (!hasQueuedConfigureProject) {
              await syncConfiguredProject(socket, projectDirectory);
            }
            resolve(socket);
          })().catch((error) => {
            console.warn(
              '[ChatPanel] WebSocket post-connect sync failed:',
              error,
            );
            flushPendingOutboundActions(socket);
            resolve(socket);
          });
        };

        socket.onerror = (error) => {
          clearTimeout(timeout);
          connectingRef.current = false;
          console.error('[ChatPanel] WebSocket error:', error);
          markRunInterrupted('Connection to backend lost. Task interrupted.', {
            status: 'error',
            statusMessage: 'Connection lost. Task interrupted.',
          });
          appendConnectionBanner(
            'ws_connection_error',
            'WebSocket connection error. Check if backend is running.',
          );
          reject(new Error('WebSocket connection error'));
        };

        socket.onclose = (event) => {
          clearTimeout(timeout);
          connectingRef.current = false;
          setConnectionState('disconnected');
          if (wsRef.current === socket) {
            wsRef.current = null;
          }
          if (event.code !== 1000) {
            markRunInterrupted(
              'Connection to backend lost. Current task was interrupted.',
              {
                status: 'error',
                statusMessage: 'Connection lost. Task interrupted.',
              },
            );
            appendConnectionBanner(
              'ws_disconnected',
              'Connection to backend lost. Attempting to reconnect...',
            );
            scheduleReconnect();
          }
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            handleServerPayload(payload);
          } catch (error) {
            console.error('[ChatPanel] Error parsing message:', error);
          }
        };
      });
    } catch (error) {
      connectingRef.current = false;
      setConnectionState('disconnected');
      throw error;
    }
  }, [
    appendConnectionBanner,
    flushPendingOutboundActions,
    handleServerPayload,
    hasQueuedOutboundActionType,
    projectDirectory,
    syncConfiguredProject,
    syncProjectState,
  ]);

  useEffect(() => {
    let active = true;

    const syncSettings = (next: AppSettings | null, allowReconnect: boolean) => {
      if (!active) {
        return;
      }

      appSettingsRef.current = next;

      const nextKey = getComfyUISettingsKey(next);
      const previousKey = comfyUISettingsKeyRef.current;
      comfyUISettingsKeyRef.current = nextKey;

      if (!allowReconnect || !previousKey || previousKey === nextKey) {
        return;
      }

      const hasActiveConnection = Boolean(
        wsRef.current && wsRef.current.readyState === WebSocket.OPEN,
      );
      if (!hasActiveConnection) {
        return;
      }

      if (settingsReconnectTimeoutRef.current) {
        clearTimeout(settingsReconnectTimeoutRef.current);
      }
      settingsReconnectTimeoutRef.current = setTimeout(() => {
        settingsReconnectTimeoutRef.current = null;
        appendSystemMessage(
          'ComfyUI settings changed. Reconnecting chat session to apply update...',
          'status',
        );
        disconnectWebSocket();
        connectWebSocket().catch((error) => {
          appendConnectionBanner(
            'comfyui_settings_reconnect_failed',
            `Failed to reconnect after ComfyUI settings update: ${(error as Error).message}`,
          );
        });
      }, SETTINGS_RECONNECT_DEBOUNCE_MS);
    };

    window.electron.settings
      .get()
      .then((stored) => {
        syncSettings(stored, false);
      })
      .catch(() => {
        syncSettings(null, false);
      });

    const unsubscribe = window.electron.settings.onChange((next) => {
      syncSettings(next, true);
    });

    return () => {
      active = false;
      unsubscribe();
      if (settingsReconnectTimeoutRef.current) {
        clearTimeout(settingsReconnectTimeoutRef.current);
      }
    };
  }, [
    appendConnectionBanner,
    appendSystemMessage,
    connectWebSocket,
    disconnectWebSocket,
  ]);

  const sendClientAction = useCallback(
    async (message: Record<string, unknown>) => {
      const serializedMessage = JSON.stringify(message);
      const activeSocket = wsRef.current;

      if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.send(serializedMessage);
        return;
      }

      queueOutboundAction(serializedMessage);
      try {
        const socket = await connectWebSocket();
        flushPendingOutboundActions(socket);
      } catch (error) {
        console.warn(
          '[ChatPanel] Queued outbound action while reconnecting:',
          (error as Error).message,
        );
      }
    },
    [connectWebSocket, flushPendingOutboundActions, queueOutboundAction],
  );

  useEffect(() => {
    sendClientActionRef.current = sendClientAction;
  }, [sendClientAction]);

  const sendResponse = useCallback(
    async (content: string) => {
      const activeQuestionMeta = lastQuestionMessageIdRef.current
        ? ((messagesRef.current.find(
            (message) => message.id === lastQuestionMessageIdRef.current,
          )?.meta || {}) as Record<string, unknown>)
        : null;
      const questionOptions = (
        (activeQuestionMeta?.options as ChatQuestionOption[] | undefined) || []
      ).map((option) => option.label);

      if (lastQuestionMessageIdRef.current) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === lastQuestionMessageIdRef.current
              ? {
                  ...message,
                  meta: {
                    ...message.meta,
                    selectedResponse: content,
                  },
                  timestamp: Date.now(),
                }
              : message,
          ),
        );
      }

      // Used for clicking options in QuestionPrompt
      window.electron.logger.logUserInput(content);

      // Mark that user has sent their first message
      setHasUserSentMessage(true);

      await persistOriginalInputIfNeeded(content, questionOptions);

      await sendClientAction({
        type: 'user_response',
        data: { response: content },
      });
      awaitingResponseRef.current = false;
      setAgentStatus('thinking');
      setStatusMessage('Processing...');

      // Clear question ref since we've responded
      lastQuestionMessageIdRef.current = null;

      appendTimelineEvent(`Answered question: ${content}`);

      // Also append user message for visual feedback
      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });
    },
    [
      appendMessage,
      appendTimelineEvent,
      persistOriginalInputIfNeeded,
      sendClientAction,
    ],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!awaitingResponseRef.current) {
        if (isConfiguringProjectSetupRef.current) {
          appendSystemMessage(
            'Project setup is still being configured. Please wait a moment.',
            'status',
          );
          return;
        }
        if (projectDirectory && !isProjectSetupConfigured) {
          if (setupPanelMode !== 'wizard') {
            void openSetupWizard();
            appendSystemMessage(
              'Complete Project Setup before sending your first prompt.',
              'status',
            );
            return;
          }
          appendSystemMessage(
            'Complete Project Setup before sending your first prompt.',
            'status',
          );
          return;
        }
      }

      // Log user input
      window.electron.logger.logUserInput(content);

      // Mark that user has sent their first message
      setHasUserSentMessage(true);
      setIsTaskRunning(true);

      await persistOriginalInputIfNeeded(content);

      appendMessage({
        role: 'user',
        type: 'message',
        content,
      });

      setAgentStatus('thinking');
      setStatusMessage('Processing...');
      window.electron.logger.logStatusChange(
        'thinking',
        agentName,
        'Processing...',
      );

      if (awaitingResponseRef.current) {
        await sendClientAction({
          type: 'user_response',
          data: { response: content },
        });
        awaitingResponseRef.current = false;
      } else {
        await sendClientAction({
          type: 'start_task',
          data: { task: content },
        });
      }
    },
    [
      appendMessage,
      sendClientAction,
      agentName,
      appendSystemMessage,
      isProjectSetupConfigured,
      openSetupWizard,
      projectDirectory,
      persistOriginalInputIfNeeded,
      setupPanelMode,
    ],
  );

  const requestStop = useCallback(
    async (reason: 'user_stop' | 'project_switch'): Promise<boolean> => {
      const existingRequest = stopRequestRef.current;
      if (existingRequest) {
        return existingRequest.promise;
      }

      if (!isTaskRunningRef.current) {
        return true;
      }

      let resolveStop: ((success: boolean) => void) | null = null;
      const promise = new Promise<boolean>((resolve) => {
        resolveStop = resolve;
      });

      if (!resolveStop) {
        return false;
      }

      const timeoutId = setTimeout(() => {
        resolveStopRequest(
          false,
          'Stop request timed out. Task may still be running.',
        );
      }, STOP_ACK_TIMEOUT_MS);

      stopRequestRef.current = {
        promise,
        resolve: resolveStop,
        timeoutId,
      };

      setIsStopPending(true);
      setStatusMessage('Stopping...');

      await sendClientAction({
        type: 'cancel',
        data: { reason },
      });

      return promise;
    },
    [resolveStopRequest, sendClientAction],
  );

  const stopTask = useCallback(async () => {
    await requestStop('user_stop');
  }, [requestStop]);

  useEffect(() => {
    return registerProjectSwitchGuard(async ({ fromProjectDirectory }) => {
      if (!isTaskRunningRef.current && !isStopPendingRef.current) {
        return true;
      }

      const shouldSwitch = window.confirm(
        'Switching project will stop the current task. Continue?',
      );
      if (!shouldSwitch) {
        return false;
      }

      const stopped = await requestStop('project_switch');
      if (!stopped) {
        return false;
      }

      failActiveToolCalls('Cancelled due to project switch');
      flushSnapshotSave(fromProjectDirectory);
      return true;
    });
  }, [
    failActiveToolCalls,
    flushSnapshotSave,
    registerProjectSwitchGuard,
    requestStop,
  ]);

  // Register sendMessage so other components can trigger agent tasks (e.g. Render Infographics)
  useEffect(() => {
    if (agentContext?.registerSendTask) {
      return agentContext.registerSendTask(sendMessage);
    }
  }, [agentContext?.registerSendTask, sendMessage]);

  useEffect(() => {
    scheduleSnapshotSave(projectDirectory);
  }, [
    projectDirectory,
    messages,
    agentStatus,
    agentName,
    statusMessage,
    currentPhase,
    phaseDisplayName,
    hasUserSentMessage,
    isTaskRunning,
    sessionId,
    scheduleSnapshotSave,
  ]);

  useEffect(() => {
    const bootstrap = async () => {
      const state = await window.electron.backend.getState();
      if (
        state.status === 'ready' &&
        !wsRef.current &&
        !connectingRef.current &&
        !!projectDirectory
      ) {
        connectWebSocket().catch(() => undefined);
      } else if (
        (state.status === 'error' ||
          state.status === 'stopped' ||
          state.status === 'disconnected')
      ) {
        markRunInterrupted(
          state.message || 'Backend unavailable. Current task was interrupted.',
          {
            status: 'error',
            statusMessage: 'Backend unavailable. Task interrupted.',
          },
        );
      }
    };
    bootstrap().catch(() => { });

    const unsubscribeBackend = window.electron.backend.onStateChange(
      (state: BackendState) => {
        if (state.status === 'error' && state.message) {
          appendSystemMessage(`Backend error: ${state.message}`, 'error');
          markRunInterrupted(state.message, {
            status: 'error',
            statusMessage: state.message,
          });
        } else if (
          state.status === 'disconnected' ||
          state.status === 'stopped'
        ) {
          markRunInterrupted(
            state.message || 'Connection to backend lost. Task interrupted.',
            {
              status: 'error',
              statusMessage: 'Connection lost. Task interrupted.',
            },
          );
        } else if (
          state.status === 'ready' &&
          !connectingRef.current &&
          (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) &&
          !!projectDirectory
        ) {
          connectWebSocket().catch(() => undefined);
        }
      },
    );

    return () => {
      unsubscribeBackend();
    };
  }, [
    connectWebSocket,
    appendSystemMessage,
    markRunInterrupted,
    projectDirectory,
  ]);

  useEffect(() => {
    return () => {
      const pendingStop = stopRequestRef.current;
      if (pendingStop) {
        clearTimeout(pendingStop.timeoutId);
        stopRequestRef.current = null;
        pendingStop.resolve(false);
      }
      flushSnapshotSave(currentProjectDirectoryRef.current);
      disconnectWebSocket();
      if (settingsReconnectTimeoutRef.current) {
        clearTimeout(settingsReconnectTimeoutRef.current);
      }
      if (statusUpdateTimeoutRef.current) {
        clearTimeout(statusUpdateTimeoutRef.current);
      }
    };
  }, [disconnectWebSocket, flushSnapshotSave]);

  // Restore chat snapshots and reconnect when workspace changes.
  const prevProjectDirectoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (projectDirectory === prevProjectDirectoryRef.current) {
      return;
    }

    const previousProjectDirectory = prevProjectDirectoryRef.current;
    prevProjectDirectoryRef.current = projectDirectory || null;
    currentProjectDirectoryRef.current = projectDirectory || null;

    const pendingStop = stopRequestRef.current;
    if (pendingStop) {
      clearTimeout(pendingStop.timeoutId);
      stopRequestRef.current = null;
      pendingStop.resolve(false);
    }

    console.log('[ChatPanel] projectDirectory changed:', {
      newValue: projectDirectory,
      hasValue: !!projectDirectory,
    });

    if (previousProjectDirectory) {
      flushSnapshotSave(previousProjectDirectory);
    }

    disconnectWebSocket();
    reconnectAttemptRef.current = 0;
    connectionBannerRef.current = null;
    pendingOutboundActionsRef.current = [];
    setSetupPanelMode('hidden');
    setSetupStep('template');
    setSetupError(null);
    setIsProjectSetupConfigured(false);
    setIsConfiguringProjectSetup(false);
    setSelectedTemplateId(null);
    setSelectedStyleId(null);
    setSelectedDuration(null);

    if (!projectDirectory) {
      resetConversationRefs();
      setMessages([]);
      setSessionId(null);
      setAgentStatus('idle');
      setAgentName('Kshana');
      setStatusMessage('Ready');
      setCurrentPhase(undefined);
      setPhaseDisplayName(undefined);
      setHasUserSentMessage(false);
      setIsTaskRunning(false);
      setIsStopPending(false);
      return;
    }

    const reconnect = async () => {
      try {
        await restoreSnapshot(projectDirectory);
        const catalog = await ensureTemplateCatalogLoaded();
        const defaultSetup = deriveDefaultSetup(
          catalog.templates,
          catalog.durationPresets,
        );

        if (defaultSetup) {
          applySetupSelection(defaultSetup);
        }

        const persistedSetup = await loadPersistedSetup();
        if (persistedSetup && projectDirectory) {
          const persistedPayload: ConfigureProjectPayload = {
            templateId: persistedSetup.templateId,
            style: persistedSetup.style,
            duration: persistedSetup.duration,
            projectDir: projectDirectory,
            projectName: getProjectNameFromDirectory(projectDirectory),
          };
          applySetupSelection(persistedPayload);
          setSetupPanelMode('hidden');
          void configureProjectSetup(persistedPayload);
        } else {
          const pendingSetupDir = window.localStorage.getItem(
            PROJECT_SETUP_STORAGE_KEY,
          );
          const isPendingForCurrentProject =
            pendingSetupDir &&
            normalizeProjectDirectory(pendingSetupDir) ===
              normalizeProjectDirectory(projectDirectory);

          if (isPendingForCurrentProject) {
            window.localStorage.removeItem(PROJECT_SETUP_STORAGE_KEY);
            setSetupPanelMode('wizard');
            setSetupStep('template');
          } else {
            setSetupPanelMode('wizard');
            setSetupStep('template');
          }
        }

        const state = await window.electron.backend.getState();
        if (state.status === 'ready') {
          await connectWebSocket();
        }
      } catch (error) {
        console.error('[ChatPanel] Reconnect failed:', error);
      }
    };
    reconnect().catch(() => undefined);
  }, [
    connectWebSocket,
    disconnectWebSocket,
    ensureTemplateCatalogLoaded,
    deriveDefaultSetup,
    flushSnapshotSave,
    projectDirectory,
    resetConversationRefs,
    restoreSnapshot,
    applySetupSelection,
    loadPersistedSetup,
    configureProjectSetup,
  ]);

  const handleExportChat = useCallback(async () => {
    if (!projectDirectory) {
      appendSystemMessage('Open a project before exporting chat history.', 'error');
      return;
    }

    const exportPayload: ChatExportPayload = {
      exportedAt: new Date().toISOString(),
      projectDirectory,
      sessionId: sessionIdRef.current,
      messages: messagesRef.current.map(
        (message) =>
          ({
            id: message.id,
            role: message.role,
            type: message.type,
            content: message.content,
            timestamp: message.timestamp,
            author: message.author,
            meta: message.meta,
          }) as PersistedChatMessage,
      ),
    };

    const result = await window.electron.project.exportChatJson(exportPayload);
    if (!result.success && !result.canceled) {
      appendSystemMessage(
        `Failed to export chat JSON: ${result.error || 'Unknown error'}`,
        'error',
      );
    }
  }, [appendSystemMessage, projectDirectory]);

  const activeQuestion = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.type !== 'agent_question') {
        continue;
      }
      const questionMeta = (message.meta || {}) as Record<string, unknown>;

      const selectedResponse = questionMeta.selectedResponse as
        | string
        | undefined;
      if (selectedResponse) {
        return null;
      }

      return {
        id: message.id,
        question: message.content,
        options: ((questionMeta.options as ChatQuestionOption[]) || []).slice(
          0,
          9,
        ),
        type:
          (questionMeta.questionType as 'text' | 'confirm' | 'select') ||
          'text',
        isConfirmation: Boolean(questionMeta.isConfirmation),
        autoApproveTimeoutMs:
          questionMeta.autoApproveTimeoutMs as number | undefined,
        defaultOption: questionMeta.defaultOption as string | undefined,
      };
    }

    return null;
  }, [messages]);

  const activeTodos = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.type !== 'todo_update') {
        continue;
      }
      const todoMeta = (message.meta || {}) as Record<string, unknown>;
      const todos = (todoMeta.todos as Array<any> | undefined) || [];
      if (todos.length === 0) {
        continue;
      }

      return todos;
    }

    return null;
  }, [messages]);

  const showDockedTodoPrompt =
    setupPanelMode === 'hidden' && !activeQuestion && !!activeTodos;
  // Never show legacy greeting messages.
  const filteredMessages = useMemo(() => {
    return messages.filter(
      (msg) =>
        !(msg.type === 'greeting' && msg.role === 'system') &&
        msg.type !== 'agent_question' &&
        msg.type !== 'todo_update',
    );
  }, [messages]);

  const chatInputPlaceholder = useMemo(() => {
    if (activeQuestion && (activeQuestion.options?.length || 0) > 0) {
      return 'Choose an option above, press 1-9, or type a custom reply…';
    }

    if (activeQuestion) {
      return 'Type your answer to continue…';
    }

    if (showDockedTodoPrompt) {
      return isTaskRunning
        ? 'Current task progress is shown above. Use Stop if you want to interrupt this run…'
        : 'Continue the workflow, refine the output, or ask for the next step…';
    }

    return 'Describe your story, ask for a storyboard, or request assets…';
  }, [activeQuestion, isTaskRunning, showDockedTodoPrompt]);

  const chatInputHint = useMemo(() => {
    if (activeQuestion && (activeQuestion.options?.length || 0) > 0) {
      return 'Quick reply: press 1-9, click an option, or type your own answer and send.';
    }

    if (activeQuestion) {
      return 'Answer the active question here to continue the workflow.';
    }

    if (showDockedTodoPrompt) {
      return isTaskRunning
        ? 'Live task progress is docked above the composer.'
        : 'Latest task progress is docked above. You can keep iterating from here.';
    }

    return undefined;
  }, [activeQuestion, isTaskRunning, showDockedTodoPrompt]);

  const activeToolStream = useMemo(() => {
    if (!liveToolStream?.text.trim()) {
      return null;
    }

    return {
      toolCallId: liveToolStream.toolCallId,
      agentName: liveToolStream.agentName || 'Agent',
      toolName: liveToolStream.toolName || 'tool',
      text: liveToolStream.text,
    };
  }, [liveToolStream]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Bot size={18} className={styles.headerIcon} />
        <span className={styles.headerTitle}>Kshana Assistant</span>
        <button
          type="button"
          className={styles.exportButton}
          onClick={handleExportChat}
          title="Export chat history as JSON"
          aria-label="Export chat history as JSON"
        >
          <Download size={14} />
          <span>Export Chat</span>
        </button>
        <button
          type="button"
          className={styles.clearButton}
          onClick={clearChat}
          title="Clear chat"
        >
          <Trash2 size={14} />
          <span>Clear</span>
        </button>
      </div>

      <StatusBar
        agentName={agentName}
        status={agentStatus}
        message={statusMessage}
        currentPhase={currentPhase}
        phaseDisplayName={phaseDisplayName}
        contextUsagePercentage={contextUsagePercentage}
        contextWasCompressed={contextWasCompressed}
        sessionTimerStartedAt={sessionTimerStartedAt}
        sessionTimerCompletedAt={sessionTimerCompletedAt}
      />

      <div className={styles.messages}>
        <MessageList
          messages={filteredMessages}
          isStreaming={isStreaming}
          liveToolStream={activeToolStream}
          onDelete={deleteMessage}
        />
      </div>

      <ProjectSetupPanel
        mode={setupPanelMode}
        step={setupStep}
        templates={setupTemplates}
        durationPresets={setupDurationPresets}
        selectedTemplateId={selectedTemplateId}
        selectedStyleId={selectedStyleId}
        selectedDuration={selectedDuration}
        loading={isLoadingSetupCatalog}
        configuring={isConfiguringProjectSetup}
        error={setupError}
        onOpenWizard={openSetupWizard}
        onEditSetup={handleSetupEdit}
        onSelectTemplate={handleSelectTemplate}
        onSelectStyle={handleSelectStyle}
        onSelectDuration={handleSelectDuration}
        onBack={handleSetupBack}
      />

      {showDockedTodoPrompt && (
        <TodoPrompt todos={activeTodos} isRunning={isTaskRunning} />
      )}

      {setupPanelMode === 'hidden' && activeQuestion && (
        <QuestionPrompt
          question={activeQuestion.question}
          options={activeQuestion.options}
          type={activeQuestion.type}
          autoApproveTimeoutMs={activeQuestion.autoApproveTimeoutMs}
          defaultOption={activeQuestion.defaultOption}
          isConfirmation={activeQuestion.isConfirmation}
          onSelect={sendResponse}
        />
      )}

      <ChatInput
        disabled={
          connectionState === 'connecting' ||
          isConfiguringProjectSetup ||
          setupPanelMode === 'wizard'
        }
        isRunning={isTaskRunning}
        isStopping={isStopPending}
        placeholder={chatInputPlaceholder}
        hintText={chatInputHint}
        questionMode={!!activeQuestion && setupPanelMode === 'hidden'}
        onSend={sendMessage}
        onStop={stopTask}
      />
    </div>
  );
}
