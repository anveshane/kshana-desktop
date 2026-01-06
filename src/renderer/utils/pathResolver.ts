/**
 * Path Resolver Utility
 * Handles path resolution for assets, especially test assets in mock mode
 */

/**
 * Test asset folder names
 */
const TEST_ASSET_FOLDERS = ['test_image', 'test_video'] as const;

/**
 * Gets the resources path where test_image and test_video are located
 * Uses IPC to get the path from main process (works in both dev and packaged)
 */
let cachedResourcesPath: string | null = null;

async function getResourcesPath(): Promise<string> {
  if (cachedResourcesPath) {
    return cachedResourcesPath;
  }

  try {
    // Use IPC to get resources path from main process
    if (
      typeof window !== 'undefined' &&
      window.electron?.project?.getResourcesPath
    ) {
      const resourcesPath = await window.electron.project.getResourcesPath();
      if (resourcesPath && resourcesPath.trim()) {
        cachedResourcesPath = resourcesPath.trim();
        return cachedResourcesPath;
      }
    }
  } catch (error) {
    console.warn('[PathResolver] Failed to get resources path via IPC:', error);
  }

  // Fallback: try environment variable
  if (typeof process !== 'undefined' && process.env.WORKSPACE_ROOT) {
    const workspaceRoot = process.env.WORKSPACE_ROOT.trim();
    if (workspaceRoot) {
      cachedResourcesPath = workspaceRoot;
      return cachedResourcesPath;
    }
  }

  // Last resort: return empty string to avoid hardcoded paths
  console.warn(
    '[PathResolver] Could not determine resources path - using fallback',
  );
  cachedResourcesPath = '';
  return cachedResourcesPath;
}

/**
 * Checks if a path is a test asset path
 */
export function isTestAssetPath(path: string): boolean {
  if (!path) return false;

  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  // Check if any segment is a test asset folder
  return segments.some((segment) =>
    TEST_ASSET_FOLDERS.some((folder) => segment === folder),
  );
}

/**
 * Extracts test asset folder and filename from a path
 */
function parseTestAssetPath(
  path: string,
): { folder: string; filename: string } | null {
  const normalized = path.replace(/\\/g, '/');

  // Split into segments and find the first test folder segment
  const segments = normalized.split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (TEST_ASSET_FOLDERS.some((f) => f === segment)) {
      const folder = segment;
      const filename = segments.slice(i + 1).join('/');
      if (filename) {
        return { folder, filename };
      }
    }
  }

  return null;
}

/**
 * Resolves a test asset path to an absolute path
 * Handles both relative (../test_image/, test_image/) and absolute paths
 */
export async function resolveTestAssetPathToAbsolute(
  testAssetPath: string,
): Promise<string> {
  if (!testAssetPath) {
    console.warn('[PathResolver] Cannot resolve empty test asset path');
    return '';
  }

  // Handle file:// URLs
  if (testAssetPath.startsWith('file://')) {
    return testAssetPath.slice(7);
  }

  // If already absolute, normalize and return
  if (testAssetPath.startsWith('/') || /^[A-Za-z]:/.test(testAssetPath)) {
    return testAssetPath.replace(/\\/g, '/');
  }

  // Parse test asset path
  const parsed = parseTestAssetPath(testAssetPath);
  if (!parsed) {
    console.warn(
      `[PathResolver] Invalid test asset path format: ${testAssetPath}`,
    );
    return '';
  }

  const { folder, filename } = parsed;

  // Get resources path
  const resourcesPath = await getResourcesPath();
  if (!resourcesPath) {
    console.warn(
      '[PathResolver] Cannot resolve test asset path: resources path not available',
    );
    return '';
  }

  // Join resources path, folder, and filename
  const absolutePath = [resourcesPath, folder, filename]
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
  return absolutePath;
}

/**
 * Resolves an asset path for display
 * If it's a test asset path, resolve to absolute path in resources
 * Otherwise, construct path relative to project directory
 */
export async function resolveAssetPathForDisplay(
  assetPath: string,
  projectDirectory: string | null,
  useMockData: boolean = false,
): Promise<string> {
  // If no path, return empty
  if (!assetPath || !assetPath.trim()) {
    return '';
  }

  const trimmedPath = assetPath.trim();

  // If it's already a file:// URL, return as-is
  if (trimmedPath.startsWith('file://')) {
    return trimmedPath;
  }

  // ALWAYS resolve test asset paths to resources path in production or if detected
  // This ensures bundled assets load correctly even if useMockData is false
  if (isTestAssetPath(trimmedPath)) {
    const absolutePath = await resolveTestAssetPathToAbsolute(trimmedPath);
    if (absolutePath) {
      const result = `file://${absolutePath}`;
      if (assetPath.endsWith('.mp4')) {
        console.log(
          `[PathResolver] Resolved test video: ${assetPath} -> ${result}`,
        );
      }
      return result;
    }
    // If resolution failed, fall through to project directory resolution
  }

  // If assetPath is already absolute, use it directly
  if (trimmedPath.startsWith('/') || /^[A-Za-z]:/.test(trimmedPath)) {
    return `file://${trimmedPath.replace(/\\/g, '/')}`;
  }

  // Otherwise, construct path relative to project directory
  if (projectDirectory && projectDirectory.trim()) {
    const normalizedProjectDir = projectDirectory.trim().replace(/\\/g, '/');

    // Handle paths that already start with .kshana
    if (trimmedPath.startsWith('.kshana/')) {
      return `file://${normalizedProjectDir}/${trimmedPath}`;
    }

    // Handle paths relative to .kshana/agent/ (e.g., characters/alice-chen/image.png)
    if (trimmedPath.match(/^(characters|settings|props|plans|scenes)\//)) {
      return `file://${normalizedProjectDir}/.kshana/agent/${trimmedPath}`;
    }

    // Handle other relative paths
    const result = `file://${normalizedProjectDir}/${trimmedPath}`;
    if (assetPath.endsWith('.mp4')) {
      console.log(
        `[PathResolver] Resolved project video: ${assetPath} -> ${result}`,
      );
    }
    return result;
  }

  // Fallback: treat as absolute path (may fail, but better than nothing)
  console.warn(
    `[PathResolver] No project directory provided for relative path: ${trimmedPath}`,
  );
  return `file://${trimmedPath.replace(/\\/g, '/')}`;
}
