/**
 * Test Asset Mapping
 * Maps test images and videos from test_image/ and test_video/ to mock entities
 * 
 * This allows the mock data to use real assets for better UI testing and demos.
 */

/**
 * Test image files available in test_image/
 * 8 images (img1.jpg through img8.jpg) mapped to various entities
 */
export const TEST_IMAGES = {
  // Character reference images (for Assets view) - 3 images
  'alice-chen': 'img1.jpg',
  'marcus-webb': 'img2.jpg',
  'fatima-hassan': 'img3.jpg',

  // Setting reference images (for Assets view) - 3 images
  'dusty-village': 'img4.jpg',
  'desert-camp': 'img5.jpg',
  'underground-tomb': 'img6.jpg', // Reuse scene image since underground-tomb doesn't have reference_image_path yet

  // Scene images (for Storyboard, Timeline, and Video Library) - 3 images
  // These will cycle/reuse for scenes 001-010
  'scene-001': 'img6.jpg',
  'scene-002': 'img7.jpg',
  'scene-003': 'img8.jpg',
  'scene-004': 'img6.jpg', // Reuse images for additional scenes
  'scene-005': 'img7.jpg',
  'scene-006': 'img8.jpg',
  'scene-007': 'img6.jpg',
  'scene-008': 'img7.jpg',
  'scene-009': 'img8.jpg',
  'scene-010': 'img6.jpg',
} as const;

/**
 * Test video files available in test_video/
 * 3 videos (vd1.mp4, vd2.mp4, vd3.mp4) mapped to scene videos
 * Videos will cycle for different scenes and versions
 */
export const TEST_VIDEOS = [
  'vd1.mp4',
  'vd2.mp4',
  'vd3.mp4',
] as const;

/**
 * Gets the test image path for a character slug
 */
export function getTestImageForCharacter(slug: string): string | undefined {
  return TEST_IMAGES[slug as keyof typeof TEST_IMAGES];
}

/**
 * Gets the test image path for a setting slug
 */
export function getTestImageForSetting(slug: string): string | undefined {
  return TEST_IMAGES[slug as keyof typeof TEST_IMAGES];
}

/**
 * Gets the test image path for a scene folder
 */
export function getTestImageForScene(sceneFolder: string): string | undefined {
  return TEST_IMAGES[sceneFolder as keyof typeof TEST_IMAGES];
}

/**
 * Gets test video files for scenes
 * Returns videos in order, cycling if there are more scenes than videos
 */
export function getTestVideoForScene(
  sceneNumber: number,
  version: number = 1,
): string {
  // Use scene number and version to select video
  // This creates variety: different scenes get different videos
  const videoIndex = ((sceneNumber - 1) * 3 + (version - 1)) % TEST_VIDEOS.length;
  return TEST_VIDEOS[videoIndex];
}

/**
 * Resolves a test asset path
 * When in mock mode, paths should point to test_image/ or test_video/
 * 
 * Uses test_image/ or test_video/ directly (not ../) since they're now
 * in the app resources and will be resolved by the path resolver
 */
export function resolveTestAssetPath(
  assetType: 'image' | 'video',
  filename: string,
): string {
  if (assetType === 'image') {
    return `test_image/${filename}`;
  }
  return `test_video/${filename}`;
}

/**
 * Resolves a mock asset path
 * In mock mode, this returns paths to test assets relative to the workspace root
 * In real mode, this would return the normal .kshana/agent/... paths
 */
export function resolveMockAssetPath(
  originalPath: string,
  assetType: 'character_ref' | 'setting_ref' | 'scene_image' | 'scene_video',
  options?: {
    entity_slug?: string;
    scene_number?: number;
    scene_folder?: string;
    version?: number;
  },
): string {
  // For mock data, we want to use test assets
  // The path should be relative to workspace root

  switch (assetType) {
    case 'character_ref':
      if (options?.entity_slug) {
        const testImage = getTestImageForCharacter(options.entity_slug);
        if (testImage) {
          return resolveTestAssetPath('image', testImage);
        }
      }
      break;

    case 'setting_ref':
      if (options?.entity_slug) {
        const testImage = getTestImageForSetting(options.entity_slug);
        if (testImage) {
          return resolveTestAssetPath('image', testImage);
        }
      }
      break;

    case 'scene_image':
      if (options?.scene_folder) {
        const testImage = getTestImageForScene(options.scene_folder);
        if (testImage) {
          return resolveTestAssetPath('image', testImage);
        }
      }
      break;

    case 'scene_video':
      if (options?.scene_number) {
        const testVideo = getTestVideoForScene(
          options.scene_number,
          options.version || 1,
        );
        return resolveTestAssetPath('video', testVideo);
      }
      break;
  }

  // Fallback to original path if no test asset mapping found
  return originalPath;
}

