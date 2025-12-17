/**
 * Path Resolver Utility
 * Handles path resolution for assets, especially test assets in mock mode
 */

/**
 * Gets the resources path where Test_Images and Test_videos are located
 * Uses IPC to get the path from main process (works in both dev and packaged)
 */
let cachedResourcesPath: string | null = null;

async function getResourcesPath(): Promise<string> {
  if (cachedResourcesPath) {
    return cachedResourcesPath;
  }
  
  try {
    // Use IPC to get resources path from main process
    if (typeof window !== 'undefined' && window.electron?.project?.getResourcesPath) {
      const resourcesPath = await window.electron.project.getResourcesPath();
      // In development, resources path is the workspace root, but Test_videos is in kshana-frontend/
      // In production, resources path should already point to the right location
      // For now, append kshana-frontend if it doesn't already contain it
      if (resourcesPath && !resourcesPath.includes('kshana-frontend')) {
        cachedResourcesPath = `${resourcesPath}/kshana-frontend`;
      } else {
        cachedResourcesPath = resourcesPath;
      }
      return cachedResourcesPath;
    }
  } catch (error) {
    console.warn('Failed to get resources path via IPC:', error);
  }
  
  // Fallback: try environment variable
  if (typeof process !== 'undefined' && process.env.WORKSPACE_ROOT) {
    const workspaceRoot = process.env.WORKSPACE_ROOT;
    cachedResourcesPath = `${workspaceRoot}/kshana-frontend`;
    return cachedResourcesPath;
  }
  
  // Last resort: default path (development) - point to kshana-frontend
  cachedResourcesPath = '/Users/indhicdev/Agentic-video-editor/kshana-frontend';
  return cachedResourcesPath;
}

/**
 * Checks if a path is a test asset path (starts with ../Test_Images/ or ../Test_videos/)
 */
export function isTestAssetPath(path: string): boolean {
  return (
    path.startsWith('../Test_Images/') ||
    path.startsWith('../Test_videos/') ||
    path.startsWith('Test_Images/') ||
    path.startsWith('Test_videos/')
  );
}

/**
 * Resolves a test asset path to an absolute path
 * Handles both relative (../Test_Images/, Test_Images/) and absolute paths
 */
export async function resolveTestAssetPathToAbsolute(
  testAssetPath: string,
): Promise<string> {
  // If already absolute, return as-is
  if (testAssetPath.startsWith('/') || testAssetPath.startsWith('file://')) {
    return testAssetPath;
  }

  // Remove ../ prefix if present
  let cleanPath = testAssetPath;
  if (cleanPath.startsWith('../')) {
    cleanPath = cleanPath.slice(3);
  }
  
  // Remove leading Test_Images/ or Test_videos/ if present (we'll add it back)
  const isImage = cleanPath.startsWith('Test_Images/');
  const isVideo = cleanPath.startsWith('Test_videos/');
  
  if (isImage || isVideo) {
    // Get resources path and join with the asset path
    const resourcesPath = await getResourcesPath();
    const filename = isImage 
      ? cleanPath.replace('Test_Images/', '')
      : cleanPath.replace('Test_videos/', '');
    const folder = isImage ? 'Test_Images' : 'Test_videos';
    // Normalize path to avoid double slashes
    const parts = [resourcesPath.replace(/\/$/, ''), folder, filename].filter(Boolean);
    return parts.join('/').replace(/\/+/g, '/');
  }

  // Fallback: resolve to resources path
  const resourcesPath = await getResourcesPath();
  const parts = [resourcesPath.replace(/\/$/, ''), cleanPath].filter(Boolean);
  return parts.join('/').replace(/\/+/g, '/');
}

/**
 * Resolves an asset path for display
 * If it's a test asset path and we're in mock mode, resolve to absolute path
 * Otherwise, construct path relative to project directory
 */
export async function resolveAssetPathForDisplay(
  assetPath: string,
  projectDirectory: string | null,
  useMockData: boolean = false,
): Promise<string> {
  // If no path, return empty
  if (!assetPath) {
    return '';
  }

  // If it's a test asset path and we're using mock data, resolve to absolute
  if (useMockData && isTestAssetPath(assetPath)) {
    const absolutePath = await resolveTestAssetPathToAbsolute(assetPath);
    return `file://${absolutePath}`;
  }

  // Otherwise, construct path relative to project directory
  if (projectDirectory) {
    // Handle paths that already start with .kshana
    if (assetPath.startsWith('.kshana/')) {
      return `file://${projectDirectory}/${assetPath}`;
    }
    
    // Handle paths relative to .kshana/agent/ (e.g., characters/alice-chen/image.png)
    if (assetPath.match(/^(characters|settings|props|plans|scenes)\//)) {
      return `file://${projectDirectory}/.kshana/agent/${assetPath}`;
    }
    
    // Handle other relative paths
    return `file://${projectDirectory}/${assetPath}`;
  }

  // Fallback: return as-is (might be absolute already)
  return assetPath.startsWith('file://') ? assetPath : `file://${assetPath}`;
}

