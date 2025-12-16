/**
 * Mock Asset Manifest Data
 * All assets for the "Desert Survival Story" project
 */

import type { AssetManifest, AssetInfo, AssetType } from '../../../types/kshana';

/**
 * Helper to create asset info with consistent structure
 */
function createAsset(
  id: string,
  type: AssetType,
  path: string,
  version: number,
  options?: {
    entity_slug?: string;
    scene_number?: number;
    metadata?: Record<string, unknown>;
  },
): AssetInfo {
  return {
    id,
    type,
    path,
    version,
    created_at: Date.now() - Math.random() * 86400000 * 7, // Random time in last 7 days
    ...options,
  };
}

/**
 * Character reference images
 */
const CHARACTER_ASSETS: AssetInfo[] = [
  createAsset(
    'char_alice_ref_001',
    'character_ref',
    '.kshana/agent/characters/alice-chen/reference.png',
    1,
    {
      entity_slug: 'alice-chen',
      metadata: {
        prompt:
          '28-year-old female archaeologist, long black hair in ponytail, athletic build, khaki field jacket',
        seed: 42,
        model: 'flux-dev',
      },
    },
  ),
  createAsset(
    'char_marcus_ref_001',
    'character_ref',
    '.kshana/agent/characters/marcus-webb/reference.png',
    1,
    {
      entity_slug: 'marcus-webb',
      metadata: {
        prompt:
          '45-year-old male expedition guide, gray hair, weathered face, desert camouflage',
        seed: 123,
        model: 'flux-dev',
      },
    },
  ),
  createAsset(
    'char_fatima_ref_001',
    'character_ref',
    '.kshana/agent/characters/fatima-hassan/reference.png',
    1,
    { entity_slug: 'fatima-hassan' },
  ),
];

/**
 * Setting reference images
 */
const SETTING_ASSETS: AssetInfo[] = [
  createAsset(
    'set_dusty_village_ref_001',
    'setting_ref',
    '.kshana/agent/settings/dusty-village/reference.png',
    1,
    {
      entity_slug: 'dusty-village',
      metadata: {
        prompt:
          'Abandoned desert village, adobe buildings, golden hour, tumbleweeds',
        seed: 789,
      },
    },
  ),
  createAsset(
    'set_desert_camp_ref_001',
    'setting_ref',
    '.kshana/agent/settings/desert-camp/reference.png',
    1,
    { entity_slug: 'desert-camp' },
  ),
];

/**
 * Scene images (storyboard keyframes)
 */
const SCENE_IMAGE_ASSETS: AssetInfo[] = [
  createAsset(
    'scene_001_image',
    'scene_image',
    '.kshana/agent/scenes/scene-001/image.png',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_002_image',
    'scene_image',
    '.kshana/agent/scenes/scene-002/image.png',
    1,
    { scene_number: 2 },
  ),
  createAsset(
    'scene_003_image',
    'scene_image',
    '.kshana/agent/scenes/scene-003/image.png',
    1,
    { scene_number: 3 },
  ),
  createAsset(
    'scene_004_image',
    'scene_image',
    '.kshana/agent/scenes/scene-004/image.png',
    1,
    { scene_number: 4 },
  ),
  createAsset(
    'scene_005_image_v1',
    'scene_image',
    '.kshana/agent/scenes/scene-005/image-v1.png',
    1,
    { scene_number: 5 },
  ),
  createAsset(
    'scene_005_image_v2',
    'scene_image',
    '.kshana/agent/scenes/scene-005/image.png',
    2,
    { scene_number: 5 },
  ),
];

/**
 * Scene thumbnails (auto-generated for UI)
 */
const SCENE_THUMBNAIL_ASSETS: AssetInfo[] = [
  createAsset(
    'scene_001_thumb',
    'scene_thumbnail',
    '.kshana/agent/scenes/scene-001/thumbnail.jpg',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_002_thumb',
    'scene_thumbnail',
    '.kshana/agent/scenes/scene-002/thumbnail.jpg',
    1,
    { scene_number: 2 },
  ),
  createAsset(
    'scene_003_thumb',
    'scene_thumbnail',
    '.kshana/agent/scenes/scene-003/thumbnail.jpg',
    1,
    { scene_number: 3 },
  ),
  createAsset(
    'scene_004_thumb',
    'scene_thumbnail',
    '.kshana/agent/scenes/scene-004/thumbnail.jpg',
    1,
    { scene_number: 4 },
  ),
];

/**
 * Scene videos (versioned)
 */
const SCENE_VIDEO_ASSETS: AssetInfo[] = [
  // Scene 1 videos (v1 and v2)
  createAsset(
    'scene_001_video_v1',
    'scene_video',
    '.kshana/agent/scenes/scene-001/video/v1.mp4',
    1,
    {
      scene_number: 1,
      metadata: { duration: 5.2, prompt: 'discovery scene', seed: 111 },
    },
  ),
  createAsset(
    'scene_001_video_v2',
    'scene_video',
    '.kshana/agent/scenes/scene-001/video/v2.mp4',
    2,
    {
      scene_number: 1,
      metadata: {
        duration: 5.0,
        prompt: 'discovery scene improved lighting',
        seed: 222,
      },
    },
  ),
  // Scene 2 video
  createAsset(
    'scene_002_video_v1',
    'scene_video',
    '.kshana/agent/scenes/scene-002/video/v1.mp4',
    1,
    { scene_number: 2, metadata: { duration: 4.5 } },
  ),
  // Scene 3 videos (multiple versions from regeneration)
  createAsset(
    'scene_003_video_v1',
    'scene_video',
    '.kshana/agent/scenes/scene-003/video/v1.mp4',
    1,
    { scene_number: 3, metadata: { duration: 6.0 } },
  ),
  createAsset(
    'scene_003_video_v2',
    'scene_video',
    '.kshana/agent/scenes/scene-003/video/v2.mp4',
    2,
    { scene_number: 3, metadata: { duration: 5.8 } },
  ),
  createAsset(
    'scene_003_video_v3',
    'scene_video',
    '.kshana/agent/scenes/scene-003/video/v3.mp4',
    3,
    { scene_number: 3, metadata: { duration: 5.5 } },
  ),
];

/**
 * Scene audio assets
 */
const SCENE_AUDIO_ASSETS: AssetInfo[] = [
  // Scene 1 audio
  createAsset(
    'scene_001_dialogue',
    'scene_dialogue_audio',
    '.kshana/agent/scenes/scene-001/audio/dialogue.mp3',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_001_music',
    'scene_music',
    '.kshana/agent/scenes/scene-001/audio/music.mp3',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_001_sfx_wind',
    'scene_sfx',
    '.kshana/agent/scenes/scene-001/audio/sfx-wind.mp3',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_001_audio_mix',
    'scene_audio_mix',
    '.kshana/agent/scenes/scene-001/audio/mix.mp3',
    1,
    { scene_number: 1 },
  ),
  // Scene 2 audio
  createAsset(
    'scene_002_dialogue',
    'scene_dialogue_audio',
    '.kshana/agent/scenes/scene-002/audio/dialogue.mp3',
    1,
    { scene_number: 2 },
  ),
  createAsset(
    'scene_002_audio_mix',
    'scene_audio_mix',
    '.kshana/agent/scenes/scene-002/audio/mix.mp3',
    1,
    { scene_number: 2 },
  ),
];

/**
 * Caption/Transcript assets
 */
const CAPTION_ASSETS: AssetInfo[] = [
  createAsset(
    'scene_001_transcript',
    'scene_transcript',
    '.kshana/agent/scenes/scene-001/audio/transcript.md',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_001_caption',
    'scene_caption',
    '.kshana/agent/scenes/scene-001/audio/transcript.vtt',
    1,
    { scene_number: 1 },
  ),
  createAsset(
    'scene_002_transcript',
    'scene_transcript',
    '.kshana/agent/scenes/scene-002/audio/transcript.md',
    1,
    { scene_number: 2 },
  ),
];

/**
 * All mock assets combined
 */
export const MOCK_ASSETS: AssetInfo[] = [
  ...CHARACTER_ASSETS,
  ...SETTING_ASSETS,
  ...SCENE_IMAGE_ASSETS,
  ...SCENE_THUMBNAIL_ASSETS,
  ...SCENE_VIDEO_ASSETS,
  ...SCENE_AUDIO_ASSETS,
  ...CAPTION_ASSETS,
];

/**
 * Creates the full mock asset manifest
 */
export function createMockAssetManifest(): AssetManifest {
  return {
    schema_version: '1',
    assets: MOCK_ASSETS.map((asset) => ({
      ...asset,
      created_at: Date.now() - Math.random() * 86400000 * 7,
    })),
  };
}

/**
 * Gets assets grouped by type
 */
export function getAssetsGroupedByType(
  manifest: AssetManifest,
): Record<AssetType, AssetInfo[]> {
  const grouped = {} as Record<AssetType, AssetInfo[]>;

  for (const asset of manifest.assets) {
    if (!grouped[asset.type]) {
      grouped[asset.type] = [];
    }
    grouped[asset.type].push(asset);
  }

  return grouped;
}

/**
 * Gets video versions for a specific scene
 */
export function getSceneVideoVersions(
  manifest: AssetManifest,
  sceneNumber: number,
): AssetInfo[] {
  return manifest.assets
    .filter(
      (asset) =>
        asset.type === 'scene_video' && asset.scene_number === sceneNumber,
    )
    .sort((a, b) => a.version - b.version);
}

