/**
 * Image to Base64 Utility
 * Converts image files to base64 data URIs for embedding
 * Useful for packaging images with the app
 */

/**
 * Converts an image file to base64 data URI
 * @param imagePath - Absolute path to the image file
 * @returns Promise resolving to base64 data URI or null if failed
 */
export async function imageToBase64(imagePath: string): Promise<string | null> {
  try {
    // Remove file:// protocol if present
    const cleanPath = imagePath.replace(/^file:\/\//, '');

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
    console.warn('Failed to convert image to base64:', error);
    return null;
  }
}

/**
 * Checks if an image should be converted to base64
 * For test images, we prefer base64 for reliability
 */
export function shouldUseBase64(filePath: string): boolean {
  // Use base64 for test images if they're in test directories
  if (filePath.includes('test_image/') || filePath.includes('test_video/')) {
    return true;
  }
  return false;
}
