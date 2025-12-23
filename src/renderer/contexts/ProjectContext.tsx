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

  /** Whether using mock data */
  useMockData: boolean;
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

  /** Enable/disable mock data mode */
  setUseMockData: (useMock: boolean) => void;

  /** Load mock data directly */
  loadMockProject: () => void;

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
  setActiveVersion: (sceneFolder: string, version: number) => void;

  /** Update timeline markers */
  updateMarkers: (markers: KshanaTimelineState['markers']) => void;

  /** Update imported clips */
  updateImportedClips: (importedClips: KshanaTimelineState['imported_clips']) => void;

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
export type ProjectContextType = ProjectState & ProjectActions & ProjectComputed;

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
  useMockData: false,
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
  /** Start with mock data */
  initialMockData?: boolean;
}

/**
 * Project Provider component
 */
export function ProjectProvider({
  children,
  initialMockData = false,
}: ProjectProviderProps) {
  const [state, setState] = useState<ProjectState>(() => ({
    ...initialState,
    useMockData: initialMockData,
  }));

  // Get workspace context for sync
  const { projectDirectory } = useWorkspace();
  const lastLoadedDir = useRef<string | null>(null);

  // Sync mock data setting with service
  useEffect(() => {
    projectService.setUseMockData(state.useMockData);
  }, [state.useMockData]);

  // Sync with WorkspaceContext - auto-load mock data when directory changes
  useEffect(() => {
    if (!projectDirectory) {
      // Directory was cleared - close project
      if (lastLoadedDir.current) {
        projectService.closeProject();
        setState((prev) => ({
          ...initialState,
          useMockData: prev.useMockData,
        }));
        lastLoadedDir.current = null;
      }
      return;
    }

    // Don't reload if same directory
    if (projectDirectory === lastLoadedDir.current) return;

    // Auto-load with mock data when opening any project directory
    const loadWithMockData = async () => {
      setState((prev) => ({ ...prev, isLoading: true, error: null, useMockData: true }));
      projectService.setUseMockData(true);

      const result = await projectService.openProject(projectDirectory);

      if (result.success) {
        const project = result.data;
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          isLoading: false,
          error: null,
          useMockData: true,
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
          error: null,
          isLoaded: false,
        }));
        lastLoadedDir.current = null;
      }
    };

    loadWithMockData();
  }, [projectDirectory]);

  // Load project from directory
  const loadProject = useCallback(async (directory: string): Promise<boolean> => {
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
  }, []);

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
    setState({ ...initialState, useMockData: state.useMockData });
  }, [state.useMockData]);

  // Set mock data mode
  const setUseMockData = useCallback((useMock: boolean) => {
    setState((prev) => ({ ...prev, useMockData: useMock }));
  }, []);

  // Load mock project directly
  const loadMockProject = useCallback(() => {
    setState((prev) => ({ ...prev, useMockData: true }));
    projectService.setUseMockData(true);

    // Use a placeholder directory for mock data
    loadProject('/mock/desert-survival-story');
  }, [loadProject]);

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
      setState((prev) => ({ ...prev, timelineState }));
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

  // Set active version with auto-save
  const setActiveVersion = useCallback(
    (sceneFolder: string, version: number) => {
      setState((prev) => ({
        ...prev,
        timelineState: {
          ...prev.timelineState,
          active_versions: {
            ...prev.timelineState.active_versions,
            [sceneFolder]: version,
          },
        },
      }));
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
  const addAsset = useCallback(async (assetInfo: AssetInfo): Promise<boolean> => {
    const result = await projectService.addAssetToManifest(assetInfo);
    if (result.success) {
      setState((prev) => {
        if (!prev.assetManifest) return prev;
        // Check if asset already exists
        const existingIndex = prev.assetManifest.assets.findIndex(
          (asset) => asset.id === assetInfo.id,
        );
        const newAssets = existingIndex >= 0
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
  }, []);

  // Auto-save timeline state with debouncing
  useEffect(() => {
    if (!state.isLoaded || state.useMockData) return;

    const timeoutId = setTimeout(() => {
      saveTimelineState(state.timelineState);
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [
    state.timelineState.playhead_seconds,
    state.timelineState.zoom_level,
    state.timelineState.active_versions,
    state.timelineState.markers,
    state.timelineState.imported_clips,
    state.isLoaded,
    state.useMockData,
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
      completionPercentage = Math.round((completedPhases / phases.length) * 100);
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
      setUseMockData,
      loadMockProject,
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
      setUseMockData,
      loadMockProject,
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
  setActiveVersion: (sceneFolder: string, version: number) => void;
} {
  const { timelineState, updatePlayhead, updateZoom, setActiveVersion } =
    useProject();
  return { timelineState, updatePlayhead, updateZoom, setActiveVersion };
}

export default ProjectContext;

