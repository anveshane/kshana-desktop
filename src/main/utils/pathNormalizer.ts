/**
 * Path Normalizer Utility (Main Process)
 * Normalizes paths for FFmpeg operations
 * Strips file:// protocol, resolves relative paths, and returns absolute paths
 */

import path from 'path';

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Strips file:// protocol from a URL while preserving absolute Unix paths.
 * Handles Windows drive-letter paths (file:///C:/...) correctly.
 */
export function stripFileProtocol(filePath: string): string {
  if (!filePath.startsWith('file://')) {
    return filePath;
  }

  // Remove protocol while preserving leading slash for Unix absolute paths.
  let cleanPath = filePath.replace(/^file:\/\//i, '');

  // file://localhost/... -> /...
  if (cleanPath.startsWith('localhost/')) {
    cleanPath = cleanPath.slice('localhost'.length);
  }

  // Strip URL query/hash if present.
  const queryIndex = cleanPath.indexOf('?');
  const hashIndex = cleanPath.indexOf('#');
  const cutIndexCandidates = [queryIndex, hashIndex].filter((i) => i >= 0);
  if (cutIndexCandidates.length > 0) {
    cleanPath = cleanPath.slice(0, Math.min(...cutIndexCandidates));
  }

  cleanPath = decodePath(cleanPath);

  // file://server/share/file.png -> //server/share/file.png
  if (!cleanPath.startsWith('/') && !/^[A-Za-z]:/.test(cleanPath)) {
    cleanPath = `//${cleanPath}`;
  }

  if (/^\/[A-Za-z]:/.test(cleanPath)) {
    cleanPath = cleanPath.slice(1);
  }

  return cleanPath;
}

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

  const cleanPath = stripFileProtocol(filePath);

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
