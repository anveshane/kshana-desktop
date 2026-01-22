/**
 * useTimelineData Hook
 * Provides unified timeline data source for VideoLibraryView and TimelinePanel
 * Placement-based timeline architecture: timeline items driven by placement timestamps
 */

import { useMemo, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { usePlacementFiles } from './usePlacementFiles';
import { useTranscript } from './useTranscript';
import { timeStringToSeconds } from '../utils/placementParsers';
import { resolveAssetPathForDisplay } from '../utils/pathResolver';
import type { AssetInfo, AssetManifest } from '../types/kshana/assetManifest';
import type { SceneVersions } from '../types/kshana/timeline';

export interface TimelineItem {
  id: string; // "PLM-1", "vd-placement-1", "placeholder-start"
  type: 'image' | 'video' | 'placeholder';
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // calculated: endTime - startTime
  label: string; // "PLM-1", "vd-placement-1", "Original Footage"
  prompt?: string;
  placementNumber?: number;
  imagePath?: string; // resolved if asset matched
  videoPath?: string; // resolved if asset matched
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
    console.log(`[findAssetByPlacementNumber] No assetManifest or assets for placement ${placementNumber}`, {
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

  // Find matching asset
  const matchingAssets = assetManifest.assets.filter(
    (a) => {
      const typeMatch = a.type === assetType;
      const placementMatch = a.metadata?.placementNumber === placementNumber;
      const sceneMatch = a.scene_number === placementNumber;
      const matches = typeMatch && (placementMatch || sceneMatch);
      
      if (typeMatch && !matches) {
        console.log(`[findAssetByPlacementNumber] Asset ${a.id} type matches but placement doesn't:`, {
          assetType: a.type,
          targetType: assetType,
          assetPlacementNumber: a.metadata?.placementNumber,
          assetSceneNumber: a.scene_number,
          targetPlacementNumber: placementNumber,
        });
      }
      
      return matches;
    }
  );

  console.log(`[findAssetByPlacementNumber] Searching for placement ${placementNumber}, type ${assetType}:`, {
    totalAssets: assetManifest.assets.length,
    matchingCount: matchingAssets.length,
    matchingAssets: matchingAssets.map(a => ({
      id: a.id,
      placementNumber: a.metadata?.placementNumber,
      scene_number: a.scene_number,
      version: a.version,
    })),
  });

  if (matchingAssets.length === 0) return undefined;

  // If version is specified, find that version; otherwise get latest
  if (targetVersion !== undefined) {
    const versionAsset = matchingAssets.find((a) => a.version === targetVersion);
    if (versionAsset) return versionAsset;
  }

  // Return latest version
  return matchingAssets.reduce((latest, current) =>
    current.version > latest.version ? current : latest,
  );
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
  const { isLoaded, assetManifest } = useProject();
  const { projectDirectory } = useWorkspace();
  const { imagePlacements, videoPlacements } = usePlacementFiles();
  const { entries: transcriptEntries, totalDuration: transcriptDuration } = useTranscript();

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
  }, [isLoaded, assetManifest]);

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

      // Debug logging
      if (asset) {
        console.log(`[useTimelineData] Found asset for placement ${placement.placementNumber}:`, {
          placementNumber: placement.placementNumber,
          assetPath: asset.path,
          assetId: asset.id,
          metadata: asset.metadata,
        });
      } else {
        const imageAssets = assetManifest?.assets?.filter(a => a.type === 'scene_image') || [];
        console.log(`[useTimelineData] No asset found for placement ${placement.placementNumber}`, {
          placementNumber: placement.placementNumber,
          totalAssets: assetManifest?.assets?.length || 0,
          imageAssetsCount: imageAssets.length,
          imageAssetsPlacementNumbers: imageAssets.map(a => ({
            id: a.id,
            placementNumber: a.metadata?.placementNumber,
            scene_number: a.scene_number,
            path: a.path,
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
        imagePath: asset?.path, // Will be resolved later
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

    // Resolve paths asynchronously (we'll do this synchronously for now, but paths will be resolved in component)
    // For now, we'll just pass the paths and let the component resolve them

    // Fill gaps with placeholders
    const totalDuration = transcriptDuration || 0;
    const filledItems = fillGapsWithPlaceholders(items, totalDuration);

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
  }, [placementItems, transcriptDuration]);

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
