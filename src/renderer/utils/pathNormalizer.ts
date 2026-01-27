/**
 * Path Normalizer Utility (Renderer)
 * Normalizes paths for export operations (IPC communication)
 * Strips file:// protocol and returns clean paths
 */

/**
 * Normalizes a path for export operations (IPC communication)
 * Strips file:// protocol and returns clean path
 * 
 * @param path - Path that may contain file:// protocol
 * @returns Clean path without file:// protocol, or null if path is empty/invalid
 */
export function normalizePathForExport(path: string | null | undefined): string | null {
  if (!path) return null;
  
  // Strip file:// protocol if present
  const cleanPath = path.replace(/^file:\/\//, '');
  
  // Return null if path becomes empty after stripping
  if (!cleanPath.trim()) return null;
  
  return cleanPath.trim();
}
