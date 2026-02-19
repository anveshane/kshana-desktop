/**
 * Path Normalizer Utility (Main Process)
 * Normalizes paths for FFmpeg operations
 * Strips file:// protocol, resolves relative paths, and returns absolute paths
 */

import path from 'path';

/**
 * Normalizes a path for FFmpeg operations
 * - Strips file:// protocol if present
 * - Resolves relative paths against project directory
 * - Returns absolute path ready for FFmpeg
 *
 * @param filePath - Path that may contain file:// protocol or be relative
 * @param projectDirectory - Project directory to resolve relative paths against
 * @returns Normalized absolute path, or null if path is empty/invalid
 */
export async function normalizePathForFFmpeg(
  filePath: string | null | undefined,
  projectDirectory: string,
): Promise<string | null> {
  if (!filePath) return null;

  // Strip file:// protocol if present, handling Windows drive letters (file:///C:/...)
  let cleanPath = filePath.replace(/^file:\/\/\/?/, '');
  if (/^\/[A-Za-z]:/.test(cleanPath)) {
    cleanPath = cleanPath.slice(1);
  }

  if (!cleanPath.trim()) return null;

  // Resolve to absolute path
  const absolutePath = path.isAbsolute(cleanPath)
    ? cleanPath
    : path.join(projectDirectory, cleanPath);

  // Normalize path separators (handles ../, ./, etc.)
  const normalizedPath = path.normalize(absolutePath);

  // Note: File existence validation happens at the call site
  // This function just normalizes the path structure

  return normalizedPath;
}
