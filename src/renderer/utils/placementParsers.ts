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
}

/**
 * Convert time string (e.g., "0:08", "1:23", "7:41") to seconds.
 * Handles both "M:SS" and "MM:SS" formats.
 */
export function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
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
 * Also handles legacy format with filename (ignored):
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
    // Look for lines that start with "- Placement"
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('- Placement')) {
      continue;
    }
    
    // Try format without filename first: - Placement N: startTime-endTime | prompt
    const noFilenameMatch = trimmedLine.match(/^-\s+Placement\s+(\d+):\s*([^\|]+)\s*\|\s*([^\|]+)$/);
    
    if (noFilenameMatch && noFilenameMatch[1] && noFilenameMatch[2] && noFilenameMatch[3]) {
      const placementNumber = parseInt(noFilenameMatch[1], 10);
      const timeRange = noFilenameMatch[2].trim();
      const prompt = noFilenameMatch[3].trim();
      
      // Parse time range (format: "0:08-0:24" or "04:08-04:24")
      const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
      if (timeMatch && timeMatch[1] && timeMatch[2]) {
        placements.push({
          placementNumber,
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          prompt,
        });
        continue;
      }
    }
    
    // Try format with filename (legacy support, filename is ignored)
    const withFilenameMatch = trimmedLine.match(/^-\s+Placement\s+(\d+):\s*([^\|]+)\s*\|\s*([^\|]+)\s*\|\s*(.+)$/);
    
    if (withFilenameMatch && withFilenameMatch[1] && withFilenameMatch[2] && withFilenameMatch[3]) {
      const placementNumber = parseInt(withFilenameMatch[1], 10);
      const timeRange = withFilenameMatch[2].trim();
      const prompt = withFilenameMatch[3].trim();
      // filename is ignored (withFilenameMatch[4])
      
      // Parse time range (format: "0:08-0:24" or "04:08-04:24")
      const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
      if (timeMatch && timeMatch[1] && timeMatch[2]) {
        placements.push({
          placementNumber,
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          prompt,
        });
        continue;
      }
    }
    
    // Try alternative format without leading dash
    const altMatch = trimmedLine.match(/Placement\s+(\d+):\s*([^\|]+)\s*\|\s*([^\|]+)$/);
    if (altMatch && altMatch[1] && altMatch[2] && altMatch[3]) {
      const placementNumber = parseInt(altMatch[1], 10);
      const timeRange = altMatch[2].trim();
      const prompt = altMatch[3].trim();
      
      const timeMatch = timeRange.match(/^([\d:]+)-([\d:]+)$/);
      if (timeMatch && timeMatch[1] && timeMatch[2]) {
        placements.push({
          placementNumber,
          startTime: timeMatch[1],
          endTime: timeMatch[2],
          prompt,
        });
      }
    }
  }
  
  // Sort by placement number
  placements.sort((a, b) => a.placementNumber - b.placementNumber);
  
  return placements;
}

/**
 * Round duration to nearest valid value (4 or 5 seconds for optimization).
 */
function roundDuration(seconds: number): number {
  // Optimized for speed: prefer 4-5 seconds instead of longer durations
  if (seconds <= 4.5) return 4;
  return 5;
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
    // Look for lines that start with "- Placement" or "• Placement" or just "Placement"
    const trimmedLine = line.trim();
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
      // filename is altMatch[5] but not used in frontend
      
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
      });
      continue;
    }
    
    const placementNumber = parseInt(placementMatch[1], 10);
    const timeRange = placementMatch[2].trim();
    const videoTypeStr = placementMatch[3].trim();
    const prompt = placementMatch[4].trim();
    // filename is placementMatch[5] but not used in frontend
    
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
    });
  }
  
  // Sort by placement number
  placements.sort((a, b) => a.placementNumber - b.placementNumber);
  
  return placements;
}
