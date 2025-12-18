/**
 * Path Resolver Utility
 * Handles path resolution for assets, especially test assets in mock mode
 * Provides cross-platform path handling without requiring Node.js path module
 */

// ============================================================================
// Types
// ============================================================================

type PathType = 'test-image' | 'test-video' | 'project-relative' | 'absolute' | 'file-url';

// ============================================================================
// Path Utilities (Cross-platform, no Node.js dependency)
// ============================================================================

/**
 * Normalizes a path by removing trailing slashes and collapsing multiple slashes
 */
function normalizePath(path: string): string {
  return path.replace(/\/+$/, '').replace(/\/+/g, '/');
}

/**
 * Joins path segments, handling cross-platform separators
 */
function joinPath(...segments: string[]): string {
  const filtered = segments.filter(Boolean);
  if (filtered.length === 0) return '';

  // Normalize each segment (remove leading/trailing slashes except for absolute paths)
  const normalized = filtered.map((seg, index) => {
    if (index === 0 && (seg.startsWith('/') || /^[A-Za-z]:/.test(seg))) {
      // Preserve leading slash or drive letter for first segment
      return seg.replace(/\/+$/, '');
    }
    return seg.replace(/^\/+|\/+$/g, '');
  });

  const joined = normalized.join('/');
  return normalizePath(joined);
}

/**
 * Checks if a path is absolute (Unix or Windows)
 */
function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:/.test(path);
}

/**
 * Checks if a path is a file:// URL
 */
function isFileUrl(path: string): boolean {
  return path.startsWith('file://');
}

/**
 * Extracts the file path from a file:// URL
 */
function extractPathFromFileUrl(fileUrl: string): string {
  if (!isFileUrl(fileUrl)) return fileUrl;

  // Remove file:// prefix
  let path = fileUrl.slice(7);

  // Handle Windows file:// URLs (file:///C:/path or file://C:/path)
  if (/^\/\/[A-Za-z]:/.test(path)) {
    path = path.slice(1); // Remove extra slash
  } else if (/^\/[A-Za-z]:/.test(path)) {
    // Already correct format
  }

  return path;
}

/**
 * Converts a file path to a file:// URL
 */
function toFileUrl(filePath: string): string {
  if (isFileUrl(filePath)) return filePath;

  // For Windows absolute paths, ensure proper format
  if (/^[A-Za-z]:/.test(filePath)) {
    return `file:///${filePath}`;
  }

  // For Unix absolute paths
  if (filePath.startsWith('/')) {
    return `file://${filePath}`;
  }

  // For relative paths, convert to absolute first (or handle as-is)
  return `file://${filePath}`;
}

// ============================================================================
// Test Asset Detection
// ============================================================================

/**
 * Test asset folder names
 */
const TEST_ASSET_FOLDERS = ['test_image', 'test_video'] as const;

/**
 * Checks if a path is a test asset path
 */
export function isTestAssetPath(path: string): boolean {
  if (!path) return false;

  const normalized = normalizePath(path);
  const segments = normalized.split('/');

  // Check if any segment is a test asset folder
  return segments.some((segment) =>
    TEST_ASSET_FOLDERS.some((folder) => segment === folder),
  );
}

/**
 * Determines the type of a path
 */
function getPathType(path: string): PathType {
  if (!path) return 'absolute';
  if (isFileUrl(path)) return 'file-url';
  if (isAbsolutePath(path)) return 'absolute';

  const normalized = normalizePath(path);
  if (normalized.includes('test_image/')) return 'test-image';
  if (normalized.includes('test_video/')) return 'test-video';

  return 'project-relative';
}

// ============================================================================
// Resources Path Management
// ============================================================================

let cachedResourcesPath: string | null = null;
let resourcesPathPromise: Promise<string> | null = null;

/**
 * Gets the resources path where test_image and test_video are located
 * Uses IPC to get the path from main process (works in both dev and packaged)
 * Implements promise caching to avoid multiple concurrent requests
 */
async function getResourcesPath(): Promise<string> {
  // Return cached value if available
  if (cachedResourcesPath !== null) {
    return cachedResourcesPath;
  }

  // Return existing promise if one is in flight
  if (resourcesPathPromise) {
    return resourcesPathPromise;
  }

  // Create new promise for resources path resolution
  resourcesPathPromise = (async (): Promise<string> => {
    try {
      // Use IPC to get resources path from main process
      if (
        typeof window !== 'undefined' &&
        window.electron?.project?.getResourcesPath
      ) {
        const resourcesPath = await window.electron.project.getResourcesPath();
        if (resourcesPath && resourcesPath.trim()) {
          console.log(`[PathResolver] IPC Resources path: ${resourcesPath}`);
          cachedResourcesPath = normalizePath(resourcesPath);
          return cachedResourcesPath;
        }
      }
    } catch (error) {
      console.warn('[PathResolver] Failed to get resources path via IPC:', error);
    }

    // Fallback: try environment variable if in node context
    if (typeof process !== 'undefined' && process.env.WORKSPACE_ROOT) {
      const workspaceRoot = process.env.WORKSPACE_ROOT.trim();
      if (workspaceRoot) {
        cachedResourcesPath = normalizePath(workspaceRoot);
        return cachedResourcesPath;
      }
    }

    // Last resort: return empty string to avoid hardcoded paths
    console.warn('[PathResolver] Could not determine resources path - using fallback');
    cachedResourcesPath = '';
    return cachedResourcesPath;
  })();

  const result = await resourcesPathPromise;
  resourcesPathPromise = null; // Clear promise after completion
  return result;
}

/**
 * Clears the cached resources path (useful for testing or when path changes)
 */
export function clearResourcesPathCache(): void {
  cachedResourcesPath = null;
  resourcesPathPromise = null;
}

// ============================================================================
// Test Asset Path Resolution
// ============================================================================

/**
 * Extracts test asset folder and filename from a path
 */
function parseTestAssetPath(
  path: string,
): { folder: string; filename: string } | null {
  const normalized = normalizePath(path);

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
    return '';
  }

  // Handle file:// URLs
  if (isFileUrl(testAssetPath)) {
    return extractPathFromFileUrl(testAssetPath);
  }

  // If already absolute, normalize and return
  if (isAbsolutePath(testAssetPath)) {
    return normalizePath(testAssetPath);
  }

  // Parse test asset path
  const parsed = parseTestAssetPath(testAssetPath);
  if (!parsed) {
    return '';
  }

  const { folder, filename } = parsed;

  // Get resources path
  const resourcesPath = await getResourcesPath();
  if (!resourcesPath) {
    return '';
  }

  // Join resources path, folder, and filename
  const absolutePath = joinPath(resourcesPath, folder, filename);
  return absolutePath;
}

// ============================================================================
// Asset Path Resolution for Display
// ============================================================================

/**
 * Resolves a project-relative asset path
 */
function resolveProjectRelativePath(
  assetPath: string,
  projectDirectory: string,
): string {
  const normalizedProjectDir = normalizePath(projectDirectory);

  // Handle paths that already start with .kshana
  if (assetPath.startsWith('.kshana/')) {
    return joinPath(normalizedProjectDir, assetPath);
  }

  // Handle paths relative to .kshana/agent/ (e.g., characters/alice-chen/image.png)
  const agentRelativePattern = /^(characters|settings|props|plans|scenes)\//;
  if (agentRelativePattern.test(assetPath)) {
    return joinPath(normalizedProjectDir, '.kshana', 'agent', assetPath);
  }

  // Handle other relative paths
  return joinPath(normalizedProjectDir, assetPath);
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

  // If it's already a file:// URL, return as-is (but normalize)
  if (isFileUrl(trimmedPath)) {
    return trimmedPath;
  }

  // ALWAYS resolve test asset paths to resources path in production or if detected
  // This ensures bundled assets Load correctly even if useMockData is false
  if (isTestAssetPath(trimmedPath)) {
    const absolutePath = await resolveTestAssetPathToAbsolute(trimmedPath);
    if (absolutePath) {
      const result = toFileUrl(absolutePath);
      if (assetPath.endsWith('.mp4')) {
        console.log(`[PathResolver] Resolved test video: ${assetPath} -> ${result}`);
      }
      return result;
    }
  }

  // If assetPath is already absolute, use it directly
  if (isAbsolutePath(trimmedPath)) {
    return toFileUrl(normalizePath(trimmedPath));
  }

  // Otherwise, construct path relative to project directory
  if (projectDirectory && projectDirectory.trim()) {
    const fullPath = resolveProjectRelativePath(trimmedPath, projectDirectory);
    const result = toFileUrl(fullPath);
    if (assetPath.endsWith('.mp4')) {
      console.log(`[PathResolver] Resolved project video: ${assetPath} -> ${result}`);
    }
    return result;
  }

  return toFileUrl(trimmedPath);
}


