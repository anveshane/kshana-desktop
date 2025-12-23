/**
 * Kshana Project Directory Types
 * Re-exports all types from the kshana/ folder
 *
 * Based on Kshana Project Directory Specification v1.0 (December 12, 2025)
 */

// Common types and enums
export type {
  WorkflowPhase,
  PhaseStatus,
  PlannerStage,
  ItemApprovalStatus,
  ContentStatus,
  ContextSource,
} from './common';

export { SCHEMA_VERSION, AGENT_PROJECT_VERSION } from './common';

// Root manifest (kshana.json)
export type {
  KshanaManifest,
  ProjectSettings,
  ProjectResolution,
} from './manifest';

export {
  DEFAULT_PROJECT_SETTINGS,
  createDefaultManifest,
} from './manifest';

// Entity types (characters, settings, scenes)
export type {
  CharacterData,
  SettingData,
  SceneRef,
  FinalVideoInfo,
} from './entities';

export {
  createDefaultCharacter,
  createDefaultSetting,
  createDefaultSceneRef,
} from './entities';

// Agent project file (.kshana/agent/project.json)
export type {
  AgentProjectFile,
  PhaseInfo,
  ContentEntry,
  ContentRegistry,
  WorkflowPhases,
} from './agentProject';

export {
  createDefaultPhaseInfo,
  createDefaultContentEntry,
  createDefaultWorkflowPhases,
  createDefaultContentRegistry,
  createDefaultAgentProject,
} from './agentProject';

// Asset manifest (.kshana/agent/manifest.json)
export type {
  AssetManifest,
  AssetInfo,
  AssetType,
} from './assetManifest';

export {
  createDefaultAssetManifest,
  createAssetInfo,
  getAssetsByType,
  getAssetsByScene,
  getLatestAsset,
} from './assetManifest';

// Timeline state (.kshana/ui/timeline.json)
export type {
  TimelineState as KshanaTimelineState,
  TimelineMarker as KshanaTimelineMarker,
  ImportedClip,
  ClipTrim,
  MarkerStatus,
  TrackType,
  SceneVersions,
} from './timeline';

export {
  DEFAULT_TIMELINE_STATE,
  createTimelineMarker,
  createImportedClip,
  setActiveVersion,
  getActiveVersion,
} from './timeline';

// Context index (.kshana/context/index.json)
export type {
  ContextIndex,
  StoredContextMeta,
} from './context';

export {
  createContextMeta,
  createDefaultContextIndex,
  upsertContextEntry,
  removeContextEntry,
  getContextEntries,
  getContextEntriesBySource,
} from './context';

/**
 * Complete project data structure for loading/saving
 */
export interface KshanaProject {
  /** Root manifest (kshana.json) */
  manifest: import('./manifest').KshanaManifest;

  /** Agent project state (.kshana/agent/project.json) */
  agentState: import('./agentProject').AgentProjectFile;

  /** Asset manifest (.kshana/agent/manifest.json) */
  assetManifest: import('./assetManifest').AssetManifest;

  /** Timeline state (.kshana/ui/timeline.json) */
  timelineState: import('./timeline').TimelineState;

  /** Context index (.kshana/context/index.json) */
  contextIndex: import('./context').ContextIndex;
}

/**
 * Project paths for file operations
 */
export const PROJECT_PATHS = {
  ROOT_MANIFEST: 'kshana.json',
  VIDEOS_IMPORTED: 'videos/imported',
  EXPORTS: 'exports',
  KSHANA_DIR: '.kshana',
  AGENT_DIR: '.kshana/agent',
  AGENT_PROJECT: '.kshana/agent/project.json',
  AGENT_MANIFEST: '.kshana/agent/manifest.json',
  AGENT_PLANS: '.kshana/agent/plans',
  AGENT_CHARACTERS: '.kshana/agent/characters',
  AGENT_SETTINGS: '.kshana/agent/settings',
  AGENT_SCENES: '.kshana/agent/scenes',
  AGENT_MUSIC: '.kshana/agent/music',
  AGENT_FINAL: '.kshana/agent/final',
  UI_DIR: '.kshana/ui',
  UI_TIMELINE: '.kshana/ui/timeline.json',
  CONTEXT_DIR: '.kshana/context',
  CONTEXT_INDEX: '.kshana/context/index.json',
  CONTEXT_CHUNKS: '.kshana/context/chunks',
} as const;

