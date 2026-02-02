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

  /** Add an asset to the asset manifest */
  addAsset: (assetInfo: AssetInfo) => Promise<boolean>;

  /** Explicitly refresh the asset manifest from disk */
  refreshAssetManifest: () => Promise<void>;
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
  const connectingRef = useRef(false);
  const currentProjectDirRef = useRef<string | null>(null);

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
      console.log('[ProjectContext] Loading project from:', projectDirectory);
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      const result = await projectService.openProject(projectDirectory);

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
          // Add timestamp to ensure fresh reference for React re-renders
          assetManifest: project.assetManifest
            ? { ...project.assetManifest, _refreshedAt: Date.now() }
            : null,
          timelineState: project.timelineState,
          contextIndex: project.contextIndex,
        }));
        lastLoadedDir.current = projectDirectory;

        // Set up explicit watches for manifest and image-placements
        try {
          const manifestPath = `${projectDirectory}/.kshana/agent/manifest.json`;
          const imagePlacementsDir = `${projectDirectory}/.kshana/agent/image-placements`;

          await window.electron.project.watchManifest(manifestPath);
          await window.electron.project.watchImagePlacements(
            imagePlacementsDir,
          );
          console.log(
            '[ProjectContext] Set up explicit watches for manifest and image-placements',
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

  // Listen for file changes and reload project state when relevant files change
  useEffect(() => {
    if (!projectDirectory || !state.isLoaded) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;

      // Reload project when key files change
      if (
        filePath.includes('.kshana/agent/project.json') ||
        filePath.includes('.kshana/agent/manifest.json') ||
        filePath.includes('.kshana/context/index.json')
      ) {
        console.log('[ProjectContext] File change detected, will refresh:', filePath.includes('manifest.json') ? 'manifest.json (assets)' : filePath);
        // Clear existing timeout
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        // Debounce rapid file changes (100ms for faster real-time asset updates)
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
                // Always create new object reference to force React re-renders
                assetManifest: project.assetManifest
                  ? { ...project.assetManifest, _refreshedAt: Date.now() }
                  : null,
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
        }, 100); // 100ms debounce for faster real-time asset updates
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [projectDirectory, state.isLoaded]);

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
            // Always create new object reference to force React re-renders
            return {
              ...prev,
              assetManifest: newManifest
                ? { ...newManifest, _refreshedAt: Date.now() }
                : null,
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
  }, [projectDirectory, state.isLoaded]);

  // Listen for WebSocket asset_added events
  useEffect(() => {
    if (!projectDirectory || !state.isLoaded) {
      // Clean up if project directory is cleared
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      currentProjectDirRef.current = null;
      return;
    }

    // Skip if already connected to the same project directory
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      currentProjectDirRef.current === projectDirectory
    ) {
      return;
    }

    // Close existing connection if project directory changed
    if (wsRef.current && currentProjectDirRef.current !== projectDirectory) {
      wsRef.current.close();
      wsRef.current = null;
      currentProjectDirRef.current = null;
    }

    // Prevent concurrent connection attempts
    if (connectingRef.current) {
      return;
    }

    const connectWebSocket = async () => {
      try {
        connectingRef.current = true;
        const backendState = await window.electron.backend.getState();
        if (backendState.status !== 'ready') {
          console.log(
            '[ProjectContext] Backend not ready, skipping WebSocket connection',
          );
          connectingRef.current = false;
          return;
        }

        const wsUrl = `ws://localhost:${backendState.port || 8000}/api/v1/ws/chat?project_dir=${encodeURIComponent(projectDirectory)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        currentProjectDirRef.current = projectDirectory;

        ws.onopen = () => {
          console.log('[ProjectContext] WebSocket connected for asset events');
          connectingRef.current = false;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'asset_added' && message.data) {
              const assetData = message.data;
              console.log('[ProjectContext] Received asset_added event', {
                ...assetData,
                mechanism: 'websocket',
                timestamp: Date.now(),
              });
              // Wait for manifest write to complete, then refresh with retry
              setTimeout(async () => {
                try {
                  await refreshAssetManifest();
                } catch (error) {
                  console.error(
                    '[ProjectContext] Failed to refresh after asset_added:',
                    error,
                  );
                  // Retry once after additional delay
                  setTimeout(() => {
                    refreshAssetManifest().catch((err) =>
                      console.error(
                        '[ProjectContext] Retry refresh failed:',
                        err,
                      ),
                    );
                  }, 200);
                }
              }, 100); // Wait 100ms for manifest write
            } else if (message.type === 'status' && message.data) {
              // Track image generation activity based on status
              const { status } = message.data;
              const isActive = status === 'busy' || status === 'processing';
              setIsImageGenerationActive(isActive);
            } else if (message.type === 'tool_call' && message.data) {
              // Also track tool calls for image generation
              const { toolName } = message.data;
              if (
                toolName === 'generate_image' ||
                toolName === 'generate_all_images'
              ) {
                setIsImageGenerationActive(true);
              }
            }
          } catch (error) {
            // Not a JSON message or not a relevant event, ignore
          }
        };

        ws.onerror = (error) => {
          console.warn(
            '[ProjectContext] WebSocket error for asset events:',
            error,
          );
          connectingRef.current = false;
        };

        ws.onclose = () => {
          console.log('[ProjectContext] WebSocket closed for asset events');
          wsRef.current = null;
          connectingRef.current = false;

          // Only reconnect if project directory hasn't changed
          if (
            currentProjectDirRef.current === projectDirectory &&
            projectDirectory
          ) {
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              if (currentProjectDirRef.current === projectDirectory) {
                connectWebSocket();
              }
            }, 3000);
          } else {
            currentProjectDirRef.current = null;
          }
        };
      } catch (error) {
        console.warn(
          '[ProjectContext] Failed to connect WebSocket for asset events:',
          error,
        );
        connectingRef.current = false;
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Don't close WebSocket here - let it persist across re-renders
      // Only close if project directory actually changes (handled above)
    };
  }, [projectDirectory, state.isLoaded, refreshAssetManifest]);

  // Poll for manifest updates (fallback if file watcher/WebSocket miss changes)
  // Use consistent 500ms interval for reliable real-time updates - does not depend on isImageGenerationActive
  // which may not be set for ProjectContext's WebSocket connection
  useEffect(() => {
    if (!projectDirectory || !state.isLoaded) return;

    const POLL_INTERVAL_MS = 500; // Consistent 500ms for reliable detection
    const MAX_POLL_INTERVAL = 2000; // Max 2s on repeated failures
    const BACKOFF_MULTIPLIER = 1.5;
    let pollIntervalMs = POLL_INTERVAL_MS;
    let consecutiveFailures = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const pollForUpdates = async () => {
      if (isCancelled) return;

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
              console.log('[ProjectContext] ✓ Assets changed (polling)', {
                oldCount: prev.assetManifest?.assets?.length || 0,
                newCount: project.assetManifest?.assets?.length || 0,
                mechanism: 'polling',
                timestamp: Date.now(),
              });
              consecutiveFailures = 0;
              pollIntervalMs = POLL_INTERVAL_MS;
              // Always create new object reference to force React re-renders
              return {
                ...prev,
                assetManifest: project.assetManifest
                  ? { ...project.assetManifest, _refreshedAt: Date.now() }
                  : null,
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
        }
      } catch (error) {
        consecutiveFailures++;
        pollIntervalMs = Math.min(
          Math.floor(1000 * BACKOFF_MULTIPLIER ** consecutiveFailures),
          MAX_POLL_INTERVAL,
        );
        console.debug('[ProjectContext] Poll check failed:', error);
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
  }, [projectDirectory, state.isLoaded]);

  // Aggressive polling during image generation
  // This runs in parallel with baseline polling to catch rapid writes during generation
  useEffect(() => {
    if (!projectDirectory || !state.isLoaded || !isImageGenerationActive) return;

    const AGGRESSIVE_POLL_MS = 100;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const aggressivePoll = async () => {
      if (isCancelled) return;

      try {
        const result = await projectService.openProject(projectDirectory);
        if (result.success) {
          setState((prev) => {
            const assetsChanged = compareAssetManifests(
              prev.assetManifest,
              result.data.assetManifest,
            );

            if (assetsChanged) {
              console.log('[ProjectContext] ✓ Assets changed (aggressive poll)', {
                oldCount: prev.assetManifest?.assets?.length || 0,
                newCount: result.data.assetManifest?.assets?.length || 0,
                mechanism: 'aggressive-polling',
                timestamp: Date.now(),
              });
              return {
                ...prev,
                assetManifest: result.data.assetManifest
                  ? { ...result.data.assetManifest, _refreshedAt: Date.now() }
                  : null,
              };
            }
            return prev;
          });
        }
      } catch (error) {
        console.debug('[ProjectContext] Aggressive poll failed:', error);
      }

      if (!isCancelled) {
        timeoutId = setTimeout(aggressivePoll, AGGRESSIVE_POLL_MS);
      }
    };

    aggressivePoll();

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [projectDirectory, state.isLoaded, isImageGenerationActive]);

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
          // Add timestamp to ensure fresh reference for React re-renders
          assetManifest: project.assetManifest
            ? { ...project.assetManifest, _refreshedAt: Date.now() }
            : null,
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
          // Add timestamp to ensure fresh reference for React re-renders
          assetManifest: project.assetManifest
            ? { ...project.assetManifest, _refreshedAt: Date.now() }
            : null,
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
    };
  }, [state]);

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
      addAsset,
      refreshAssetManifest,
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
      addAsset,
      refreshAssetManifest,
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
