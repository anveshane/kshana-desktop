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

  // Get workspace context for sync
  const { projectDirectory } = useWorkspace();
  const lastLoadedDir = useRef<string | null>(null);

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
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      const result = await projectService.openProject(projectDirectory);

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
        lastLoadedDir.current = projectDirectory;
      } else {
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
        // Clear existing timeout
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        // Debounce rapid file changes
        debounceTimeout = setTimeout(async () => {
          try {
            const result = await projectService.openProject(projectDirectory);
            if (result.success) {
              const project = result.data;
              setState((prev) => ({
                ...prev,
                manifest: project.manifest,
                agentState: project.agentState,
                assetManifest: project.assetManifest,
                timelineState: project.timelineState,
                contextIndex: project.contextIndex,
              }));
            } else {
              console.error('[ProjectContext] Failed to reload project:', result.error);
              // Don't show error to user - file might be temporarily locked
            }
          } catch (error) {
            console.error('[ProjectContext] Error reloading project:', error);
            // Don't show error to user - file might be temporarily locked
          }
        }, 300); // 300ms debounce
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [projectDirectory, state.isLoaded]);

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
