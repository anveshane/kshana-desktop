/**
 * Mock Scene Data
 * Scenes for the "Desert Survival Story" project
 */

import type { SceneRef } from '../../../types/kshana';

/**
 * Scene 1: The Discovery
 */
export const SCENE_001: SceneRef = {
  scene_number: 1,
  folder: 'scene-001',
  title: 'The Discovery',
  description:
    'Alice brushes sand off a golden artifact half-buried in the excavation site. Her eyes widen as ancient symbols catch the light.',

  content_approval_status: 'approved',
  content_artifact_id: 'scene_001_content',
  content_approved_at: Date.now() - 86400000 * 4,

  image_approval_status: 'approved',
  image_artifact_id: 'scene_001_image',
  image_path: '.kshana/agent/scenes/scene-001/image.png',
  image_prompt:
    'Close-up of hands brushing sand away from a golden artifact with ancient symbols, warm sunset lighting, archaeological excavation site',
  image_approved_at: Date.now() - 86400000 * 3,

  video_approval_status: 'approved',
  video_artifact_id: 'scene_001_video_v2',
  video_path: '.kshana/agent/scenes/scene-001/video/v2.mp4',
  video_approved_at: Date.now() - 86400000 * 2,

  audio_approval_status: 'approved',
  audio_mix_artifact_id: 'scene_001_audio_mix',
  audio_mix_path: '.kshana/agent/scenes/scene-001/audio/mix.mp3',
  audio_approved_at: Date.now() - 86400000,

  transcript_artifact_id: 'scene_001_transcript',
  transcript_path: '.kshana/agent/scenes/scene-001/audio/transcript.md',
  caption_artifact_id: 'scene_001_caption',
  caption_path: '.kshana/agent/scenes/scene-001/audio/transcript.vtt',

  regeneration_count: 2,
};

/**
 * Scene 2: The Warning
 */
export const SCENE_002: SceneRef = {
  scene_number: 2,
  folder: 'scene-002',
  title: 'The Warning',
  description:
    'Marcus examines the artifact with a troubled expression. He warns Alice about disturbing ancient burial sites.',

  content_approval_status: 'approved',
  content_artifact_id: 'scene_002_content',
  content_approved_at: Date.now() - 86400000 * 4,

  image_approval_status: 'approved',
  image_artifact_id: 'scene_002_image',
  image_path: '.kshana/agent/scenes/scene-002/image.png',
  image_prompt:
    'Weathered expedition guide examining golden artifact with concerned expression, desert camp background, dramatic lighting',
  image_approved_at: Date.now() - 86400000 * 3,

  video_approval_status: 'approved',
  video_artifact_id: 'scene_002_video_v1',
  video_path: '.kshana/agent/scenes/scene-002/video/v1.mp4',
  video_approved_at: Date.now() - 86400000 * 2,

  audio_approval_status: 'approved',
  audio_mix_artifact_id: 'scene_002_audio_mix',
  audio_mix_path: '.kshana/agent/scenes/scene-002/audio/mix.mp3',
  audio_approved_at: Date.now() - 86400000,

  regeneration_count: 0,
};

/**
 * Scene 3: The Translation
 */
export const SCENE_003: SceneRef = {
  scene_number: 3,
  folder: 'scene-003',
  title: 'The Translation',
  description:
    'Dr. Fatima works late into the night, surrounded by books and notes. She finally deciphers the symbols, revealing a map to a hidden tomb.',

  content_approval_status: 'approved',
  content_artifact_id: 'scene_003_content',
  content_approved_at: Date.now() - 86400000 * 4,

  image_approval_status: 'approved',
  image_artifact_id: 'scene_003_image',
  image_path: '.kshana/agent/scenes/scene-003/image.png',
  image_prompt:
    'Female linguist at desk with ancient texts, lamp light illuminating papers, moment of discovery expression, research tent interior',
  image_approved_at: Date.now() - 86400000 * 3,

  video_approval_status: 'in_review',
  video_artifact_id: 'scene_003_video_v3',
  video_path: '.kshana/agent/scenes/scene-003/video/v3.mp4',

  audio_approval_status: 'pending',

  regeneration_count: 3,
  feedback: 'The lighting needs to be warmer to match the lamp aesthetic',
};

/**
 * Scene 4: Journey Through the Dunes
 */
export const SCENE_004: SceneRef = {
  scene_number: 4,
  folder: 'scene-004',
  title: 'Journey Through the Dunes',
  description:
    'The team traverses endless golden dunes at sunrise. The vast emptiness of the Sahara stretches before them.',

  content_approval_status: 'approved',
  content_artifact_id: 'scene_004_content',
  content_approved_at: Date.now() - 86400000 * 4,

  image_approval_status: 'approved',
  image_artifact_id: 'scene_004_image',
  image_path: '.kshana/agent/scenes/scene-004/image.png',
  image_prompt:
    'Wide shot of expedition vehicles crossing massive sand dunes at sunrise, golden light, dramatic scale',
  image_approved_at: Date.now() - 86400000 * 2,

  video_approval_status: 'pending',

  regeneration_count: 0,
};

/**
 * Scene 5: The Abandoned Village
 */
export const SCENE_005: SceneRef = {
  scene_number: 5,
  folder: 'scene-005',
  title: 'The Abandoned Village',
  description:
    'The team arrives at the dusty village from the map. Wind howls through empty streets as they explore the ruins.',

  content_approval_status: 'approved',
  content_artifact_id: 'scene_005_content',
  content_approved_at: Date.now() - 86400000 * 3,

  image_approval_status: 'in_review',
  image_artifact_id: 'scene_005_image_v2',
  image_path: '.kshana/agent/scenes/scene-005/image.png',
  image_prompt:
    'Abandoned desert village with crumbling adobe buildings, expedition team entering cautiously, late afternoon shadows',

  video_approval_status: 'pending',

  regeneration_count: 1,
  feedback: 'The village needs to look more weathered and ancient',
};

/**
 * Scene 6: The Tomb Entrance
 */
export const SCENE_006: SceneRef = {
  scene_number: 6,
  folder: 'scene-006',
  title: 'The Tomb Entrance',
  description:
    'Alice discovers a hidden entrance beneath the village well. Torchlight reveals ancient stone steps descending into darkness.',

  content_approval_status: 'in_review',
  content_artifact_id: 'scene_006_content',

  image_approval_status: 'pending',

  video_approval_status: 'pending',

  regeneration_count: 0,
};

/**
 * All mock scenes
 */
export const MOCK_SCENES: SceneRef[] = [
  SCENE_001,
  SCENE_002,
  SCENE_003,
  SCENE_004,
  SCENE_005,
  SCENE_006,
];

/**
 * Creates a copy of mock scenes with fresh timestamps
 */
export function createMockScenes(): SceneRef[] {
  const now = Date.now();
  return MOCK_SCENES.map((scene, index) => ({
    ...scene,
    content_approved_at: scene.content_approved_at
      ? now - 86400000 * (6 - index)
      : undefined,
    image_approved_at: scene.image_approved_at
      ? now - 86400000 * (5 - index)
      : undefined,
    video_approved_at: scene.video_approved_at
      ? now - 86400000 * (4 - index)
      : undefined,
    audio_approved_at: scene.audio_approved_at
      ? now - 86400000 * (3 - index)
      : undefined,
  }));
}

/**
 * Gets the number of scenes in each approval state
 */
export function getSceneApprovalStats(scenes: SceneRef[]): {
  content: { approved: number; pending: number; inReview: number };
  image: { approved: number; pending: number; inReview: number };
  video: { approved: number; pending: number; inReview: number };
  audio: { approved: number; pending: number; inReview: number };
} {
  const countStatus = (
    items: SceneRef[],
    getStatus: (s: SceneRef) => string | undefined,
  ) => ({
    approved: items.filter((s) => getStatus(s) === 'approved').length,
    pending: items.filter(
      (s) => getStatus(s) === 'pending' || getStatus(s) === undefined,
    ).length,
    inReview: items.filter((s) => getStatus(s) === 'in_review').length,
  });

  return {
    content: countStatus(scenes, (s) => s.content_approval_status),
    image: countStatus(scenes, (s) => s.image_approval_status),
    video: countStatus(scenes, (s) => s.video_approval_status),
    audio: countStatus(scenes, (s) => s.audio_approval_status),
  };
}

