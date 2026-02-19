/**
 * Project Context
 * React context for managing Kshana project state
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type {
  KshanaProject,
  KshanaManifest,
  AgentProjectFile,
  AssetManifest,
  KshanaTimelineState,
  ContextIndex,
  WorkflowPhase,
  ItemApprovalStatus,
  CharacterData,
  SettingData,
  SceneRef,
  AssetInfo,
} from '../types/kshana';
import type { SceneVersions } from '../types/kshana/timeline';
import { DEFAULT_TIMELINE_STATE } from '../types/kshana';
import { projectService } from '../services/project';
import {
  buildAssetDedupeKey,
  createEmptyImageProjectionSnapshot,
  createImageAssetSyncEngine,
  type ImageProjectionSnapshot,
  type ImageSyncTriggerSource,
} from '../services/assets';
import { useWorkspace } from './WorkspaceContext';

/**
 * Project context state
 */
interface ProjectState {
  /** Whether a project is currently loaded */
  isLoaded: boolean;

  /** Whether project is currently loading */
  isLoading: boolean;

  /** Error message if any */
  error: string | null;

  /** Root project manifest */
  manifest: KshanaManifest | null;

  /** Agent project state */
  agentState: AgentProjectFile | null;

  /** Asset manifest */
  assetManifest: AssetManifest | null;

  /** Timeline state */
  timelineState: KshanaTimelineState;

  /** Context index */
  contextIndex: ContextIndex | null;
}

/**
 * Project context actions
 */
interface ProjectActions {
  /** Load a project from directory */
  loadProject: (directory: string) => Promise<boolean>;

  /** Create a new project */
  createProject: (
    directory: string,
    name: string,
    description?: string,
  ) => Promise<boolean>;

  /** Close the current project */
  closeProject: () => void;

  /** Update the current workflow phase */
  updatePhase: (phase: WorkflowPhase) => Promise<void>;

  /** Update scene approval status */
  updateSceneApproval: (
    sceneNumber: number,
    field: 'content' | 'image' | 'video' | 'audio',
    status: ItemApprovalStatus,
  ) => Promise<void>;

  /** Save timeline state */
  saveTimelineState: (state: KshanaTimelineState) => Promise<void>;

  /** Update playhead position */
  updatePlayhead: (seconds: number) => void;

  /** Update zoom level */
  updateZoom: (level: number) => void;

  /** Set active version for a scene */
  setActiveVersion: (
    sceneFolder: string,
    assetType: 'image' | 'video',
    version: number,
  ) => void;

  /** Update timeline markers */
  updateMarkers: (markers: KshanaTimelineState['markers']) => void;

  /** Update imported clips */
  updateImportedClips: (
    importedClips: KshanaTimelineState['imported_clips'],
  ) => void;

  /** Update per-image timeline timing overrides */
  updateImageTimingOverrides: (
    overrides: KshanaTimelineState['image_timing_overrides'],
  ) => void;

  /** Update per-infographic timeline timing overrides */
  updateInfographicTimingOverrides: (
    overrides: KshanaTimelineState['infographic_timing_overrides'],
  ) => void;

  /** Update per-video split overrides */
  updateVideoSplitOverrides: (
    overrides: KshanaTimelineState['video_split_overrides'],
  ) => void;

  /** Add an asset to the asset manifest */
  addAsset: (assetInfo: AssetInfo) => Promise<boolean>;

  /** Explicitly refresh the asset manifest from disk */
  refreshAssetManifest: () => Promise<void>;

  /** Subscribe to image placement projections (v2 sync path) */
  subscribeImageProjection: (
    listener: (snapshot: ImageProjectionSnapshot) => void,
  ) => () => void;

  /** Read the current image projection snapshot */
  getImageProjectionSnapshot: () => ImageProjectionSnapshot;

  /** Trigger image projection reconcile */
  triggerImageProjectionReconcile: (source: ImageSyncTriggerSource) => void;

  /** Update expected image placement numbers */
  setExpectedImagePlacements: (placementNumbers: number[]) => void;
}

/**
 * Computed/derived state
 */
interface ProjectComputed {
  /** Project name */
  projectName: string | null;

  /** Project ID */
  projectId: string | null;

  /** Current workflow phase */
  currentPhase: WorkflowPhase | null;

  /** List of characters */
  characters: CharacterData[];

  /** List of settings */
  settings: SettingData[];

  /** List of scenes */
  scenes: SceneRef[];

  /** Completion percentage */
  completionPercentage: number;

  /** Whether image generation is active (used for refresh heuristics) */
  isImageGenerationActive: boolean;

  /** Feature flag: image sync v2 */
  isImageSyncV2Enabled: boolean;
}

/**
 * Full project context type
 */
export type ProjectContextType = ProjectState &
  ProjectActions &
  ProjectComputed;

/**
 * Initial state
 */
const initialState: ProjectState = {
  isLoaded: false,
  isLoading: false,
  error: null,
  manifest: null,
  agentState: null,
  assetManifest: null,
  timelineState: { ...DEFAULT_TIMELINE_STATE },
  contextIndex: null,
};

function normalizeProjectDirectoryPath(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const normalized = input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized || null;
}

function getImageSyncV2Flag(): boolean {
  try {
    return window.localStorage.getItem('renderer.image_sync_v2') === 'true';
  } catch {
    return false;
  }
}

/**
 * Project context
 */
const ProjectContext = createContext<ProjectContextType | null>(null);

/**
 * Provider props
 */
interface ProjectProviderProps {
  children: ReactNode;
}

/**
 * Project Provider component
 */
export function ProjectProvider({ children }: ProjectProviderProps) {
  const [state, setState] = useState<ProjectState>(initialState);
  const isImageSyncV2Enabled = useMemo(() => getImageSyncV2Flag(), []);

  // Track if image generation is active (via WebSocket status)
  const [isImageGenerationActive, setIsImageGenerationActive] = useState(false);

  // Get workspace context for sync
  const { projectDirectory } = useWorkspace();
  const lastLoadedDir = useRef<string | null>(null);

  // WebSocket connection refs to prevent duplicate connections
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectDelayRef = useRef(500);
  const manifestRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const connectAssetWebSocketRef = useRef<(source: string) => void>(() => {});
  const connectingRef = useRef(false);
  const currentProjectDirRef = useRef<string | null>(null);
  const imageSyncEngineRef = useRef<ReturnType<
    typeof createImageAssetSyncEngine
  > | null>(null);

  const readAssetManifestForSync = useCallback(
    async (directory: string): Promise<AssetManifest | null> => {
      const result = await projectService.openProject(directory);
      if (!result.success) {
        console.warn('[ProjectContext][image_sync] Failed to read manifest', {
          source: 'image_sync',
          directory,
          error: result.error,
        });
        return null;
      }
      return result.data.assetManifest ?? null;
    },
    [],
  );

  const scanImagePlacementFiles = useCallback(
    async (directory: string): Promise<Record<number, string>> => {
      try {
        const imageDir = `${directory}/.kshana/agent/image-placements`;
        const files = await window.electron.project.readTree(imageDir, 1);
        const placementMap: Record<number, string> = {};

        if (files?.children) {
          const candidateFiles = files.children
            .filter((file) => file.type === 'file')
            .map((file) => file.name)
            .sort((a, b) => b.localeCompare(a));

          for (const filename of candidateFiles) {
            const match = filename.match(/^image(\d+)[-_].+\.(png|jpe?g|webp)$/i);
            if (!match) continue;

            const placementNumber = Number(match[1]);
            if (
              Number.isFinite(placementNumber) &&
              !placementMap[placementNumber]
            ) {
              placementMap[placementNumber] =
                `agent/image-placements/${filename}`;
            }
          }
        }

        return placementMap;
      } catch {
        return {};
      }
    },
    [],
  );

  useEffect(() => {
    if (!isImageSyncV2Enabled) return;

    const engine = createImageAssetSyncEngine({
      readAssetManifest: readAssetManifestForSync,
      scanImagePlacements: scanImagePlacementFiles,
      logger: (event, payload) => {
        console.log(`[ProjectContext][${event}]`, payload);
      },
    });

    imageSyncEngineRef.current = engine;
    return () => {
      engine.dispose();
      imageSyncEngineRef.current = null;
    };
  }, [isImageSyncV2Enabled, readAssetManifestForSync, scanImagePlacementFiles]);

  // Sync with WorkspaceContext - auto-load project when directory changes
  useEffect(() => {
    if (!projectDirectory) {
      // Directory was cleared - close project
      if (lastLoadedDir.current) {
        projectService.closeProject();
        setState(initialState);
        lastLoadedDir.current = null;
      }
      return;
    }

    // Don't reload if same directory
    if (projectDirectory === lastLoadedDir.current) return;

    // Auto-load project when opening a project directory
    const loadProject = async () => {
      const normalizedDir =
        normalizeProjectDirectoryPath(projectDirectory) ?? projectDirectory;
      console.log('[ProjectContext] Loading project from:', normalizedDir);
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      const result = await projectService.openProject(normalizedDir);

      if (result.success) {
        const project = result.data;
        console.log('[ProjectContext] Project loaded successfully:', {
          hasManifest: !!project.manifest,
          hasAgentState: !!project.agentState,
          hasAssetManifest: !!project.assetManifest,
          assetCount: project.assetManifest?.assets?.length || 0,
          imageAssets:
            project.assetManifest?.assets?.filter(
              (a) => a.type === 'scene_image',
            ).length || 0,
        });
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          isLoading: false,
          error: null,
          manifest: project.manifest,
          agentState: project.agentState,
          assetManifest: project.assetManifest,
          timelineState: project.timelineState,
          contextIndex: project.contextIndex,
        }));
        lastLoadedDir.current = projectDirectory;

        // Set up explicit watches for manifest and placements
        try {
          const manifestPath = `${normalizedDir}/.kshana/agent/manifest.json`;
          const imagePlacementsDir = `${normalizedDir}/.kshana/agent/image-placements`;
          const infographicPlacementsDir = `${normalizedDir}/.kshana/agent/infographic-placements`;

          await window.electron.project.watchManifest(manifestPath);
          await window.electron.project.watchImagePlacements(
            imagePlacementsDir,
          );
          await window.electron.project.watchInfographicPlacements(
            infographicPlacementsDir,
          );
          console.log(
            '[ProjectContext] Set up explicit watches for manifest and placements',
          );
        } catch (error) {
          console.warn(
            '[ProjectContext] Failed to set up explicit watches:',
            error,
          );
        }
      } else {
        console.error('[ProjectContext] Failed to load project:', result.error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error,
          isLoaded: false,
        }));
        lastLoadedDir.current = null;
      }
    };

    loadProject();
  }, [projectDirectory]);

  useEffect(() => {
    if (!isImageSyncV2Enabled || !imageSyncEngineRef.current) {
      return;
    }

    if (projectDirectory && state.isLoaded) {
      const normalizedDirectory =
        normalizeProjectDirectoryPath(projectDirectory);
      imageSyncEngineRef.current.setProjectDirectory(normalizedDirectory);
      imageSyncEngineRef.current.triggerReconcile('project_load');
    } else {
      imageSyncEngineRef.current.setProjectDirectory(null);
    }
  }, [isImageSyncV2Enabled, projectDirectory, state.isLoaded]);

  useEffect(() => {
    if (!isImageSyncV2Enabled || !projectDirectory) return undefined;

    const unsubscribe = window.electron.project.onManifestWritten((event) => {
      if (!event.path.replace(/\\/g, '/').includes('.kshana/agent/manifest.json')) return;
      imageSyncEngineRef.current?.triggerReconcile('manifest_written', event.path);
    });

    return () => {
      unsubscribe();
    };
  }, [isImageSyncV2Enabled, projectDirectory]);

  // Listen for file changes and reload project state when relevant files change
  useEffect(() => {
    if (!projectDirectory || !state.isLoaded) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path.replace(/\\/g, '/');
      const isManifestFile = filePath.includes('.kshana/agent/manifest.json');
      const isProjectStateFile =
        filePath.includes('.kshana/agent/project.json') ||
        filePath.includes('.kshana/context/index.json');
      const isImagePlacementFile = filePath.includes(
        '.kshana/agent/image-placements',
      );

      if (isImageSyncV2Enabled && (isManifestFile || isImagePlacementFile)) {
        imageSyncEngineRef.current?.triggerReconcile('file_watch', filePath);
      }

      // Reload project when key files change.
      // When V2 sync is enabled, skip manifest-only changes here --
      // the dedicated onManifestWritten handler owns those to avoid duplicate reads.
      const shouldReload = isProjectStateFile || (isManifestFile && !isImageSyncV2Enabled);
      if (shouldReload) {
        console.log('[ProjectContext][file_watch] File change detected', {
          source: 'file_watch',
          path: filePath,
          target: isManifestFile ? 'manifest.json' : 'project_state',
        });
        // Clear existing timeout
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        // Debounce rapid file changes (reduced to 300ms for faster response)
        debounceTimeout = setTimeout(async () => {
          try {
            console.log(
              '[ProjectContext] Reloading project due to file change:',
              filePath,
            );
            const result = await projectService.openProject(projectDirectory);
            if (result.success) {
              const project = result.data;
              console.log('[ProjectContext] Project reloaded successfully:', {
                hasAssetManifest: !!project.assetManifest,
                assetCount: project.assetManifest?.assets?.length || 0,
                imageAssets:
                  project.assetManifest?.assets
                    ?.filter((a) => a.type === 'scene_image')
                    .map((a) => ({
                      id: a.id,
                      placementNumber: a.metadata?.placementNumber,
                      path: a.path,
                    })) || [],
              });
              setState((prev) => ({
                ...prev,
                manifest: project.manifest,
                agentState: project.agentState,
                assetManifest: project.assetManifest,
                timelineState: project.timelineState,
                contextIndex: project.contextIndex,
              }));
            } else {
              console.error(
                '[ProjectContext] Failed to reload project:',
                result.error,
              );
              // Don't show error to user - file might be temporarily locked
            }
          } catch (error) {
            console.error('[ProjectContext] Error reloading project:', error);
            // Don't show error to user - file might be temporarily locked
          }
        }, 300); // 300ms debounce for faster response
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [projectDirectory, state.isLoaded, isImageSyncV2Enabled]);

  /**
   * Deep comparison of asset manifests to detect changes
   */
  const compareAssetManifests = (
    oldManifest: AssetManifest | null,
    newManifest: AssetManifest | null,
  ): boolean => {
    if (!oldManifest && !newManifest) return false;
    if (!oldManifest || !newManifest) return true;

    const oldAssets = oldManifest.assets || [];
    const newAssets = newManifest.assets || [];

    if (oldAssets.length !== newAssets.length) return true;

    // Create maps for efficient lookup
    const oldAssetMap = new Map(oldAssets.map((a) => [a.id, a]));
    const newAssetMap = new Map(newAssets.map((a) => [a.id, a]));

    // Check for added/removed assets
    for (const id of oldAssetMap.keys()) {
      if (!newAssetMap.has(id)) return true;
    }
    for (const id of newAssetMap.keys()) {
      if (!oldAssetMap.has(id)) return true;
    }

    // Check for changed assets - field by field comparison
    for (const [id, oldAsset] of oldAssetMap) {
      const newAsset = newAssetMap.get(id);
      if (!newAsset) return true;

      if (
        oldAsset.path !== newAsset.path ||
        oldAsset.version !== newAsset.version ||
        oldAsset.type !== newAsset.type ||
        oldAsset.scene_number !== newAsset.scene_number
      ) {
        return true;
      }

      // Compare metadata field by field without JSON.stringify
      const oldMeta = oldAsset.metadata || {};
      const newMeta = newAsset.metadata || {};
      const metaKeys = new Set([...Object.keys(oldMeta), ...Object.keys(newMeta)]);

      for (const key of metaKeys) {
        if (oldMeta[key] !== newMeta[key]) return true;
      }
    }

    return false;
  };

  // Explicitly refresh asset manifest from disk
  const refreshAssetManifest = useCallback(async (): Promise<void> => {
    if (!projectDirectory || !state.isLoaded) {
      console.warn(
        '[ProjectContext] Cannot refresh manifest: project not loaded',
      );
      return;
    }

    try {
      if (isImageSyncV2Enabled) {
        imageSyncEngineRef.current?.triggerReconcile('manual');
      }
      console.log('[ProjectContext] Explicitly refreshing asset manifest...');
      const result = await projectService.openProject(projectDirectory);
      if (result.success) {
        const project = result.data;
        const newManifest = project.assetManifest;

        // Use functional setState to compare with latest state (avoids stale closure)
        setState((prev) => {
          const changed = compareAssetManifests(prev.assetManifest, newManifest);
          if (changed) {
            console.log('[ProjectContext] Asset manifest refreshed:', {
              oldCount: prev.assetManifest?.assets?.length || 0,
              newCount: newManifest?.assets?.length || 0,
            });
            return {
              ...prev,
              assetManifest: newManifest,
            };
          }
          console.log('[ProjectContext] Asset manifest unchanged after refresh');
          return prev;
        });
      } else {
        console.error(
          '[ProjectContext] Failed to refresh manifest:',
          result.error,
        );
      }
    } catch (error) {
      console.error('[ProjectContext] Error refreshing manifest:', error);
    }
  }, [projectDirectory, state.isLoaded, isImageSyncV2Enabled]);

  const upsertAssetInManifest = useCallback((assetInfo: AssetInfo) => {
    setState((prev) => {
      if (!prev.assetManifest) return prev;

      const existingIndex = prev.assetManifest.assets.findIndex(
        (asset) => asset.id === assetInfo.id,
      );
      const nextAssets =
        existingIndex >= 0
          ? prev.assetManifest.assets.map((asset, index) =>
              index === existingIndex ? assetInfo : asset,
            )
          : [...prev.assetManifest.assets, assetInfo];

      return {
        ...prev,
        assetManifest: {
          ...prev.assetManifest,
          assets: nextAssets,
        },
      };
    });
  }, []);

  const scheduleManifestReconcile = useCallback(
    (source: 'ws_asset' | 'file_watch' | 'poll', delayMs: number = 250) => {
      if (manifestRefreshTimeoutRef.current) {
        clearTimeout(manifestRefreshTimeoutRef.current);
      }

      console.log('[ProjectContext][reconcile_schedule]', {
        source,
        delayMs,
      });

      manifestRefreshTimeoutRef.current = setTimeout(() => {
        manifestRefreshTimeoutRef.current = null;
        refreshAssetManifest().catch((error) => {
          console.warn('[ProjectContext][reconcile_schedule] Refresh failed', {
            source,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, delayMs);
    },
    [refreshAssetManifest],
  );

  const scheduleAssetSocketReconnect = useCallback(
    (source: string) => {
      if (!projectDirectory || !state.isLoaded) return;
      if (reconnectTimeoutRef.current) return;

      const delayMs = reconnectDelayRef.current;
      console.log('[ProjectContext][ws_reconnect_schedule]', {
        source,
        delayMs,
      });

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 5000);
        connectAssetWebSocketRef.current('reconnect_timer');
      }, delayMs);
    },
    [projectDirectory, state.isLoaded],
  );

  const connectAssetWebSocket = useCallback(
    async (source: string): Promise<void> => {
      const normalizedProjectDirectory =
        normalizeProjectDirectoryPath(projectDirectory);

      if (!normalizedProjectDirectory || !state.isLoaded) {
        return;
      }

      if (
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        currentProjectDirRef.current === normalizedProjectDirectory
      ) {
        return;
      }

      if (connectingRef.current) {
        return;
      }

      if (
        wsRef.current &&
        currentProjectDirRef.current !== normalizedProjectDirectory
      ) {
        wsRef.current.close();
        wsRef.current = null;
        currentProjectDirRef.current = null;
      }

      try {
        connectingRef.current = true;
        const backendState = await window.electron.backend.getState();
        const projectDirectoryForQuery = projectDirectory;

        if (!projectDirectoryForQuery) {
          connectingRef.current = false;
          return;
        }

        if (backendState.status !== 'ready') {
          connectingRef.current = false;
          console.log('[ProjectContext][ws_connect] Backend not ready', {
            source,
            backendStatus: backendState.status,
          });
          scheduleAssetSocketReconnect('backend_not_ready');
          return;
        }

        const baseUrl = backendState.serverUrl || `http://localhost:${backendState.port || 8001}`;
        const wsBase = baseUrl.replace(/^http/, 'ws');
        const wsUrl = `${wsBase}/api/v1/ws/chat?project_dir=${encodeURIComponent(projectDirectoryForQuery)}&channel=assets`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        currentProjectDirRef.current = normalizedProjectDirectory;

        ws.onopen = () => {
          reconnectDelayRef.current = 500;
          connectingRef.current = false;
          console.log('[ProjectContext][ws_connect] Connected', {
            source,
            projectDirectory: normalizedProjectDirectory,
          });
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            if (message.type === 'asset_added' && message.data) {
              const assetData = message.data as Record<string, unknown>;
              const eventProjectDirectory = normalizeProjectDirectoryPath(
                assetData['projectDirectory'] as string | undefined,
              );
              const currentDirectory = currentProjectDirRef.current;

              if (
                eventProjectDirectory &&
                currentDirectory &&
                eventProjectDirectory !== currentDirectory
              ) {
                return;
              }

              const optimisticAsset: AssetInfo = {
                id: String(assetData['assetId'] ?? ''),
                type: assetData['assetType'] as AssetInfo['type'],
                path: String(assetData['path'] ?? ''),
                scene_number:
                  typeof assetData['sceneNumber'] === 'number'
                    ? assetData['sceneNumber']
                    : undefined,
                version:
                  typeof assetData['version'] === 'number'
                    ? assetData['version']
                    : 1,
                created_at: Date.now(),
                metadata:
                  assetData['placementNumber'] !== undefined
                    ? { placementNumber: Number(assetData['placementNumber']) }
                    : undefined,
              };

              console.log('[ProjectContext][ws_asset]', {
                source: 'ws_asset',
                assetId: optimisticAsset.id,
                assetType: optimisticAsset.type,
                path: optimisticAsset.path,
                placementNumber: optimisticAsset.metadata?.['placementNumber'],
                sceneNumber: optimisticAsset.scene_number,
              });

              if (isImageSyncV2Enabled) {
                imageSyncEngineRef.current?.triggerReconcile(
                  'ws_asset',
                  buildAssetDedupeKey(optimisticAsset),
                );
              } else {
                upsertAssetInManifest(optimisticAsset);
              }
              scheduleManifestReconcile('ws_asset');
            } else if (message.type === 'status' && message.data) {
              const statusData = message.data as Record<string, unknown>;
              const status = statusData['status'];
              const isActive = status === 'busy' || status === 'processing';
              setIsImageGenerationActive(isActive);
            } else if (message.type === 'tool_call' && message.data) {
              const toolData = message.data as Record<string, unknown>;
              const toolName = toolData['toolName'];
              if (
                toolName === 'generate_image' ||
                toolName === 'generate_all_images'
              ) {
                setIsImageGenerationActive(true);
              }
            }
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onerror = (error) => {
          connectingRef.current = false;
          console.warn('[ProjectContext][ws_connect] Socket error', {
            source,
            error,
          });
        };

        ws.onclose = () => {
          wsRef.current = null;
          connectingRef.current = false;
          console.log('[ProjectContext][ws_connect] Socket closed', {
            source,
            projectDirectory: normalizedProjectDirectory,
          });

          if (
            currentProjectDirRef.current === normalizedProjectDirectory &&
            state.isLoaded &&
            normalizeProjectDirectoryPath(projectDirectory) ===
              normalizedProjectDirectory
          ) {
            scheduleAssetSocketReconnect('socket_closed');
          } else {
            currentProjectDirRef.current = null;
          }
        };
      } catch (error) {
        connectingRef.current = false;
        console.warn('[ProjectContext][ws_connect] Connection attempt failed', {
          source,
          error: error instanceof Error ? error.message : String(error),
        });
        scheduleAssetSocketReconnect('connect_error');
      }
    },
    [
      projectDirectory,
      state.isLoaded,
      scheduleAssetSocketReconnect,
      scheduleManifestReconcile,
      upsertAssetInManifest,
      isImageSyncV2Enabled,
    ],
  );

  useEffect(() => {
    connectAssetWebSocketRef.current = (source: string) => {
      connectAssetWebSocket(source).catch((error) => {
        console.warn('[ProjectContext][ws_connect] Unhandled connect failure', {
          source,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    };
  }, [connectAssetWebSocket]);

  // Maintain a dedicated asset WebSocket for the active project.
  useEffect(() => {
    if (!projectDirectory || !state.isLoaded) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (manifestRefreshTimeoutRef.current) {
        clearTimeout(manifestRefreshTimeoutRef.current);
        manifestRefreshTimeoutRef.current = null;
      }
      reconnectDelayRef.current = 500;
      currentProjectDirRef.current = null;
      return;
    }

    connectAssetWebSocketRef.current('project_loaded');
  }, [projectDirectory, state.isLoaded]);

  // If backend becomes ready after initial mount, retry socket connection.
  useEffect(() => {
    const unsubscribe = window.electron.backend.onStateChange((backendState) => {
      if (!projectDirectory || !state.isLoaded) return;
      if (backendState.status !== 'ready') return;
      if (connectingRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      console.log('[ProjectContext][ws_connect] Backend transitioned to ready', {
        source: 'backend_state_change',
      });
      connectAssetWebSocketRef.current('backend_ready');
    });

    return () => {
      unsubscribe();
    };
  }, [projectDirectory, state.isLoaded]);

  // Poll for manifest updates as a source-agnostic fallback.
  // This keeps timeline hydration convergent even if websocket/file-watch signals are missed.
  useEffect(() => {
    if (isImageSyncV2Enabled) return;
    if (!projectDirectory || !state.isLoaded) return;

    let pollIntervalMs = 1000;
    let consecutiveFailures = 0;
    const MAX_POLL_INTERVAL = 5000;
    const MAX_CONSECUTIVE_FAILURES = 20;
    const BACKOFF_MULTIPLIER = 1.5;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const pollForUpdates = async () => {
      if (isCancelled) return;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `[ProjectContext][poll] Stopping poll after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
        );
        return;
      }

      try {
        const result = await projectService.openProject(projectDirectory);
        if (result.success) {
          const project = result.data;

          // Use functional setState to compare with latest state (avoids stale closure)
          setState((prev) => {
            const assetsChanged = compareAssetManifests(
              prev.assetManifest,
              project.assetManifest,
            );

            if (assetsChanged) {
              console.log(
                '[ProjectContext][poll] Assets changed, updating manifest',
                {
                  source: 'poll',
                  oldCount: prev.assetManifest?.assets?.length || 0,
                  newCount: project.assetManifest?.assets?.length || 0,
                  addedAssets:
                    project.assetManifest?.assets
                      ?.filter(
                        (a) =>
                          !prev.assetManifest?.assets?.some(
                            (old) => old.id === a.id,
                          ),
                      )
                      .map((a) => ({
                        id: a.id,
                        placementNumber: a.metadata?.placementNumber,
                        path: a.path,
                      })) || [],
                },
              );

              pollIntervalMs = 1000;
              consecutiveFailures = 0;
              return {
                ...prev,
                assetManifest: project.assetManifest,
              };
            }
            return prev;
          });
        } else {
          consecutiveFailures++;
          pollIntervalMs = Math.min(
            Math.floor(1000 * BACKOFF_MULTIPLIER ** consecutiveFailures),
            MAX_POLL_INTERVAL,
          );
          if (consecutiveFailures <= 3) {
            console.warn('[ProjectContext][poll] Poll openProject failed', {
              source: 'poll',
              consecutiveFailures,
              nextIntervalMs: pollIntervalMs,
              error: result.error,
            });
          }
        }
      } catch (error) {
        consecutiveFailures++;
        pollIntervalMs = Math.min(
          Math.floor(1000 * BACKOFF_MULTIPLIER ** consecutiveFailures),
          MAX_POLL_INTERVAL,
        );
        if (consecutiveFailures <= 3) {
          console.debug('[ProjectContext][poll] Poll check failed', {
            source: 'poll',
            consecutiveFailures,
            nextIntervalMs: pollIntervalMs,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!isCancelled) {
        timeoutId = setTimeout(pollForUpdates, pollIntervalMs);
      }
    };

    pollForUpdates();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    isImageSyncV2Enabled,
    projectDirectory,
    state.isLoaded,
  ]);

  // Load project from directory
  const loadProject = useCallback(
    async (directory: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await projectService.openProject(directory);

      if (result.success) {
        const project = result.data;
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          isLoading: false,
          error: null,
          manifest: project.manifest,
          agentState: project.agentState,
          assetManifest: project.assetManifest,
          timelineState: project.timelineState,
          contextIndex: project.contextIndex,
        }));
        return true;
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: result.error,
      }));
      return false;
    },
    [],
  );

  // Create new project
  const createProject = useCallback(
    async (
      directory: string,
      name: string,
      description?: string,
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const result = await projectService.createProject(
        directory,
        name,
        description,
      );

      if (result.success) {
        const project = result.data;
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          isLoading: false,
          error: null,
          manifest: project.manifest,
          agentState: project.agentState,
          assetManifest: project.assetManifest,
          timelineState: project.timelineState,
          contextIndex: project.contextIndex,
        }));
        return true;
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: result.error,
      }));
      return false;
    },
    [],
  );

  // Close project
  const closeProject = useCallback(() => {
    projectService.closeProject();
    setState(initialState);
  }, []);

  // Update phase
  const updatePhase = useCallback(async (phase: WorkflowPhase) => {
    const result = await projectService.updatePhase(phase);
    if (result.success) {
      setState((prev) => ({
        ...prev,
        agentState: prev.agentState
          ? { ...prev.agentState, current_phase: phase }
          : null,
      }));
    }
  }, []);

  // Update scene approval
  const updateSceneApproval = useCallback(
    async (
      sceneNumber: number,
      field: 'content' | 'image' | 'video' | 'audio',
      status: ItemApprovalStatus,
    ) => {
      const result = await projectService.updateSceneApproval(
        sceneNumber,
        field,
        status,
      );
      if (result.success && state.agentState) {
        setState((prev) => {
          if (!prev.agentState) return prev;

          const scenes = prev.agentState.scenes.map((scene) => {
            if (scene.scene_number !== sceneNumber) return scene;

            const statusKey = `${field}_approval_status` as keyof SceneRef;
            return { ...scene, [statusKey]: status };
          });

          return {
            ...prev,
            agentState: { ...prev.agentState, scenes },
          };
        });
      }
    },
    [state.agentState],
  );

  // Save timeline state
  const saveTimelineState = useCallback(
    async (timelineState: KshanaTimelineState) => {
      await projectService.saveTimelineState(timelineState);
      // Don't update state here - it's already current when called from auto-save
      // This prevents infinite loops in the auto-save effect
    },
    [],
  );

  // Update playhead with auto-save
  const updatePlayhead = useCallback((seconds: number) => {
    setState((prev) => ({
      ...prev,
      timelineState: { ...prev.timelineState, playhead_seconds: seconds },
    }));
  }, []);

  // Update zoom with auto-save
  const updateZoom = useCallback((level: number) => {
    setState((prev) => ({
      ...prev,
      timelineState: { ...prev.timelineState, zoom_level: level },
    }));
  }, []);

  // Set active version with auto-save (supports both image and video)
  const setActiveVersion = useCallback(
    (sceneFolder: string, assetType: 'image' | 'video', version: number) => {
      setState((prev) => {
        const current = prev.timelineState.active_versions[sceneFolder];
        let updated: SceneVersions;

        // Handle migration from old format (number) to new format (SceneVersions)
        if (typeof current === 'number') {
          // Old format: migrate to new format
          updated =
            assetType === 'video'
              ? { video: version, image: current } // Preserve old video version as image if needed
              : { image: version, video: current }; // Preserve old video version
        } else if (current && typeof current === 'object') {
          // New format: update specific asset type
          updated = { ...current, [assetType]: version };
        } else {
          // No existing version: create new
          updated = { [assetType]: version };
        }

        return {
          ...prev,
          timelineState: {
            ...prev.timelineState,
            active_versions: {
              ...prev.timelineState.active_versions,
              [sceneFolder]: updated,
            },
          },
        };
      });
    },
    [],
  );

  // Update markers
  const updateMarkers = useCallback(
    (markers: KshanaTimelineState['markers']) => {
      setState((prev) => ({
        ...prev,
        timelineState: { ...prev.timelineState, markers },
      }));
    },
    [],
  );

  // Update imported clips
  const updateImportedClips = useCallback(
    (importedClips: KshanaTimelineState['imported_clips']) => {
      setState((prev) => ({
        ...prev,
        timelineState: { ...prev.timelineState, imported_clips: importedClips },
      }));
    },
    [],
  );

  const updateImageTimingOverrides = useCallback(
    (overrides: KshanaTimelineState['image_timing_overrides']) => {
      setState((prev) => ({
        ...prev,
        timelineState: {
          ...prev.timelineState,
          image_timing_overrides: overrides,
        },
      }));
    },
    [],
  );

  const updateInfographicTimingOverrides = useCallback(
    (overrides: KshanaTimelineState['infographic_timing_overrides']) => {
      setState((prev) => ({
        ...prev,
        timelineState: {
          ...prev.timelineState,
          infographic_timing_overrides: overrides,
        },
      }));
    },
    [],
  );

  const updateVideoSplitOverrides = useCallback(
    (overrides: KshanaTimelineState['video_split_overrides']) => {
      setState((prev) => ({
        ...prev,
        timelineState: {
          ...prev.timelineState,
          video_split_overrides: overrides,
        },
      }));
    },
    [],
  );

  // Add asset to manifest
  const addAsset = useCallback(
    async (assetInfo: AssetInfo): Promise<boolean> => {
      const result = await projectService.addAssetToManifest(assetInfo);
      if (result.success) {
        setState((prev) => {
          if (!prev.assetManifest) return prev;
          // Check if asset already exists
          const existingIndex = prev.assetManifest.assets.findIndex(
            (asset) => asset.id === assetInfo.id,
          );
          const newAssets =
            existingIndex >= 0
              ? prev.assetManifest.assets.map((asset, index) =>
                  index === existingIndex ? assetInfo : asset,
                )
              : [...prev.assetManifest.assets, assetInfo];
          return {
            ...prev,
            assetManifest: {
              ...prev.assetManifest,
              assets: newAssets,
            },
          };
        });
        return true;
      }
      return false;
    },
    [],
  );

  const subscribeImageProjection = useCallback(
    (listener: (snapshot: ImageProjectionSnapshot) => void) => {
      if (!isImageSyncV2Enabled || !imageSyncEngineRef.current) {
        listener(createEmptyImageProjectionSnapshot(projectDirectory ?? null));
        return () => {};
      }

      return imageSyncEngineRef.current.subscribe(listener);
    },
    [isImageSyncV2Enabled, projectDirectory],
  );

  const getImageProjectionSnapshot = useCallback((): ImageProjectionSnapshot => {
    if (!isImageSyncV2Enabled || !imageSyncEngineRef.current) {
      return createEmptyImageProjectionSnapshot(projectDirectory ?? null);
    }
    return imageSyncEngineRef.current.getSnapshot();
  }, [isImageSyncV2Enabled, projectDirectory]);

  const triggerImageProjectionReconcile = useCallback(
    (source: ImageSyncTriggerSource) => {
      if (!isImageSyncV2Enabled || !imageSyncEngineRef.current) return;
      imageSyncEngineRef.current.triggerReconcile(source);
    },
    [isImageSyncV2Enabled],
  );

  const setExpectedImagePlacements = useCallback(
    (placementNumbers: number[]) => {
      if (!isImageSyncV2Enabled || !imageSyncEngineRef.current) return;
      imageSyncEngineRef.current.setExpectedPlacements(placementNumbers);
    },
    [isImageSyncV2Enabled],
  );

  // Auto-save timeline state with debouncing
  // Use refs to track previous serialized values to avoid infinite loops with object dependencies
  const prevTimelineStateRef = useRef<string>('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineStateRef = useRef(state.timelineState);

  // Keep ref in sync with state
  useEffect(() => {
    timelineStateRef.current = state.timelineState;
  }, [state.timelineState]);

  useEffect(() => {
    if (!state.isLoaded) {
      prevTimelineStateRef.current = '';
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      return;
    }

    // Serialize timeline state for comparison (only the fields we care about)
    const currentState = JSON.stringify({
      playhead_seconds: state.timelineState.playhead_seconds,
      zoom_level: state.timelineState.zoom_level,
      active_versions: state.timelineState.active_versions,
      markers: state.timelineState.markers,
      imported_clips: state.timelineState.imported_clips,
      image_timing_overrides: state.timelineState.image_timing_overrides,
      infographic_timing_overrides:
        state.timelineState.infographic_timing_overrides,
      video_split_overrides: state.timelineState.video_split_overrides,
    });

    // Only save if state actually changed
    if (currentState === prevTimelineStateRef.current) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Update ref immediately to prevent duplicate saves
    prevTimelineStateRef.current = currentState;

    // Debounce the save - use ref to get latest state at save time
    saveTimeoutRef.current = setTimeout(() => {
      saveTimelineState(timelineStateRef.current);
      saveTimeoutRef.current = null;
    }, 500); // Debounce 500ms

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    state.timelineState.playhead_seconds,
    state.timelineState.zoom_level,
    state.isLoaded,
    // Use JSON.stringify for object/array dependencies to get stable string references
    // The actual comparison happens inside the effect using the ref
    JSON.stringify(state.timelineState.active_versions),
    JSON.stringify(state.timelineState.markers),
    JSON.stringify(state.timelineState.imported_clips),
    JSON.stringify(state.timelineState.image_timing_overrides),
    JSON.stringify(state.timelineState.infographic_timing_overrides),
    JSON.stringify(state.timelineState.video_split_overrides),
    saveTimelineState,
  ]);

  // Computed values
  const computed = useMemo<ProjectComputed>(() => {
    const { manifest, agentState } = state;

    // Calculate completion percentage
    let completionPercentage = 0;
    if (agentState?.phases) {
      const phases = Object.values(agentState.phases);
      const completedPhases = phases.filter(
        (p) => p.status === 'completed',
      ).length;
      completionPercentage = Math.round(
        (completedPhases / phases.length) * 100,
      );
    }

    return {
      projectName: manifest?.name ?? null,
      projectId: manifest?.id ?? null,
      currentPhase: agentState?.current_phase ?? null,
      characters: agentState?.characters ?? [],
      settings: agentState?.settings ?? [],
      scenes: agentState?.scenes ?? [],
      completionPercentage,
      isImageGenerationActive,
      isImageSyncV2Enabled,
    };
  }, [state, isImageGenerationActive, isImageSyncV2Enabled]);

  // Build context value
  const value = useMemo<ProjectContextType>(
    () => ({
      ...state,
      ...computed,
      loadProject,
      createProject,
      closeProject,
      updatePhase,
      updateSceneApproval,
      saveTimelineState,
      updatePlayhead,
      updateZoom,
      setActiveVersion,
      updateMarkers,
      updateImportedClips,
      updateImageTimingOverrides,
      updateInfographicTimingOverrides,
      updateVideoSplitOverrides,
      addAsset,
      refreshAssetManifest,
      subscribeImageProjection,
      getImageProjectionSnapshot,
      triggerImageProjectionReconcile,
      setExpectedImagePlacements,
    }),
    [
      state,
      computed,
      loadProject,
      createProject,
      closeProject,
      updatePhase,
      updateSceneApproval,
      saveTimelineState,
      updatePlayhead,
      updateZoom,
      setActiveVersion,
      updateMarkers,
      updateImportedClips,
      updateImageTimingOverrides,
      updateInfographicTimingOverrides,
      updateVideoSplitOverrides,
      addAsset,
      refreshAssetManifest,
      subscribeImageProjection,
      getImageProjectionSnapshot,
      triggerImageProjectionReconcile,
      setExpectedImagePlacements,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

/**
 * Hook to access project context
 */
export function useProject(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

/**
 * Hook to check if project is loaded
 */
export function useProjectLoaded(): boolean {
  const { isLoaded } = useProject();
  return isLoaded;
}

/**
 * Hook to get current scenes
 */
export function useProjectScenes(): SceneRef[] {
  const { scenes } = useProject();
  return scenes;
}

/**
 * Hook to get current characters
 */
export function useProjectCharacters(): CharacterData[] {
  const { characters } = useProject();
  return characters;
}

/**
 * Hook to get timeline state
 */
export function useProjectTimeline(): {
  timelineState: KshanaTimelineState;
  updatePlayhead: (seconds: number) => void;
  updateZoom: (level: number) => void;
  setActiveVersion: (
    sceneFolder: string,
    assetType: 'image' | 'video',
    version: number,
  ) => void;
} {
  const { timelineState, updatePlayhead, updateZoom, setActiveVersion } =
    useProject();
  return { timelineState, updatePlayhead, updateZoom, setActiveVersion };
}

export default ProjectContext;
