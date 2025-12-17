/**
 * Test Asset Mapping
 * Maps test images and videos from Test_Images/ and Test_videos/ to mock entities
 * 
 * This allows the mock data to use real assets for better UI testing and demos.
 */

/**
 * Test image files available in Test_Images/
 * All 10 images are mapped to various entities for comprehensive coverage
 */
export const TEST_IMAGES = {
  // Character reference images (for Assets view)
  'alice-chen': 'cute-cat-studio.jpg',
  'marcus-webb': 'adorable-dog-fantasy-style.jpg',
  'fatima-hassan': 'close-up-adorable-kitten-couch.jpg',
  
  // Setting reference images (for Assets view)
  'dusty-village': 'adorable-cat-lifestyle.jpg',
  'desert-camp': 'cute-cat-lifestyle.jpg',
  'underground-tomb': 'adorable-cat-lifestyle (1).jpg',
  
  // Scene images (for Storyboard, Timeline, and Video Library)
  // Using all available images for better variety
  'scene-001': 'close-up-kitten-standing-rock.jpg',
  'scene-002': 'close-up-kitten-surrounded-by-flowers.jpg',
  'scene-003': 'cute-cat-lifestyle (1).jpg',
  'scene-004': 'adorable-cat-lifestyle (1).jpg',
  'scene-005': 'funny-image-with-dog.jpg',
  'scene-006': 'cute-cat-lifestyle.jpg',
  
  // Additional scene images (for more scenes, versions, or timeline thumbnails)
  'scene-007': 'close-up-adorable-kitten-couch.jpg',
  'scene-008': 'adorable-dog-fantasy-style.jpg',
  'scene-009': 'cute-cat-studio.jpg',
  'scene-010': 'adorable-cat-lifestyle.jpg',
} as const;

/**
 * Test video files available in Test_videos/
 * These will be mapped to scene videos
 */
export const TEST_VIDEOS = [
  'models_veo-3.1-generate-preview_operations_4upf55002ju4.mp4',
  'models_veo-3.1-generate-preview_operations_bp77afbln6kp.mp4',
  'models_veo-3.1-generate-preview_operations_cjxqty7g1kza.mp4',
  'models_veo-3.1-generate-preview_operations_ctwl17xrl5jr.mp4',
  'models_veo-3.1-generate-preview_operations_dihc7q31jlya.mp4',
  'models_veo-3.1-generate-preview_operations_ho5zaa165hqq.mp4',
  'models_veo-3.1-generate-preview_operations_ptfmmmvntnxo.mp4',
  'models_veo-3.1-generate-preview_operations_wyu6lyo6jsud.mp4',
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
 * When in mock mode, paths should point to Test_Images/ or Test_videos/
 * 
 * Uses Test_Images/ or Test_videos/ directly (not ../) since they're now
 * in the app resources and will be resolved by the path resolver
 */
export function resolveTestAssetPath(
  assetType: 'image' | 'video',
  filename: string,
): string {
  if (assetType === 'image') {
    return `Test_Images/${filename}`;
  }
  return `Test_videos/${filename}`;
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

