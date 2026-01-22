/**
 * Placement Parsers Utility
 * Parses image and video placement markdown files for timeline display
 */

export interface ParsedImagePlacement {
  placementNumber: number;
  startTime: string; // "0:08"
  endTime: string; // "0:24"
  prompt: string;
}

export interface ParsedVideoPlacement {
  placementNumber: number;
  startTime: string;
  endTime: string;
  videoType: 'cinematic_realism' | 'stock_footage' | 'motion_graphics';
  prompt: string;
  duration: number; // Calculated from timestamps
  filename?: string; // Optional, for backward compatibility with kshana-ink
}

/**
 * Convert time string to seconds.
 * Handles formats: "M:SS", "MM:SS", "H:MM:SS", "HH:MM:SS"
 */
export function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    // HH:MM:SS format
    const hours = parseInt(parts[0] ?? '0', 10) || 0;
    const minutes = parseInt(parts[1] ?? '0', 10) || 0;
    const seconds = parseInt(parts[2] ?? '0', 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    // M:SS or MM:SS format
    const minutes = parseInt(parts[0] ?? '0', 10) || 0;
    const seconds = parseInt(parts[1] ?? '0', 10) || 0;
    return minutes * 60 + seconds;
  }
  // If it's just seconds (e.g., "15")
  return parseInt(timeStr, 10) || 0;
}

/**
 * Parse image placements from the image-placements.md file content.
 * 
 * Expected format:
 * - Placement N: startTime-endTime | prompt text
 * 
 * Legacy format (filename is optional, for backward compatibility):
 * - Placement N: startTime-endTime | prompt text | filename.png
 * 
 * @param content - The content of the image-placements.md file
 * @returns Array of parsed placements, sorted by placement number
 */
export function parseImagePlacements(content: string): ParsedImagePlacement[] {
  const placements: ParsedImagePlacement[] = [];
  
  // Split by lines and process each line
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip header line (IMAGE_PLACER:) and non-placement lines
    // Use includes('Placement') for more flexible matching
    if (!trimmedLine.includes('Placement')) {
      continue;
    }
    
    // Match pattern: - Placement N: startTime-endTime | prompt [| filename]
    // Also handle: • Placement N: ... (bullet point)
    // Filename is optional (for backward compatibility)
    const placementMatch = trimmedLine.match(/^[•\-]\s*Placement\s+(\d+):\s*([^\|]+)\s*\|\s*([^\|]+)(?:\s*\|\s*(.+))?$/);
    
    if (!placementMatch || !placementMatch[1] || !placementMatch[2] || !placementMatch[3]) {
      // Try alternative format without leading dash/bullet
      const altMatch = trimmedLine.match(/Placement\s+(\d+):\s*([^\|]+)\s*\|\s*([^\|]+)(?:\s*\|\s*(.+))?$/);
      if (!altMatch || !altMatch[1] || !altMatch[2] || !altMatch[3]) {
        continue;
      }
      
      const placementNumber = parseInt(altMatch[1], 10);
      const timeRange = altMatch[2].trim();
      const prompt = altMatch[3].trim();
      // filename is altMatch[4] but ignored (for backward compatibility)
      
      // Parse time range (format: "0:49-1:06" or "04:08-04:24")
      const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
      if (!timeMatch || !timeMatch[1] || !timeMatch[2]) {
        continue;
      }
      
      placements.push({
        placementNumber,
        startTime: timeMatch[1],
        endTime: timeMatch[2],
        prompt,
      });
      continue;
    }
    
    const placementNumber = parseInt(placementMatch[1], 10);
    const timeRange = placementMatch[2].trim();
    const prompt = placementMatch[3].trim();
    // filename is placementMatch[4] but ignored (for backward compatibility)
    
    // Parse time range (format: "0:49-1:06" or "04:08-04:24")
    const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
    if (!timeMatch || !timeMatch[1] || !timeMatch[2]) {
      continue;
    }
    
    placements.push({
      placementNumber,
      startTime: timeMatch[1],
      endTime: timeMatch[2],
      prompt,
    });
  }
  
  // Sort by placement number
  placements.sort((a, b) => a.placementNumber - b.placementNumber);
  
  return placements;
}

/**
 * Round duration to nearest valid value (4-15 seconds).
 * Rounds to the nearest valid duration that matches generation capability.
 */
function roundDuration(seconds: number): number {
  // Round to nearest valid duration (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, or 15)
  if (seconds <= 4.5) return 4;
  if (seconds <= 5.5) return 5;
  if (seconds <= 6.5) return 6;
  if (seconds <= 7.5) return 7;
  if (seconds <= 8.5) return 8;
  if (seconds <= 9.5) return 9;
  if (seconds <= 10.5) return 10;
  if (seconds <= 11.5) return 11;
  if (seconds <= 12.5) return 12;
  if (seconds <= 13.5) return 13;
  if (seconds <= 14.5) return 14;
  return 15; // Cap at 15 seconds
}

/**
 * Parse video placements from the video-placements.md file content.
 * 
 * Expected format:
 * - Placement N: startTime-endTime | type=video_type | prompt text
 * 
 * Legacy format (filename is ignored):
 * - Placement N: startTime-endTime | type=video_type | prompt text | filename.mp4
 * 
 * @param content - The content of the video-placements.md file
 * @returns Array of parsed placements, sorted by placement number
 */
export function parseVideoPlacements(content: string): ParsedVideoPlacement[] {
  const placements: ParsedVideoPlacement[] = [];
  
  // Split by lines and process each line
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip header (VIDEO_PLACER:) and non-placement lines
    if (!trimmedLine.includes('Placement')) {
      continue;
    }

    // Match pattern: - Placement N: startTime-endTime | type=video_type | prompt [| filename]
    // Also handle: • Placement N: ... (bullet point)
    // Filename is optional (for backward compatibility)
    const placementMatch = trimmedLine.match(/^[•\-]\s*Placement\s+(\d+):\s*([^\|]+)\s*\|\s*type=([^\|]+)\s*\|\s*([^\|]+)(?:\s*\|\s*(.+))?$/);
    
    if (!placementMatch || !placementMatch[1] || !placementMatch[2] || !placementMatch[3] || !placementMatch[4]) {
      // Try alternative format without leading dash/bullet
      const altMatch = trimmedLine.match(/Placement\s+(\d+):\s*([^\|]+)\s*\|\s*type=([^\|]+)\s*\|\s*([^\|]+)(?:\s*\|\s*(.+))?$/);
      if (!altMatch || !altMatch[1] || !altMatch[2] || !altMatch[3] || !altMatch[4]) {
        continue;
      }
      
      const placementNumber = parseInt(altMatch[1], 10);
      const timeRange = altMatch[2].trim();
      const videoTypeStr = altMatch[3].trim();
      const prompt = altMatch[4].trim();
      const filename = altMatch[5]?.trim() || undefined;

      // Parse time range (format: "0:15-0:24" or "7:41-7:56")
      const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
      if (!timeMatch || !timeMatch[1] || !timeMatch[2]) {
        continue;
      }

      const startTime = timeMatch[1];
      const endTime = timeMatch[2];
      const startSeconds = timeStringToSeconds(startTime);
      const endSeconds = timeStringToSeconds(endTime);
      const duration = roundDuration(endSeconds - startSeconds);

      // Normalize video type
      const normalizedType = videoTypeStr.toLowerCase().trim();
      let videoType: 'cinematic_realism' | 'stock_footage' | 'motion_graphics';
      if (normalizedType === 'cinematic_realism' || normalizedType === 'cinematic-realism' || normalizedType === 'cinematic' || normalizedType === 'animation' || normalizedType === 'anim') {
        videoType = 'cinematic_realism';
      } else if (normalizedType === 'stock_footage' || normalizedType === 'stock') {
        videoType = 'stock_footage';
      } else if (normalizedType === 'motion_graphics' || normalizedType === 'motiongraphics' || normalizedType === 'motion') {
        videoType = 'motion_graphics';
      } else {
        videoType = 'cinematic_realism';
      }

      placements.push({
        placementNumber,
        startTime,
        endTime,
        videoType,
        prompt,
        duration,
        filename,
      });
      continue;
    }

    const placementNumber = parseInt(placementMatch[1], 10);
    const timeRange = placementMatch[2].trim();
    const videoTypeStr = placementMatch[3].trim();
    const prompt = placementMatch[4].trim();
    const filename = placementMatch[5]?.trim() || undefined;

    // Parse time range (format: "0:15-0:24" or "7:41-7:56")
    const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
    if (!timeMatch || !timeMatch[1] || !timeMatch[2]) {
      continue;
    }
    
    const startTime = timeMatch[1];
    const endTime = timeMatch[2];
    const startSeconds = timeStringToSeconds(startTime);
    const endSeconds = timeStringToSeconds(endTime);
    const duration = roundDuration(endSeconds - startSeconds);
    
    // Normalize video type
    const normalizedType = videoTypeStr.toLowerCase().trim();
    let videoType: 'cinematic_realism' | 'stock_footage' | 'motion_graphics';
    if (normalizedType === 'cinematic_realism' || normalizedType === 'cinematic-realism' || normalizedType === 'cinematic' || normalizedType === 'animation' || normalizedType === 'anim') {
      // Accept 'animation' for backward compatibility, but map to 'cinematic_realism'
      videoType = 'cinematic_realism';
    } else if (normalizedType === 'stock_footage' || normalizedType === 'stock') {
      videoType = 'stock_footage';
    } else if (normalizedType === 'motion_graphics' || normalizedType === 'motiongraphics' || normalizedType === 'motion') {
      videoType = 'motion_graphics';
    } else {
      // Default to cinematic_realism if unknown
      videoType = 'cinematic_realism';
    }
    
    placements.push({
      placementNumber,
      startTime,
      endTime,
      videoType,
      prompt,
      duration,
      filename,
    });
  }

  placements.sort((a, b) => a.placementNumber - b.placementNumber);
  return placements;
}
