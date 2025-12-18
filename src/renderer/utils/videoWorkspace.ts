/**
 * Video Workspace Utility
 * Manages video folder structure in Kshana projects
 * Handles video versioning, current.txt tracking, and metadata
 */

/**
 * Video metadata stored in vN_info.json files
 */
export interface VideoMetadata {
  /** Prompt used to generate the video */
  prompt?: string;

  /** Seed used for generation (if applicable) */
  seed?: number;

  /** Duration in seconds */
  duration?: number;

  /** Artifact ID */
  artifact_id?: string;

  /** Created timestamp (ISO8601) */
  created_at?: string;

  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Copy video to scene folder and create version structure
 * @param videoPath - Source video file path (absolute or relative)
 * @param projectDirectory - Project root directory
 * @param sceneFolder - Scene folder name (e.g., "scene-001")
 * @param version - Version number (1, 2, 3, etc.)
 * @param metadata - Optional video metadata
 * @returns Promise resolving to relative path of copied video
 */
export async function copyVideoToScene(
  videoPath: string,
  projectDirectory: string,
  sceneFolder: string,
  version: number,
  metadata?: VideoMetadata,
): Promise<string> {
  // Construct target directory: .kshana/agent/scenes/scene-XXX/video/
  const videoDir = `${projectDirectory}/.kshana/agent/scenes/${sceneFolder}/video`;

  // Ensure video directory exists
  const dirParts = videoDir.split('/');
  let currentPath = projectDirectory;
  for (const part of dirParts.slice(1)) {
    if (part) {
      await window.electron.project.createFolder(currentPath, part);
      currentPath = `${currentPath}/${part}`;
    }
  }

  // Construct target filename: vN.mp4
  const targetFileName = `v${version}.mp4`;
  const targetPath = `${videoDir}/${targetFileName}`;
  const relativePath = `.kshana/agent/scenes/${sceneFolder}/video/${targetFileName}`;

  // Remove file:// protocol if present
  const cleanPath = videoPath.replace(/^file:\/\//, '');
  
  console.log(`[videoWorkspace] Copying video to scene folder:`);
  console.log(`  Source: ${videoPath} (cleaned: ${cleanPath})`);
  console.log(`  Target: ${targetPath}`);
  console.log(`  Scene: ${sceneFolder}, Version: ${version}`);

  // Check if source file exists before attempting copy
  // This prevents silent failures when the file doesn't exist
  try {
    // If it's a URL, we can't copy it directly - need to download first
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      throw new Error(`Video path is a URL (${cleanPath}). URLs must be downloaded first before copying.`);
    }
    
    // Verify source file exists using file-exists check (more efficient than reading)
    const sourceExists = await window.electron.project.fileExists(cleanPath);
    if (!sourceExists) {
      throw new Error(`Source video file does not exist: ${cleanPath}`);
    }
    console.log(`[videoWorkspace] ✓ Source file verified: ${cleanPath}`);
  } catch (checkError) {
    const errorMsg = checkError instanceof Error ? checkError.message : String(checkError);
    console.error(`[videoWorkspace] ✗ Source file check failed: ${errorMsg}`);
    console.error(`[videoWorkspace]   Original path: ${videoPath}`);
    console.error(`[videoWorkspace]   Cleaned path: ${cleanPath}`);
    console.error(`[videoWorkspace]   Target path: ${targetPath}`);
    throw new Error(
      `Cannot copy video to workspace: ${errorMsg}\n` +
      `\nSource: ${cleanPath}` +
      `\nTarget: ${targetPath}` +
      `\n\nPlease ensure:` +
      `\n• The source video file exists at the specified path` +
      `\n• You have read permissions for the source file` +
      `\n• The file path is correct and accessible`,
    );
  }

  // Try direct copy first (more efficient for large video files)
  // Fallback to base64 if copy fails
  try {
    // Use direct copy for better performance with large video files
    const copiedPath = await window.electron.project.copy(cleanPath, videoDir);
    
    // Rename if needed to match target filename
    const copiedFileName = copiedPath.split('/').pop();
    if (copiedFileName && copiedFileName !== targetFileName) {
      const finalPath = await window.electron.project.rename(copiedPath, targetFileName);
      console.log(`[videoWorkspace] Renamed copied video: ${copiedFileName} -> ${targetFileName}`);
      console.log(`[videoWorkspace] ✓ Successfully copied video: ${cleanPath} -> ${finalPath}`);
    } else {
      console.log(`[videoWorkspace] ✓ Successfully copied video: ${cleanPath} -> ${copiedPath}`);
    }
    
    // Verify the copied file exists and has content
    await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay for file system sync
    
  } catch (copyError) {
    const copyErrorMsg = copyError instanceof Error ? copyError.message : String(copyError);
    console.warn(
      `[videoWorkspace] Direct copy failed (${copyErrorMsg}), trying base64 conversion...`,
    );
    
    // Fallback to base64 conversion if direct copy fails
    try {
      // Read video file as base64
      const base64DataUri = await window.electron.project.readFileBase64(cleanPath);
      if (!base64DataUri) {
        throw new Error(`Failed to read video file: ${cleanPath}`);
      }

      // Extract base64 data from data URI
      const base64Match = base64DataUri.match(/^data:video\/[^;]+;base64,(.+)$/);
      if (!base64Match) {
        throw new Error('Invalid base64 data URI format');
      }

      const base64Data = base64Match[1];

      // Write binary file from base64 data
      await window.electron.project.writeFileBinary(targetPath, base64Data);
      console.log(`[videoWorkspace] ✓ Successfully wrote video via base64: ${targetPath}`);
      
      // Verify the written file exists
      await new Promise((resolve) => setTimeout(resolve, 100));
      
    } catch (base64Error) {
      const base64ErrorMsg = base64Error instanceof Error ? base64Error.message : String(base64Error);
      console.error(
        `[videoWorkspace] ✗ Both copy methods failed for video: ${videoPath}`,
        { copyError: copyErrorMsg, base64Error: base64ErrorMsg },
      );
      throw new Error(
        `Failed to copy video file to workspace. ` +
        `Copy error: ${copyErrorMsg}. ` +
        `Base64 error: ${base64ErrorMsg}. ` +
        `Source: ${cleanPath}, Target: ${targetPath}`,
      );
    }
  }
  
  // Final verification that target file exists
  try {
    const verifyContent = await window.electron.project.readFile(targetPath);
    if (verifyContent === null) {
      throw new Error(`Copied video file not found at target: ${targetPath}`);
    }
    console.log(`[videoWorkspace] ✓ Verified copied video exists: ${targetPath}`);
  } catch (verifyError) {
    const verifyErrorMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
    console.error(`[videoWorkspace] ✗ Copy verification failed: ${verifyErrorMsg}`);
    throw new Error(`Video copy verification failed: ${verifyErrorMsg}`);
  }

  // Create metadata file: vN_info.json
  if (metadata) {
    const metadataPath = `${videoDir}/v${version}_info.json`;
    await window.electron.project.writeFile(
      metadataPath,
      JSON.stringify(
        {
          version,
          prompt: metadata.prompt,
          seed: metadata.seed,
          duration: metadata.duration,
          artifact_id: metadata.artifact_id,
          created_at: metadata.created_at || new Date().toISOString(),
          ...metadata,
        },
        null,
        2,
      ),
    );
  }

  return relativePath;
}

/**
 * Update current.txt to point to active video version
 * @param projectDirectory - Project root directory
 * @param sceneFolder - Scene folder name (e.g., "scene-001")
 * @param version - Version number to set as active
 */
export async function setActiveVideoVersion(
  projectDirectory: string,
  sceneFolder: string,
  version: number,
): Promise<void> {
  const videoDir = `${projectDirectory}/.kshana/agent/scenes/${sceneFolder}/video`;
  const currentTxtPath = `${videoDir}/current.txt`;
  const fileName = `v${version}.mp4`;

  // Ensure video directory exists
  const dirParts = videoDir.split('/');
  let currentPath = projectDirectory;
  for (const part of dirParts.slice(1)) {
    if (part) {
      await window.electron.project.createFolder(currentPath, part);
      currentPath = `${currentPath}/${part}`;
    }
  }

  // Write current.txt with version filename
  await window.electron.project.writeFile(currentTxtPath, fileName);
}

/**
 * Get active video path for a scene
 * @param projectDirectory - Project root directory
 * @param sceneFolder - Scene folder name (e.g., "scene-001")
 * @returns Promise resolving to relative path of active video, or null if none
 */
export async function getActiveVideoPath(
  projectDirectory: string,
  sceneFolder: string,
): Promise<string | null> {
  const videoDir = `${projectDirectory}/.kshana/agent/scenes/${sceneFolder}/video`;
  const currentTxtPath = `${videoDir}/current.txt`;

  try {
    // Try to read current.txt
    const currentContent = await window.electron.project.readFile(currentTxtPath);
    if (currentContent) {
      const fileName = currentContent.trim();
      return `.kshana/agent/scenes/${sceneFolder}/video/${fileName}`;
    }
  } catch {
    // current.txt doesn't exist or can't be read
  }

  // Fallback: check if v1.mp4 exists
  try {
    const v1Path = `${videoDir}/v1.mp4`;
    await window.electron.project.readFile(v1Path); // Just check if exists
    return `.kshana/agent/scenes/${sceneFolder}/video/v1.mp4`;
  } catch {
    // No video found
    return null;
  }
}

/**
 * Get video metadata for a specific version
 * @param projectDirectory - Project root directory
 * @param sceneFolder - Scene folder name (e.g., "scene-001")
 * @param version - Version number
 * @returns Promise resolving to metadata object, or null if not found
 */
export async function getVideoMetadata(
  projectDirectory: string,
  sceneFolder: string,
  version: number,
): Promise<VideoMetadata | null> {
  const videoDir = `${projectDirectory}/.kshana/agent/scenes/${sceneFolder}/video`;
  const metadataPath = `${videoDir}/v${version}_info.json`;

  try {
    const content = await window.electron.project.readFile(metadataPath);
    if (content) {
      return JSON.parse(content) as VideoMetadata;
    }
  } catch {
    // Metadata file doesn't exist
  }

  return null;
}

/**
 * List all video versions for a scene
 * @param projectDirectory - Project root directory
 * @param sceneFolder - Scene folder name (e.g., "scene-001")
 * @returns Promise resolving to array of version numbers
 */
export async function listVideoVersions(
  projectDirectory: string,
  sceneFolder: string,
): Promise<number[]> {
  const videoDir = `${projectDirectory}/.kshana/agent/scenes/${sceneFolder}/video`;

  try {
    // List directory contents (if API exists)
    // For now, we'll check versions sequentially up to a reasonable limit
    const versions: number[] = [];
    for (let v = 1; v <= 100; v += 1) {
      try {
        const videoPath = `${videoDir}/v${v}.mp4`;
        await window.electron.project.readFile(videoPath); // Check if exists
        versions.push(v);
      } catch {
        // Version doesn't exist, stop checking
        break;
      }
    }
    return versions;
  } catch {
    return [];
  }
}

