/**
 * Mock Data Index
 * Unified mock project generator for Kshana frontend development
 */

import type { KshanaProject } from '../../../types/kshana';
import {
  createMockManifest,
  createMockManifestWithName,
  MOCK_PROJECT_ID,
  KSHANA_VERSION,
} from './mockProject';
import {
  createMockAgentProject,
  createEmptyAgentProject,
  getProjectCompletionPercentage,
  getNextIncompletePhase,
} from './mockAgentState';
import {
  createMockCharacters,
  MOCK_CHARACTERS,
  ALICE_CHEN,
  MARCUS_WEBB,
  FATIMA_HASSAN,
} from './mockCharacters';
import {
  createMockSettings,
  MOCK_SETTINGS,
  DUSTY_VILLAGE,
  DESERT_CAMP,
  UNDERGROUND_TOMB,
} from './mockSettings';
import {
  createMockScenes,
  MOCK_SCENES,
  getSceneApprovalStats,
} from './mockScenes';
import {
  createMockAssetManifest,
  MOCK_ASSETS,
  getAssetsGroupedByType,
  getSceneVideoVersions,
} from './mockAssets';
import {
  createMockTimelineState,
  createEmptyTimelineState,
  MOCK_MARKERS,
  MOCK_IMPORTED_CLIPS,
  getMarkerStats,
  calculateTimelineDuration,
} from './mockTimeline';
import {
  createMockContextIndex,
  createEmptyContextIndex,
  getTotalContextSize,
  getContextEntriesSorted,
} from './mockContext';

// Re-export individual mock creators
export {
  // Project manifest
  createMockManifest,
  createMockManifestWithName,
  MOCK_PROJECT_ID,
  KSHANA_VERSION,
  // Agent state
  createMockAgentProject,
  createEmptyAgentProject,
  getProjectCompletionPercentage,
  getNextIncompletePhase,
  // Characters
  createMockCharacters,
  MOCK_CHARACTERS,
  ALICE_CHEN,
  MARCUS_WEBB,
  FATIMA_HASSAN,
  // Settings
  createMockSettings,
  MOCK_SETTINGS,
  DUSTY_VILLAGE,
  DESERT_CAMP,
  UNDERGROUND_TOMB,
  // Scenes
  createMockScenes,
  MOCK_SCENES,
  getSceneApprovalStats,
  // Assets
  createMockAssetManifest,
  MOCK_ASSETS,
  getAssetsGroupedByType,
  getSceneVideoVersions,
  // Timeline
  createMockTimelineState,
  createEmptyTimelineState,
  MOCK_MARKERS,
  MOCK_IMPORTED_CLIPS,
  getMarkerStats,
  calculateTimelineDuration,
  // Context
  createMockContextIndex,
  createEmptyContextIndex,
  getTotalContextSize,
  getContextEntriesSorted,
};

/**
 * Creates a complete mock KshanaProject with all components
 * This is the main entry point for getting mock data in the UI
 */
export function createMockKshanaProject(): KshanaProject {
  return {
    manifest: createMockManifest(),
    agentState: createMockAgentProject(),
    assetManifest: createMockAssetManifest(),
    timelineState: createMockTimelineState(),
    contextIndex: createMockContextIndex(),
  };
}

/**
 * Creates an empty/fresh KshanaProject for new project creation
 */
export function createEmptyKshanaProject(
  name: string,
  description?: string,
): KshanaProject {
  const manifest = createMockManifestWithName(name, description);

  return {
    manifest,
    agentState: createEmptyAgentProject(manifest.id, name),
    assetManifest: { schema_version: '1', assets: [] },
    timelineState: createEmptyTimelineState(),
    contextIndex: createEmptyContextIndex(),
  };
}

/**
 * Gets a summary of the mock project for debugging/display
 */
export function getMockProjectSummary(): {
  projectName: string;
  projectId: string;
  currentPhase: string;
  completionPercentage: number;
  characterCount: number;
  settingCount: number;
  sceneCount: number;
  assetCount: number;
  contextSize: number;
} {
  const project = createMockKshanaProject();

  return {
    projectName: project.manifest.name,
    projectId: project.manifest.id,
    currentPhase: project.agentState.current_phase,
    completionPercentage: getProjectCompletionPercentage(project.agentState),
    characterCount: project.agentState.characters.length,
    settingCount: project.agentState.settings.length,
    sceneCount: project.agentState.scenes.length,
    assetCount: project.assetManifest.assets.length,
    contextSize: getTotalContextSize(project.contextIndex),
  };
}

/**
 * Type guard to check if a project has mock data characteristics
 */
export function isMockProject(projectId: string): boolean {
  return projectId === MOCK_PROJECT_ID;
}

