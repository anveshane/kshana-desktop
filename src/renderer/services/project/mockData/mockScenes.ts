/**
 * Mock Scene Data
 * Scenes for the "Desert Survival Story" project
 */

import type { SceneRef } from '../../../types/kshana';
import {
  getTestImageForScene,
  getTestVideoForScene,
  resolveTestAssetPath,
} from './testAssetMapping';

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
  image_path: (() => {
    const testImage = getTestImageForScene('scene-001');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/scenes/scene-001/image.png';
  })(),
  image_prompt:
    'Close-up of hands brushing sand away from a golden artifact with ancient symbols, warm sunset lighting, archaeological excavation site',
  image_approved_at: Date.now() - 86400000 * 3,

  video_approval_status: 'approved',
  video_artifact_id: 'scene_001_video_v2',
  video_path: (() => {
    const testVideo = getTestVideoForScene(1, 2);
    return resolveTestAssetPath('video', testVideo);
  })(),
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
  image_path: (() => {
    const testImage = getTestImageForScene('scene-002');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/scenes/scene-002/image.png';
  })(),
  image_prompt:
    'Weathered expedition guide examining golden artifact with concerned expression, desert camp background, dramatic lighting',
  image_approved_at: Date.now() - 86400000 * 3,

  video_approval_status: 'approved',
  video_artifact_id: 'scene_002_video_v1',
  video_path: (() => {
    const testVideo = getTestVideoForScene(2, 1);
    return resolveTestAssetPath('video', testVideo);
  })(),
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
  image_path: (() => {
    const testImage = getTestImageForScene('scene-003');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/scenes/scene-003/image.png';
  })(),
  image_prompt:
    'Female linguist at desk with ancient texts, lamp light illuminating papers, moment of discovery expression, research tent interior',
  image_approved_at: Date.now() - 86400000 * 3,

  video_approval_status: 'in_review',
  video_artifact_id: 'scene_003_video_v3',
  video_path: (() => {
    const testVideo = getTestVideoForScene(3, 3);
    return resolveTestAssetPath('video', testVideo);
  })(),

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
  image_path: (() => {
    const testImage = getTestImageForScene('scene-004');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/scenes/scene-004/image.png';
  })(),
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
  image_path: (() => {
    const testImage = getTestImageForScene('scene-005');
    return testImage
      ? resolveTestAssetPath('image', testImage)
      : '.kshana/agent/scenes/scene-005/image.png';
  })(),
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

/**
 * Extracts character names from scene description
 */
function extractCharacters(scene: SceneRef): string[] {
  const description = scene.description?.toLowerCase() || '';
  const characters: string[] = [];

  // Extract known character names from description
  if (description.includes('alice')) {
    characters.push('Alice Chen');
  }
  if (description.includes('marcus')) {
    characters.push('Marcus Webb');
  }
  if (description.includes('fatima') || description.includes('dr.')) {
    characters.push('Dr. Fatima Hassan');
  }

  // If no characters found, use "The Team" for group scenes
  if (characters.length === 0 && description.includes('team')) {
    characters.push('The Team');
  }

  return characters.length > 0 ? characters : ['Alice Chen']; // Default to Alice
}

/**
 * Infers location from scene description
 */
function inferLocation(scene: SceneRef): string {
  const description = scene.description?.toLowerCase() || '';

  if (description.includes('excavation') || description.includes('artifact')) {
    return 'Desert excavation site';
  }
  if (description.includes('camp')) {
    return 'Desert camp';
  }
  if (description.includes('village')) {
    return 'Dusty village';
  }
  if (
    description.includes('tomb') ||
    description.includes('entrance') ||
    description.includes('well')
  ) {
    return 'Underground tomb entrance';
  }
  if (description.includes('dunes') || description.includes('sahara')) {
    return 'Sahara Desert';
  }
  if (description.includes('tent') || description.includes('research')) {
    return 'Research tent';
  }

  return 'Desert location'; // Default
}

/**
 * Infers mood from scene description
 */
function inferMood(scene: SceneRef): string {
  const description = scene.description?.toLowerCase() || '';

  if (description.includes('troubled') || description.includes('warn')) {
    return 'Concerned';
  }
  if (description.includes('discover') || description.includes('find')) {
    return 'Tense';
  }
  if (description.includes('vast') || description.includes('empty')) {
    return 'Reflective';
  }
  if (description.includes('howls') || description.includes('darkness')) {
    return 'Mysterious';
  }

  return 'Tense'; // Default
}

/**
 * Infers shot type from image prompt or description
 */
function inferShotType(scene: SceneRef): string {
  const prompt = scene.image_prompt?.toLowerCase() || '';
  const description = scene.description?.toLowerCase() || '';

  if (prompt.includes('close-up') || description.includes('close')) {
    return 'Close-up';
  }
  if (prompt.includes('wide shot') || description.includes('vast')) {
    return 'Wide Shot';
  }
  if (prompt.includes('mid')) {
    return 'Mid Shot';
  }

  return 'Mid Shot'; // Default
}

/**
 * Infers dialogue from scene description
 */
function inferDialogue(scene: SceneRef): string {
  const description = scene.description || '';

  // Scene 1 has specific dialogue mentioned
  if (scene.scene_number === 1) {
    return '(whispering) "This can\'t be real..."';
  }

  // Scene 2 mentions warning
  if (scene.scene_number === 2) {
    return 'Marcus: "We need to be careful with ancient artifacts."';
  }

  // Other scenes don't have explicit dialogue in the mock data
  return '';
}

/**
 * Generates markdown content for a scene's scene.md file
 * Follows the Kshana Project Directory Specification v1.0 format
 */
export function generateSceneMarkdown(scene: SceneRef): string {
  const title = scene.title || `Scene ${scene.scene_number}`;
  const description = scene.description || 'No description available.';
  const characters = extractCharacters(scene);
  const location = inferLocation(scene);
  const mood = inferMood(scene);
  const duration = '5 seconds'; // Default duration per spec example
  const shotType = inferShotType(scene);
  const imagePrompt = scene.image_prompt || 'No image prompt available.';
  const dialogue = inferDialogue(scene);

  return `# Scene ${scene.scene_number}: ${title}

## Description

${description}

## Characters

${characters.map((char) => `- ${char}`).join('\n')}

## Location

${location}

## Mood

${mood}

## Duration

${duration}

## Shot Type

${shotType}

## Image Prompt

${imagePrompt}
${dialogue ? `\n## Dialogue\n\n${dialogue}` : ''}
`;
}

/**
 * Generates markdown content for all scenes
 */
export function generateAllSceneMarkdowns(): Record<string, string> {
  const markdowns: Record<string, string> = {};
  for (const scene of MOCK_SCENES) {
    markdowns[scene.folder] = generateSceneMarkdown(scene);
  }
  return markdowns;
}
