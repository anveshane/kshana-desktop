/**
 * Mock Agent Project State
 * Full AgentProjectFile for the "Desert Survival Story" project
 */

import type {
  AgentProjectFile,
  WorkflowPhases,
  ContentRegistry,
} from '../../../types/kshana';
import { MOCK_PROJECT_ID } from './mockProject';
import { createMockCharacters } from './mockCharacters';
import { createMockSettings } from './mockSettings';
import { createMockScenes } from './mockScenes';

/**
 * Mock workflow phases showing a project in the video generation stage
 */
export const MOCK_WORKFLOW_PHASES: WorkflowPhases = {
  plot: {
    status: 'completed',
    planner_stage: 'complete',
    plan_file: 'plans/plot.md',
    completed_at: Date.now() - 86400000 * 7,
    refinement_count: 1,
  },
  story: {
    status: 'completed',
    planner_stage: 'complete',
    plan_file: 'plans/story.md',
    completed_at: Date.now() - 86400000 * 6,
    refinement_count: 2,
  },
  characters_settings: {
    status: 'completed',
    planner_stage: 'complete',
    completed_at: Date.now() - 86400000 * 5,
    refinement_count: 0,
  },
  scenes: {
    status: 'completed',
    planner_stage: 'complete',
    plan_file: 'plans/scenes.md',
    completed_at: Date.now() - 86400000 * 4,
    refinement_count: 1,
  },
  character_setting_images: {
    status: 'completed',
    completed_at: Date.now() - 86400000 * 3,
    refinement_count: 0,
  },
  scene_images: {
    status: 'completed',
    completed_at: Date.now() - 86400000 * 2,
    refinement_count: 1,
  },
  video: {
    status: 'in_progress',
    completed_at: null,
    refinement_count: 0,
  },
  video_combine: {
    status: 'pending',
    completed_at: null,
  },
};

/**
 * Mock content registry showing available content
 */
export const MOCK_CONTENT_REGISTRY: ContentRegistry = {
  plot: {
    status: 'available',
    file: 'plans/plot.md',
  },
  story: {
    status: 'available',
    file: 'plans/story.md',
  },
  characters: {
    status: 'available',
    file: 'plans/characters.md',
    items: ['alice-chen', 'marcus-webb', 'fatima-hassan'],
    item_files: {
      'alice-chen': 'characters/alice-chen/character.md',
      'marcus-webb': 'characters/marcus-webb/character.md',
      'fatima-hassan': 'characters/fatima-hassan/character.md',
    },
  },
  settings: {
    status: 'available',
    file: 'plans/settings.md',
    items: ['dusty-village', 'desert-camp', 'underground-tomb'],
    item_files: {
      'dusty-village': 'settings/dusty-village/setting.md',
      'desert-camp': 'settings/desert-camp/setting.md',
      'underground-tomb': 'settings/underground-tomb/setting.md',
    },
  },
  scenes: {
    status: 'available',
    file: 'plans/scenes.md',
    items: [
      'scene-001',
      'scene-002',
      'scene-003',
      'scene-004',
      'scene-005',
      'scene-006',
    ],
    item_files: {
      'scene-001': 'scenes/scene-001/scene.md',
      'scene-002': 'scenes/scene-002/scene.md',
      'scene-003': 'scenes/scene-003/scene.md',
      'scene-004': 'scenes/scene-004/scene.md',
      'scene-005': 'scenes/scene-005/scene.md',
      'scene-006': 'scenes/scene-006/scene.md',
    },
  },
  images: {
    status: 'available',
    file: '',
    items: [
      'scene_001_image',
      'scene_002_image',
      'scene_003_image',
      'scene_004_image',
    ],
  },
  videos: {
    status: 'partial',
    file: '',
    items: [
      'scene_001_video_v2',
      'scene_002_video_v1',
      'scene_003_video_v3',
    ],
  },
  audio: {
    status: 'partial',
    file: '',
    items: ['scene_001_audio_mix', 'scene_002_audio_mix'],
  },
  captions: {
    status: 'partial',
    file: '',
    items: ['scene_001_caption', 'scene_002_caption'],
  },
};

/**
 * Creates the full mock agent project file
 */
export function createMockAgentProject(): AgentProjectFile {
  const now = Date.now();

  return {
    version: '2.0',
    id: MOCK_PROJECT_ID,
    title: 'Desert Survival Story',
    original_input_file: 'original_input.md',
    created_at: now - 86400000 * 7, // 7 days ago
    updated_at: now,
    current_phase: 'video',
    phases: { ...MOCK_WORKFLOW_PHASES },
    content: { ...MOCK_CONTENT_REGISTRY },
    characters: createMockCharacters(),
    settings: createMockSettings(),
    scenes: createMockScenes(),
    assets: [
      // Character assets
      'char_alice_ref_001',
      'char_marcus_ref_001',
      'char_fatima_ref_001',
      // Setting assets
      'set_dusty_village_ref_001',
      'set_desert_camp_ref_001',
      // Scene assets
      'scene_001_image',
      'scene_001_video_v1',
      'scene_001_video_v2',
      'scene_002_image',
      'scene_002_video_v1',
      'scene_003_image',
      'scene_003_video_v1',
      'scene_003_video_v2',
      'scene_003_video_v3',
      'scene_004_image',
    ],
  };
}

/**
 * Creates a fresh/empty agent project
 */
export function createEmptyAgentProject(
  id: string,
  title: string,
): AgentProjectFile {
  const now = Date.now();

  return {
    version: '2.0',
    id,
    title,
    original_input_file: 'original_input.md',
    created_at: now,
    updated_at: now,
    current_phase: 'plot',
    phases: {
      plot: { status: 'pending', completed_at: null },
      story: { status: 'pending', completed_at: null },
      characters_settings: { status: 'pending', completed_at: null },
      scenes: { status: 'pending', completed_at: null },
      character_setting_images: { status: 'pending', completed_at: null },
      scene_images: { status: 'pending', completed_at: null },
      video: { status: 'pending', completed_at: null },
      video_combine: { status: 'pending', completed_at: null },
    },
    content: {
      plot: { status: 'missing', file: 'plans/plot.md' },
      story: { status: 'missing', file: 'plans/story.md' },
      characters: { status: 'missing', file: 'plans/characters.md' },
      settings: { status: 'missing', file: 'plans/settings.md' },
      scenes: { status: 'missing', file: 'plans/scenes.md' },
      images: { status: 'missing', file: '' },
      videos: { status: 'missing', file: '' },
      audio: { status: 'missing', file: '' },
      captions: { status: 'missing', file: '' },
    },
    characters: [],
    settings: [],
    scenes: [],
    assets: [],
  };
}

/**
 * Gets the completion percentage of the project
 */
export function getProjectCompletionPercentage(
  project: AgentProjectFile,
): number {
  const phases = Object.values(project.phases);
  const completedPhases = phases.filter((p) => p.status === 'completed').length;
  return Math.round((completedPhases / phases.length) * 100);
}

/**
 * Gets the next incomplete phase
 */
export function getNextIncompletePhase(
  project: AgentProjectFile,
): keyof WorkflowPhases | null {
  const phaseOrder: (keyof WorkflowPhases)[] = [
    'plot',
    'story',
    'characters_settings',
    'scenes',
    'character_setting_images',
    'scene_images',
    'video',
    'video_combine',
  ];

  for (const phase of phaseOrder) {
    if (project.phases[phase].status !== 'completed') {
      return phase;
    }
  }

  return null;
}

