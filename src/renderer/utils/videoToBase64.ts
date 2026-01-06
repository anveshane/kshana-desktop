/**
 * Video to Base64 Utility
 * Converts video files to base64 data URIs for embedding
 * Useful for packaging videos with the app (similar to images)
 */

/**
 * Converts a video file to base64 data URI
 * @param videoPath - Absolute path to the video file
 * @returns Promise resolving to base64 data URI or null if failed
 */
export async function videoToBase64(videoPath: string): Promise<string | null> {
  try {
    // Remove file:// protocol if present
    const cleanPath = videoPath.replace(/^file:\/\//, '');

    // Read file as base64 using IPC
    if (
      typeof window !== 'undefined' &&
      window.electron?.project?.readFileBase64
    ) {
      const base64 = await window.electron.project.readFileBase64(cleanPath);
      return base64;
    }
    return null;
  } catch (error) {
    console.warn('Failed to convert video to base64:', error);
    return null;
  }
}

/**
 * Checks if a video should be converted to base64
 * For test videos in mock mode, we prefer base64 for reliability
 */
export function shouldUseBase64ForVideo(
  filePath: string,
  useMockData: boolean,
): boolean {
  // Use base64 for test videos in mock mode
  if (
    useMockData &&
    (filePath.includes('test_video/') || filePath.includes('test_image/'))
  ) {
    return true;
  }
  return false;
}

/**
 * Writes a base64 video data URI to a file in the workspace as binary
 * @param base64DataUri - Base64 data URI (e.g., "data:video/mp4;base64,...")
 * @param targetPath - Target file path in workspace
 * @returns Promise resolving when write is complete
 */
export async function writeBase64VideoToFile(
  base64DataUri: string,
  targetPath: string,
): Promise<void> {
  try {
    // Extract base64 data from data URI
    const base64Match = base64DataUri.match(/^data:video\/[^;]+;base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid base64 data URI format');
    }

    const base64Data = base64Match[1];

    // Write binary file from base64 data
    if (
      typeof window !== 'undefined' &&
      window.electron?.project?.writeFileBinary
    ) {
      await window.electron.project.writeFileBinary(targetPath, base64Data);
    } else {
      throw new Error('writeFileBinary not available in Electron IPC');
    }
  } catch (error) {
    console.warn('Failed to write base64 video to file:', error);
    throw error;
  }
}
