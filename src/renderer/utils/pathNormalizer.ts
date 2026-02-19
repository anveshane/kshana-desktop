/**
 * Path Normalizer Utility (Renderer)
 * Cross-platform path helpers for the renderer process where Node's `path`
 * module is not available.
 */

/**
 * Strips the file:// protocol from a URL and returns a valid filesystem path.
 * Handles Windows drive-letter paths (file:///C:/...) correctly.
 */
export function stripFileProtocol(filePath: string): string {
  let cleanPath = filePath.replace(/^file:\/\/\/?/, '');
  if (/^\/[A-Za-z]:/.test(cleanPath)) {
    cleanPath = cleanPath.slice(1);
  }
  return cleanPath;
}

/**
 * Normalizes a path for export operations (IPC communication)
 * Strips file:// protocol and returns clean path
 */
export function normalizePathForExport(
  path: string | null | undefined,
): string | null {
  if (!path) return null;

  const cleanPath = stripFileProtocol(path);

  if (!cleanPath.trim()) return null;

  return cleanPath.trim();
}

/**
 * Extracts the last segment (filename or directory name) from a path,
 * handling both forward slashes and Windows backslashes.
 */
export function pathBasename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
}
