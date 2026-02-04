/**
 * useTimelineData Hook
 * Provides unified timeline data source for VideoLibraryView and TimelinePanel
 * Placement-based timeline architecture: timeline items driven by placement timestamps
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
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
  id: string; // "PLM-1", "vd-placement-1", "info-placement-1", "placeholder-start", "audio-1"
  type: 'image' | 'video' | 'infographic' | 'placeholder' | 'audio';
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // calculated: endTime - startTime
  label: string;
  prompt?: string;
  placementNumber?: number;
  imagePath?: string; // resolved if asset matched
  videoPath?: string; // resolved if asset matched (also used for infographic mp4)
  audioPath?: string; // path to audio file
}

export interface TimelineData {
  timelineItems: TimelineItem[];
  totalDuration: number;
}

export interface TimelineDataWithRefresh extends TimelineData {
  refreshTimeline: () => Promise<void>;
  refreshAudioFiles: () => void;
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
  assetType: 'scene_image' | 'scene_video' | 'scene_infographic',
  activeVersions?: Record<number, SceneVersions>,
): AssetInfo | undefined {
  if (!assetManifest?.assets) {
    console.warn(
      `[findAssetByPlacementNumber] No assetManifest or assets for placement ${placementNumber}`,
      {
        hasManifest: !!assetManifest,
        hasAssets: !!assetManifest?.assets,
      },
    );
    return undefined;
  }

  const activeVersion = activeVersions?.[placementNumber];
  const targetVersion =
    assetType === 'scene_image'
      ? activeVersion?.image
      : assetType === 'scene_video'
        ? activeVersion?.video
        : undefined; // infographic: no versioning yet

  // Find matching asset with improved logging
  const matchingAssets = assetManifest.assets.filter((a) => {
    const typeMatch = a.type === assetType;
    if (!typeMatch) return false;

    // Check both metadata.placementNumber and scene_number
    // Handle type coercion (placementNumber might be number or string)
    const assetPlacementNumber = a.metadata?.placementNumber;
    const assetSceneNumber = a.scene_number;
    const placementMatch =
      assetPlacementNumber !== undefined &&
      (Number(assetPlacementNumber) === placementNumber ||
        String(assetPlacementNumber) === String(placementNumber));
    const sceneMatch =
      assetSceneNumber !== undefined &&
      (Number(assetSceneNumber) === placementNumber ||
        String(assetSceneNumber) === String(placementNumber));

    const matches = placementMatch || sceneMatch;

    if (!matches) {
      // Only log if it's the same type but wrong placement (to reduce noise)
      console.debug(
        `[findAssetByPlacementNumber] Asset ${a.id} type matches but placement doesn't:`,
        {
          assetType: a.type,
          targetType: assetType,
          assetPlacementNumber,
          assetSceneNumber,
          targetPlacementNumber: placementNumber,
          placementMatch,
          sceneMatch,
        },
      );
    }

    return matches;
  });

  if (matchingAssets.length === 0) {
    // Enhanced logging when no match found
    const allAssetsOfType = assetManifest.assets.filter(
      (a) => a.type === assetType,
    );
    console.warn(
      `[findAssetByPlacementNumber] No matching asset found for placement ${placementNumber}, type ${assetType}`,
      {
        totalAssets: assetManifest.assets.length,
        assetsOfType: allAssetsOfType.length,
        availablePlacements: allAssetsOfType.map((a) => ({
          id: a.id,
          placementNumber: a.metadata?.placementNumber,
          scene_number: a.scene_number,
          version: a.version,
          path: a.path,
        })),
      },
    );
    return undefined;
  }

  console.log(
    `[findAssetByPlacementNumber] Found ${matchingAssets.length} matching asset(s) for placement ${placementNumber}, type ${assetType}:`,
    {
      matchingAssets: matchingAssets.map((a) => ({
        id: a.id,
        placementNumber: a.metadata?.placementNumber,
        scene_number: a.scene_number,
        version: a.version,
        path: a.path,
      })),
      targetVersion,
    },
  );

  // If version is specified, find that version; otherwise get latest
  if (targetVersion !== undefined) {
    const versionAsset = matchingAssets.find(
      (a) => a.version === targetVersion,
    );
    if (versionAsset) {
      console.log(
        `[findAssetByPlacementNumber] Using specified version ${targetVersion} for placement ${placementNumber}`,
      );
      return versionAsset;
    }
    console.warn(
      `[findAssetByPlacementNumber] Specified version ${targetVersion} not found, using latest`,
    );
  }

  // Return latest version
  const latest = matchingAssets.reduce((latest, current) =>
    current.version > latest.version ? current : latest,
  );
  console.log(
    `[findAssetByPlacementNumber] Using latest version ${latest.version} for placement ${placementNumber}`,
  );
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
): TimelineDataWithRefresh {
  const {
    isLoaded,
    assetManifest,
    refreshAssetManifest,
    isImageGenerationActive,
  } = useProject();
  const { projectDirectory } = useWorkspace();
  const { imagePlacements, videoPlacements, infographicPlacements } =
    usePlacementFiles();
  const { entries: transcriptEntries, totalDuration: transcriptDuration } =
    useTranscript();
  const [audioFiles, setAudioFiles] = useState<
    Array<{ path: string; duration: number }>
  >([]);
  const [audioRefreshTrigger, setAudioRefreshTrigger] = useState(0);
  const [timelineRefreshTrigger, setTimelineRefreshTrigger] = useState(0);
  const [imagePlacementFiles, setImagePlacementFiles] = useState<
    Record<number, string>
  >({});
  const [imagePlacementRefreshTrigger, setImagePlacementRefreshTrigger] =
    useState(0);
  // Keep infographic fallback mapping in a ref so we don't introduce new hook state
  // (avoids React Fast Refresh hook order issues in dev).
  const infographicPlacementFilesRef = useRef<Record<number, string>>({});
  const stalenessCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const stalenessRefreshInFlightRef = useRef(false);

  // Refresh timeline function - triggers asset manifest refresh
  const refreshTimeline = useCallback(async () => {
    console.log('[useTimelineData] Refreshing timeline...');
    if (refreshAssetManifest) {
      await refreshAssetManifest();
    }
    // Also trigger a local refresh
    setTimelineRefreshTrigger((prev) => prev + 1);
  }, [refreshAssetManifest]);

  // Refresh audio files - invoked by import handler or file watcher
  const refreshAudioFiles = useCallback(() => {
    setAudioRefreshTrigger((prev) => prev + 1);
  }, []);

  // Subscribe to file changes under .kshana/agent/audio so UI updates when audio is added by agent or elsewhere
  useEffect(() => {
    if (!projectDirectory) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;
      if (!filePath.includes('.kshana/agent/audio')) return;

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        setAudioRefreshTrigger((prev) => prev + 1);
        debounceTimeout = null;
      }, 250);
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [projectDirectory]);

  // Subscribe to file changes under .kshana/agent/image-placements for fallback image loading
  useEffect(() => {
    if (!projectDirectory) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;
      if (!filePath.includes('.kshana/agent/image-placements')) return;

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        setImagePlacementRefreshTrigger((prev) => prev + 1);
        debounceTimeout = null;
      }, 250);
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [projectDirectory]);

  // Subscribe to file changes under .kshana/agent/infographic-placements for fallback infographic loading
  useEffect(() => {
    if (!projectDirectory) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;
      if (!filePath.includes('.kshana/agent/infographic-placements')) return;

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        // Reuse existing refresh triggers to force a rerender & reload cycle.
        setTimelineRefreshTrigger((prev) => prev + 1);
        debounceTimeout = null;
      }, 250);
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [projectDirectory]);

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
            if (
              file.type === 'file' &&
              file.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
            ) {
              const audioPath = `${PROJECT_PATHS.AGENT_AUDIO}/${file.name}`;
              // Get actual duration from audio file
              const fullAudioPath = `${projectDirectory}/${audioPath}`;
              let duration = 0;
              try {
                duration =
                  await window.electron.project.getAudioDuration(fullAudioPath);
                console.log(
                  `[useTimelineData] Got audio duration for ${file.name}: ${duration}s`,
                );
              } catch (error) {
                console.warn(
                  `[useTimelineData] Failed to get duration for ${file.name}:`,
                  error,
                );
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
        console.debug(
          '[useTimelineData] Audio directory not found or error loading:',
          error,
        );
        setAudioFiles([]);
      }
    };

    loadAudioFiles();
  }, [projectDirectory, isLoaded, transcriptDuration, audioRefreshTrigger]);

  // Load image placement files for fallback resolution
  useEffect(() => {
    if (!projectDirectory || !isLoaded) return;

    const loadImagePlacementFiles = async () => {
      try {
        const imageDir = `${projectDirectory}/.kshana/agent/image-placements`;
        const files = await window.electron.project.readTree(imageDir, 1);

        const placementMap: Record<number, string> = {};
        if (files && files.children) {
          for (const file of files.children) {
            if (file.type !== 'file') continue;
            const match = file.name.match(
              /^image(\d+)[-_].+\.(png|jpe?g|webp)$/i,
            );
            if (!match) continue;
            const placementNumber = parseInt(match[1], 10);
            if (!Number.isNaN(placementNumber)) {
              if (!placementMap[placementNumber]) {
                placementMap[
                  placementNumber
                ] = `agent/image-placements/${file.name}`;
              }
            }
          }
        }

        setImagePlacementFiles(placementMap);
      } catch (error) {
        console.debug(
          '[useTimelineData] Image placements directory not found or error loading:',
          error,
        );
        setImagePlacementFiles({});
      }
    };

    loadImagePlacementFiles();
  }, [projectDirectory, isLoaded, imagePlacementRefreshTrigger]);

  // Load infographic placement files for fallback resolution
  useEffect(() => {
    if (!projectDirectory || !isLoaded) return;

    const loadInfographicPlacementFiles = async () => {
      try {
        const infoDir = `${projectDirectory}/.kshana/agent/infographic-placements`;
        const files = await window.electron.project.readTree(infoDir, 1);

        const placementMap: Record<number, string> = {};
        if (files && files.children) {
          for (const file of files.children) {
            if (file.type !== 'file') continue;
            const match = file.name.match(/^info(\d+)[-_].+\.(mp4|mov|webm)$/i);
            if (!match) continue;
            const placementNumber = parseInt(match[1], 10);
            if (!Number.isNaN(placementNumber)) {
              if (!placementMap[placementNumber]) {
                placementMap[
                  placementNumber
                ] = `agent/infographic-placements/${file.name}`;
              }
            }
          }
        }

        infographicPlacementFilesRef.current = placementMap;
      } catch (error) {
        console.debug(
          '[useTimelineData] Infographic placements directory not found or error loading:',
          error,
        );
        infographicPlacementFilesRef.current = {};
      }
    };

    loadInfographicPlacementFiles();
  }, [projectDirectory, isLoaded, timelineRefreshTrigger]);

  // Debug: Log assetManifest state
  useEffect(() => {
    console.log('[useTimelineData] AssetManifest state:', {
      isLoaded,
      hasManifest: !!assetManifest,
      totalAssets: assetManifest?.assets?.length || 0,
      imageAssets:
        assetManifest?.assets
          ?.filter((a) => a.type === 'scene_image')
          .map((a) => ({
            id: a.id,
            placementNumber: a.metadata?.placementNumber,
            scene_number: a.scene_number,
            path: a.path,
            metadata: a.metadata,
          })) || [],
      videoAssets:
        assetManifest?.assets
          ?.filter((a) => a.type === 'scene_video')
          .map((a) => ({
            id: a.id,
            placementNumber: a.metadata?.placementNumber,
            scene_number: a.scene_number,
            path: a.path,
          })) || [],
      infographicAssets:
        assetManifest?.assets
          ?.filter((a) => a.type === 'scene_infographic')
          .map((a) => ({
            id: a.id,
            placementNumber: a.metadata?.placementNumber,
            path: a.path,
          })) || [],
    });
  }, [isLoaded, assetManifest, timelineRefreshTrigger]);

  // Listen for asset manifest changes and trigger refresh if needed
  useEffect(() => {
    if (assetManifest && isLoaded) {
      // Asset manifest changed - timeline will automatically update via useMemo dependencies
      console.log(
        '[useTimelineData] Asset manifest updated, timeline will refresh',
      );
    }
  }, [assetManifest, isLoaded]);

  // Staleness check during image generation
  useEffect(() => {
    if (!isImageGenerationActive) {
      if (stalenessCheckTimeoutRef.current) {
        clearTimeout(stalenessCheckTimeoutRef.current);
        stalenessCheckTimeoutRef.current = null;
      }
      return;
    }

    const expectedPlacements = new Set(
      imagePlacements.map((p) => p.placementNumber),
    );
    if (expectedPlacements.size === 0) return;

    const imageAssets =
      assetManifest?.assets?.filter((a) => a.type === 'scene_image') || [];
    const matchedPlacements = new Set<number>();
    for (const asset of imageAssets) {
      const placementNumber = asset.metadata?.placementNumber;
      const sceneNumber = asset.scene_number;
      const candidate =
        placementNumber !== undefined
          ? Number(placementNumber)
          : sceneNumber !== undefined
            ? Number(sceneNumber)
            : undefined;
      if (candidate !== undefined && expectedPlacements.has(candidate)) {
        matchedPlacements.add(candidate);
      }
    }

    const missingCount = expectedPlacements.size - matchedPlacements.size;
    if (missingCount <= 0) return;

    if (stalenessCheckTimeoutRef.current) {
      clearTimeout(stalenessCheckTimeoutRef.current);
    }

    stalenessCheckTimeoutRef.current = setTimeout(async () => {
      if (stalenessRefreshInFlightRef.current) return;
      stalenessRefreshInFlightRef.current = true;
      try {
        await refreshTimeline();
      } finally {
        stalenessRefreshInFlightRef.current = false;
      }
    }, 1000);
  }, [
    isImageGenerationActive,
    imagePlacements,
    assetManifest,
    refreshTimeline,
  ]);

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
          console.error(
            `[useTimelineData] Asset found for placement ${placement.placementNumber} but has no path:`,
            {
              placementNumber: placement.placementNumber,
              assetId: asset.id,
              assetPath: asset.path,
              metadata: asset.metadata,
            },
          );
        } else {
          console.log(
            `[useTimelineData] Found asset for placement ${placement.placementNumber}:`,
            {
              placementNumber: placement.placementNumber,
              assetPath: asset.path,
              assetId: asset.id,
              version: asset.version,
              metadata: asset.metadata,
            },
          );
        }
      } else {
        const imageAssets =
          assetManifest?.assets?.filter((a) => a.type === 'scene_image') || [];
        console.warn(
          `[useTimelineData] No asset found for placement ${placement.placementNumber}`,
          {
            placementNumber: placement.placementNumber,
            totalAssets: assetManifest?.assets?.length || 0,
            imageAssetsCount: imageAssets.length,
            imageAssetsPlacementNumbers: imageAssets.map((a) => ({
              id: a.id,
              placementNumber: a.metadata?.placementNumber,
              scene_number: a.scene_number,
              path: a.path,
              version: a.version,
            })),
            assetManifestExists: !!assetManifest,
            assetsArrayExists: !!assetManifest?.assets,
          },
        );
      }

      const fallbackImagePath = imagePlacementFiles[placement.placementNumber];

      if (!asset && fallbackImagePath) {
        console.warn(
          `[useTimelineData] Using fallback image for placement ${placement.placementNumber}:`,
          fallbackImagePath,
        );
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
        imagePath: asset?.path || fallbackImagePath || undefined, // Ensure path is set if asset exists
      });
    });

    // Convert video placements to timeline items
    videoPlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

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
        videoPath: asset?.path,
      });
    });

    // Convert infographic placements to timeline items
    infographicPlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

      const asset = findAssetByPlacementNumber(
        placement.placementNumber,
        assetManifest,
        'scene_infographic',
        activeVersions,
      );
      const fallbackInfoPath =
        infographicPlacementFilesRef.current[placement.placementNumber];

      items.push({
        id: `info-placement-${placement.placementNumber}`,
        type: 'infographic',
        startTime: startSeconds,
        endTime: endSeconds,
        duration: endSeconds - startSeconds,
        label: `info-placement-${placement.placementNumber}`,
        prompt: placement.prompt,
        placementNumber: placement.placementNumber,
        videoPath: asset?.path || fallbackInfoPath, // infographics are mp4 clips
      });
    });

    return items;
  }, [
    imagePlacements,
    videoPlacements,
    infographicPlacements,
    assetManifest,
    activeVersions,
    imagePlacementFiles,
  ]);

  // Calculate total duration from all sources (audio, placements, transcript)
  // Use whichever is longest - audio may be longer than scenes, or scenes may be longer than audio
  const calculatedTotalDuration = useMemo(() => {
    // Get max audio duration (if any audio files exist)
    const maxAudioDuration =
      audioFiles.length > 0
        ? Math.max(...audioFiles.map((af) => af.duration || 0))
        : 0;

    // Get last placement endTime (if any placements exist)
    const lastPlacementEndTime =
      placementItems.length > 0
        ? Math.max(...placementItems.map((item) => item.endTime))
        : 0;

    // Get transcript duration
    const transcriptDur = transcriptDuration || 0;

    // Use the maximum of all three - whichever is longest
    const maxDuration = Math.max(
      maxAudioDuration,
      lastPlacementEndTime,
      transcriptDur,
    );

    console.log('[useTimelineData] Calculated total duration:', {
      maxAudioDuration,
      lastPlacementEndTime,
      transcriptDur,
      maxDuration,
    });

    return maxDuration;
  }, [audioFiles, placementItems, transcriptDuration]);

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
    // Use calculated total duration instead of just transcriptDuration
    const filledItems = fillGapsWithPlaceholders(
      nonAudioItems,
      calculatedTotalDuration,
    );

    // Add audio items back
    const audioItems = items.filter((item) => item.type === 'audio');
    filledItems.push(...audioItems);

    // If no placements and no transcript, return empty
    if (filledItems.length === 0 && calculatedTotalDuration === 0) {
      return [];
    }

    // If no placements but content exists, return single placeholder
    if (filledItems.length === 0 && calculatedTotalDuration > 0) {
      return [createPlaceholderItem(0, calculatedTotalDuration)];
    }

    // Sort all items by startTime
    filledItems.sort((a, b) => a.startTime - b.startTime);

    return filledItems;
  }, [placementItems, transcriptDuration, audioFiles, calculatedTotalDuration]);

  // Return the calculated total duration (already considers all sources)
  const totalDuration = calculatedTotalDuration;

  return {
    timelineItems,
    totalDuration,
    refreshTimeline,
    refreshAudioFiles,
  };
}
