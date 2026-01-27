/**
 * useTimelineData Hook
 * Provides unified timeline data source for VideoLibraryView and TimelinePanel
 * Placement-based timeline architecture: timeline items driven by placement timestamps
 */

import { useMemo, useEffect, useState, useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { usePlacementFiles } from './usePlacementFiles';
import { useTranscript } from './useTranscript';
import { timeStringToSeconds } from '../utils/placementParsers';
import { resolveAssetPathForDisplay } from '../utils/pathResolver';
import type { AssetInfo, AssetManifest } from '../types/kshana/assetManifest';
import type { SceneVersions } from '../types/kshana/timeline';
import { PROJECT_PATHS } from '../types/kshana';

export interface TimelineItem {
  id: string; // "PLM-1", "vd-placement-1", "placeholder-start", "audio-1"
  type: 'image' | 'video' | 'placeholder' | 'audio';
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // calculated: endTime - startTime
  label: string; // "PLM-1", "vd-placement-1", "Original Footage", "Audio Track"
  prompt?: string;
  placementNumber?: number;
  imagePath?: string; // resolved if asset matched
  videoPath?: string; // resolved if asset matched
  audioPath?: string; // path to audio file
}

export interface TimelineData {
  timelineItems: TimelineItem[];
  totalDuration: number;
}

/**
 * Find asset by placement number
 * Matching priority:
 * 1. Primary: asset.metadata?.placementNumber === placementNumber
 * 2. Fallback: asset.scene_number === placementNumber
 */
function findAssetByPlacementNumber(
  placementNumber: number,
  assetManifest: AssetManifest | null,
  assetType: 'scene_image' | 'scene_video',
  activeVersions?: Record<number, SceneVersions>,
): AssetInfo | undefined {
  if (!assetManifest?.assets) {
    console.warn(`[findAssetByPlacementNumber] No assetManifest or assets for placement ${placementNumber}`, {
      hasManifest: !!assetManifest,
      hasAssets: !!assetManifest?.assets,
    });
    return undefined;
  }

  // Get active version if specified
  const activeVersion = activeVersions?.[placementNumber];
  const targetVersion = assetType === 'scene_image'
    ? activeVersion?.image
    : activeVersion?.video;

  // Find matching asset with improved logging
  const matchingAssets = assetManifest.assets.filter(
    (a) => {
      const typeMatch = a.type === assetType;
      if (!typeMatch) return false;

      // Check both metadata.placementNumber and scene_number
      // Handle type coercion (placementNumber might be number or string)
      const assetPlacementNumber = a.metadata?.placementNumber;
      const assetSceneNumber = a.scene_number;
      const placementMatch = assetPlacementNumber !== undefined && 
        (Number(assetPlacementNumber) === placementNumber || 
         String(assetPlacementNumber) === String(placementNumber));
      const sceneMatch = assetSceneNumber !== undefined &&
        (Number(assetSceneNumber) === placementNumber ||
         String(assetSceneNumber) === String(placementNumber));
      const matches = placementMatch || sceneMatch;
      
      if (!matches) {
        // Only log if it's the same type but wrong placement (to reduce noise)
        console.debug(`[findAssetByPlacementNumber] Asset ${a.id} type matches but placement doesn't:`, {
          assetType: a.type,
          targetType: assetType,
          assetPlacementNumber: assetPlacementNumber,
          assetSceneNumber: assetSceneNumber,
          targetPlacementNumber: placementNumber,
          placementMatch,
          sceneMatch,
        });
      }
      
      return matches;
    }
  );

  if (matchingAssets.length === 0) {
    // Enhanced logging when no match found
    const allAssetsOfType = assetManifest.assets.filter(a => a.type === assetType);
    console.warn(`[findAssetByPlacementNumber] No matching asset found for placement ${placementNumber}, type ${assetType}`, {
      totalAssets: assetManifest.assets.length,
      assetsOfType: allAssetsOfType.length,
      availablePlacements: allAssetsOfType.map(a => ({
        id: a.id,
        placementNumber: a.metadata?.placementNumber,
        scene_number: a.scene_number,
        version: a.version,
        path: a.path,
      })),
    });
    return undefined;
  }

  console.log(`[findAssetByPlacementNumber] Found ${matchingAssets.length} matching asset(s) for placement ${placementNumber}, type ${assetType}:`, {
    matchingAssets: matchingAssets.map(a => ({
      id: a.id,
      placementNumber: a.metadata?.placementNumber,
      scene_number: a.scene_number,
      version: a.version,
      path: a.path,
    })),
    targetVersion,
  });

  // If version is specified, find that version; otherwise get latest
  if (targetVersion !== undefined) {
    const versionAsset = matchingAssets.find((a) => a.version === targetVersion);
    if (versionAsset) {
      console.log(`[findAssetByPlacementNumber] Using specified version ${targetVersion} for placement ${placementNumber}`);
      return versionAsset;
    } else {
      console.warn(`[findAssetByPlacementNumber] Specified version ${targetVersion} not found, using latest`);
    }
  }

  // Return latest version
  const latest = matchingAssets.reduce((latest, current) =>
    current.version > latest.version ? current : latest,
  );
  console.log(`[findAssetByPlacementNumber] Using latest version ${latest.version} for placement ${placementNumber}`);
  return latest;
}

/**
 * Create a placeholder timeline item for "Original Footage"
 */
function createPlaceholderItem(
  startTime: number,
  endTime: number,
  id?: string,
): TimelineItem {
  return {
    id: id || `placeholder-${startTime}-${endTime}`,
    type: 'placeholder',
    startTime,
    endTime,
    duration: endTime - startTime,
    label: 'Original Footage',
  };
}

/**
 * Fill gaps between placements with placeholder items
 */
function fillGapsWithPlaceholders(
  placementItems: TimelineItem[],
  totalDuration: number,
): TimelineItem[] {
  const allItems: TimelineItem[] = [];
  let currentTime = 0;

  // Sort placements by startTime
  const sorted = [...placementItems].sort((a, b) => a.startTime - b.startTime);

  for (const placement of sorted) {
    // Add placeholder before placement if gap exists
    if (placement.startTime > currentTime) {
      allItems.push(createPlaceholderItem(currentTime, placement.startTime));
    }
    // Add placement
    allItems.push(placement);
    currentTime = Math.max(currentTime, placement.endTime);
  }

  // Add placeholder after last placement
  if (currentTime < totalDuration) {
    allItems.push(createPlaceholderItem(currentTime, totalDuration));
  }

  return allItems;
}

/**
 * Custom hook that provides unified timeline data
 * Single source of truth for timeline calculations
 * Placement-based architecture: timeline driven by placement timestamps
 */
export function useTimelineData(
  activeVersions?: Record<number, SceneVersions>,
): TimelineData {
  const { isLoaded, assetManifest, refreshAssetManifest } = useProject();
  const { projectDirectory } = useWorkspace();
  const { imagePlacements, videoPlacements } = usePlacementFiles();
  const { entries: transcriptEntries, totalDuration: transcriptDuration } = useTranscript();
  const [audioFiles, setAudioFiles] = useState<Array<{ path: string; duration: number }>>([]);
  const [audioRefreshTrigger, setAudioRefreshTrigger] = useState(0);
  const [timelineRefreshTrigger, setTimelineRefreshTrigger] = useState(0);

  // Refresh timeline function - triggers asset manifest refresh
  const refreshTimeline = useCallback(async () => {
    console.log('[useTimelineData] Refreshing timeline...');
    if (refreshAssetManifest) {
      await refreshAssetManifest();
    }
    // Also trigger a local refresh
    setTimelineRefreshTrigger((prev) => prev + 1);
  }, [refreshAssetManifest]);

  // Expose refresh functions via window for external triggers
  useEffect(() => {
    (window as any).refreshAudioFiles = () => {
      setAudioRefreshTrigger((prev) => prev + 1);
    };
    (window as any).refreshTimeline = refreshTimeline;
    return () => {
      delete (window as any).refreshAudioFiles;
      delete (window as any).refreshTimeline;
    };
  }, [refreshTimeline]);

  // Load audio files from .kshana/agent/audio directory
  useEffect(() => {
    if (!projectDirectory || !isLoaded) return;

    const loadAudioFiles = async () => {
      try {
        const audioDir = `${projectDirectory}/${PROJECT_PATHS.AGENT_AUDIO}`;
        const files = await window.electron.project.readTree(audioDir, 1);
        
        const audioFilesList: Array<{ path: string; duration: number }> = [];
        
        if (files && files.children) {
          for (const file of files.children) {
            if (file.type === 'file' && file.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)) {
              const audioPath = `${PROJECT_PATHS.AGENT_AUDIO}/${file.name}`;
              // Get actual duration from audio file
              const fullAudioPath = `${projectDirectory}/${audioPath}`;
              let duration = 0;
              try {
                duration = await window.electron.project.getAudioDuration(fullAudioPath);
                console.log(`[useTimelineData] Got audio duration for ${file.name}: ${duration}s`);
              } catch (error) {
                console.warn(`[useTimelineData] Failed to get duration for ${file.name}:`, error);
                // Fallback to transcript duration if available
                duration = transcriptDuration || 0;
              }
              audioFilesList.push({
                path: audioPath,
                duration,
              });
            }
          }
        }
        
        setAudioFiles(audioFilesList);
      } catch (error) {
        // Directory might not exist yet, that's okay
        console.debug('[useTimelineData] Audio directory not found or error loading:', error);
        setAudioFiles([]);
      }
    };

    loadAudioFiles();
  }, [projectDirectory, isLoaded, transcriptDuration, audioRefreshTrigger]);

  // Debug: Log assetManifest state
  useEffect(() => {
    console.log('[useTimelineData] AssetManifest state:', {
      isLoaded,
      hasManifest: !!assetManifest,
      totalAssets: assetManifest?.assets?.length || 0,
      imageAssets: assetManifest?.assets?.filter(a => a.type === 'scene_image').map(a => ({
        id: a.id,
        placementNumber: a.metadata?.placementNumber,
        scene_number: a.scene_number,
        path: a.path,
        metadata: a.metadata,
      })) || [],
      videoAssets: assetManifest?.assets?.filter(a => a.type === 'scene_video').map(a => ({
        id: a.id,
        placementNumber: a.metadata?.placementNumber,
        scene_number: a.scene_number,
        path: a.path,
      })) || [],
    });
  }, [isLoaded, assetManifest, timelineRefreshTrigger]);

  // Listen for asset manifest changes and trigger refresh if needed
  useEffect(() => {
    if (assetManifest && isLoaded) {
      // Asset manifest changed - timeline will automatically update via useMemo dependencies
      console.log('[useTimelineData] Asset manifest updated, timeline will refresh');
    }
  }, [assetManifest, isLoaded]);

  // Convert placements to timeline items
  const placementItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // Convert image placements to timeline items
    imagePlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

      // Find matching asset
      const asset = findAssetByPlacementNumber(
        placement.placementNumber,
        assetManifest,
        'scene_image',
        activeVersions,
      );

      // Enhanced logging and validation
      if (asset) {
        if (!asset.path) {
          console.error(`[useTimelineData] Asset found for placement ${placement.placementNumber} but has no path:`, {
            placementNumber: placement.placementNumber,
            assetId: asset.id,
            assetPath: asset.path,
            metadata: asset.metadata,
          });
        } else {
          console.log(`[useTimelineData] Found asset for placement ${placement.placementNumber}:`, {
            placementNumber: placement.placementNumber,
            assetPath: asset.path,
            assetId: asset.id,
            version: asset.version,
            metadata: asset.metadata,
          });
        }
      } else {
        const imageAssets = assetManifest?.assets?.filter(a => a.type === 'scene_image') || [];
        console.warn(`[useTimelineData] No asset found for placement ${placement.placementNumber}`, {
          placementNumber: placement.placementNumber,
          totalAssets: assetManifest?.assets?.length || 0,
          imageAssetsCount: imageAssets.length,
          imageAssetsPlacementNumbers: imageAssets.map(a => ({
            id: a.id,
            placementNumber: a.metadata?.placementNumber,
            scene_number: a.scene_number,
            path: a.path,
            version: a.version,
          })),
          assetManifestExists: !!assetManifest,
          assetsArrayExists: !!assetManifest?.assets,
        });
      }

      items.push({
        id: `PLM-${placement.placementNumber}`,
        type: 'image',
        startTime: startSeconds,
        endTime: endSeconds,
        duration: endSeconds - startSeconds,
        label: `PLM-${placement.placementNumber}`,
        prompt: placement.prompt,
        placementNumber: placement.placementNumber,
        imagePath: asset?.path || undefined, // Ensure path is set if asset exists
      });
    });

    // Convert video placements to timeline items
    videoPlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

      // Find matching asset
      const asset = findAssetByPlacementNumber(
        placement.placementNumber,
        assetManifest,
        'scene_video',
        activeVersions,
      );

      items.push({
        id: `vd-placement-${placement.placementNumber}`,
        type: 'video',
        startTime: startSeconds,
        endTime: endSeconds,
        duration: endSeconds - startSeconds,
        label: `vd-placement-${placement.placementNumber}`,
        prompt: placement.prompt,
        placementNumber: placement.placementNumber,
        videoPath: asset?.path, // Will be resolved later
      });
    });

    return items;
  }, [imagePlacements, videoPlacements, assetManifest, activeVersions]);

  // Resolve asset paths for display
  const timelineItems: TimelineItem[] = useMemo(() => {
    // Start with placement items
    const items = [...placementItems];

    // Add audio items - they span the full duration
    audioFiles.forEach((audioFile, index) => {
      items.push({
        id: `audio-${index}`,
        type: 'audio',
        startTime: 0,
        endTime: audioFile.duration || transcriptDuration || 0,
        duration: audioFile.duration || transcriptDuration || 0,
        label: 'Audio Track',
        audioPath: audioFile.path,
      });
    });

    // Fill gaps with placeholders (but don't fill gaps for audio items)
    const nonAudioItems = items.filter((item) => item.type !== 'audio');
    const totalDuration = transcriptDuration || 0;
    const filledItems = fillGapsWithPlaceholders(nonAudioItems, totalDuration);

    // Add audio items back
    const audioItems = items.filter((item) => item.type === 'audio');
    filledItems.push(...audioItems);

    // If no placements and no transcript, return empty
    if (filledItems.length === 0 && totalDuration === 0) {
      return [];
    }

    // If no placements but transcript exists, return single placeholder
    if (filledItems.length === 0 && totalDuration > 0) {
      return [createPlaceholderItem(0, totalDuration)];
    }

    // Sort all items by startTime
    filledItems.sort((a, b) => a.startTime - b.startTime);

    return filledItems;
  }, [placementItems, transcriptDuration, audioFiles]);

  // Calculate total duration from transcript or timeline items
  const totalDuration = useMemo(() => {
    if (transcriptDuration > 0) {
      return transcriptDuration;
    }
    if (timelineItems.length === 0) return 0;
    const lastItem = timelineItems[timelineItems.length - 1];
    return lastItem.endTime;
  }, [transcriptDuration, timelineItems]);

  return {
    timelineItems,
    totalDuration,
  };
}
