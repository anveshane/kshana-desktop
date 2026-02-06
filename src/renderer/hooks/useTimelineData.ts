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
import type { AssetInfo } from '../types/kshana/assetManifest';
import type { SceneVersions } from '../types/kshana/timeline';
import { PROJECT_PATHS } from '../types/kshana';
import {
  createEmptyImageProjectionSnapshot,
  selectBestAssetForPlacement,
  type ImageProjectionSnapshot,
} from '../services/assets';

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
  overlayItems: TimelineItem[];
  totalDuration: number;
}

export interface TimelineDataWithRefresh extends TimelineData {
  refreshTimeline: () => Promise<void>;
  refreshAudioFiles: () => void;
}

function arePlacementMapsEqual(
  left: Record<number, string>,
  right: Record<number, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[Number(key)] === right[Number(key)]);
}

function findAssetByPlacementNumber(
  placementNumber: number,
  assets: AssetInfo[],
  assetType: 'scene_image' | 'scene_video' | 'scene_infographic',
  activeVersions?: Record<number, SceneVersions>,
): AssetInfo | undefined {
  const activeVersion = activeVersions?.[placementNumber];
  const targetVersion =
    assetType === 'scene_image'
      ? activeVersion?.image
      : assetType === 'scene_video'
        ? activeVersion?.video
        : undefined; // infographic: no versioning yet

  return selectBestAssetForPlacement(
    assets,
    placementNumber,
    assetType,
    targetVersion,
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
): TimelineDataWithRefresh {
  const {
    isLoaded,
    assetManifest,
    refreshAssetManifest,
    isImageSyncV2Enabled,
    subscribeImageProjection,
    getImageProjectionSnapshot,
    triggerImageProjectionReconcile,
    setExpectedImagePlacements,
  } = useProject();
  const { projectDirectory } = useWorkspace();
  const { imagePlacements, videoPlacements, infographicPlacements } =
    usePlacementFiles();
  const { totalDuration: transcriptDuration } = useTranscript();
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
  const [imageProjectionSnapshot, setImageProjectionSnapshot] =
    useState<ImageProjectionSnapshot>(() => getImageProjectionSnapshot());
  const isImageSyncV2CompareEnabled = useMemo(() => {
    try {
      return window.localStorage.getItem('renderer.image_sync_v2_compare') === 'true';
    } catch {
      return false;
    }
  }, []);
  // Keep infographic fallback mapping in a ref so we don't introduce new hook state
  // (avoids React Fast Refresh hook order issues in dev).
  const infographicPlacementFilesRef = useRef<Record<number, string>>({});

  useEffect(() => {
    if (!isImageSyncV2Enabled) {
      setImageProjectionSnapshot(createEmptyImageProjectionSnapshot(null));
      return;
    }

    return subscribeImageProjection((snapshot) => {
      setImageProjectionSnapshot(snapshot);
    });
  }, [isImageSyncV2Enabled, subscribeImageProjection]);

  useEffect(() => {
    if (!isImageSyncV2Enabled) return;
    const placementNumbers = imagePlacements.map(
      (placement) => placement.placementNumber,
    );
    setExpectedImagePlacements(placementNumbers);
    triggerImageProjectionReconcile('manual');
  }, [
    isImageSyncV2Enabled,
    imagePlacements,
    setExpectedImagePlacements,
    triggerImageProjectionReconcile,
  ]);

  // Refresh timeline function - triggers asset manifest refresh
  const refreshTimeline = useCallback(async (source: string = 'manual') => {
    console.log('[useTimelineData] Refreshing timeline', {
      source,
    });
    if (isImageSyncV2Enabled) {
      triggerImageProjectionReconcile('manual');
    }
    if (refreshAssetManifest) {
      await refreshAssetManifest();
    }
    setTimelineRefreshTrigger((prev) => prev + 1);
  }, [
    refreshAssetManifest,
    isImageSyncV2Enabled,
    triggerImageProjectionReconcile,
  ]);

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

      console.log('[useTimelineData][file_watch]', {
        source: 'file_watch',
        scope: 'audio',
        path: filePath,
      });

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
    if (!projectDirectory || isImageSyncV2Enabled) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;
      if (!filePath.includes('.kshana/agent/image-placements')) return;

      console.log('[useTimelineData][file_watch]', {
        source: 'file_watch',
        scope: 'image-placements',
        path: filePath,
      });

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
  }, [projectDirectory, isImageSyncV2Enabled]);

  // Subscribe to file changes under .kshana/agent/infographic-placements for fallback infographic loading
  useEffect(() => {
    if (!projectDirectory) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;
      if (!filePath.includes('.kshana/agent/infographic-placements')) return;

      console.log('[useTimelineData][file_watch]', {
        source: 'file_watch',
        scope: 'infographic-placements',
        path: filePath,
      });

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

  const loadImagePlacementFiles = useCallback(
    async (source: 'file_watch' | 'reconcile_tick' | 'initial_load') => {
      if (isImageSyncV2Enabled) {
        setImagePlacementFiles((prev) =>
          Object.keys(prev).length === 0 ? prev : {},
        );
        return;
      }
      if (!projectDirectory || !isLoaded) {
        setImagePlacementFiles((prev) =>
          Object.keys(prev).length === 0 ? prev : {},
        );
        return;
      }

      try {
        const imageDir = `${projectDirectory}/.kshana/agent/image-placements`;
        const files = await window.electron.project.readTree(imageDir, 1);

        const placementMap: Record<number, string> = {};
        if (files && files.children) {
          const candidateFiles = files.children
            .filter((file) => file.type === 'file')
            .map((file) => file.name)
            .sort((a, b) => b.localeCompare(a)); // deterministic selection across refreshes

          for (const name of candidateFiles) {
            const match = name.match(/^image(\d+)[-_].+\.(png|jpe?g|webp)$/i);
            if (!match) continue;
            const placementNumber = parseInt(match[1], 10);
            if (!Number.isNaN(placementNumber) && !placementMap[placementNumber]) {
              placementMap[placementNumber] = `agent/image-placements/${name}`;
            }
          }
        }

        console.log('[useTimelineData][reconcile_scan]', {
          source,
          placementCount: Object.keys(placementMap).length,
        });
        setImagePlacementFiles((prev) =>
          arePlacementMapsEqual(prev, placementMap) ? prev : placementMap,
        );
      } catch (error) {
        console.debug(
          '[useTimelineData] Image placements directory not found or error loading:',
          error,
        );
        setImagePlacementFiles((prev) =>
          Object.keys(prev).length === 0 ? prev : {},
        );
      }
    },
    [projectDirectory, isLoaded, isImageSyncV2Enabled],
  );

  // Load image placement files for fallback resolution.
  useEffect(() => {
    if (isImageSyncV2Enabled) return;
    const source = imagePlacementRefreshTrigger > 0 ? 'file_watch' : 'initial_load';
    loadImagePlacementFiles(source).catch((error) => {
      console.warn('[useTimelineData] Failed to load image placement files', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [loadImagePlacementFiles, imagePlacementRefreshTrigger, isImageSyncV2Enabled]);

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

  // Convert base placements (images + videos) to timeline items
  const basePlacementItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
    const assets = assetManifest?.assets ?? [];

    // Convert image placements to timeline items
    imagePlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

      // Find matching asset
      const asset = findAssetByPlacementNumber(
        placement.placementNumber,
        assets,
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

      const projectedImagePath = isImageSyncV2Enabled
        ? imageProjectionSnapshot.placements[placement.placementNumber]?.path
        : null;
      const legacyFallbackPath = imagePlacementFiles[placement.placementNumber];
      const legacyResolvedPath = asset?.path || legacyFallbackPath || undefined;

      if (
        isImageSyncV2Enabled &&
        isImageSyncV2CompareEnabled &&
        projectedImagePath !== legacyResolvedPath
      ) {
        console.warn('[useTimelineData][image_sync.mismatch]', {
          placementNumber: placement.placementNumber,
          v2Path: projectedImagePath ?? null,
          legacyPath: legacyResolvedPath ?? null,
          assetPath: asset?.path ?? null,
          fallbackPath: legacyFallbackPath ?? null,
        });
      }

      const selectedImagePath = isImageSyncV2Enabled
        ? projectedImagePath || legacyResolvedPath
        : legacyResolvedPath;

      if (!asset && selectedImagePath) {
        console.warn(
          `[useTimelineData] Using fallback image for placement ${placement.placementNumber}:`,
          selectedImagePath,
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
        imagePath: selectedImagePath,
      });
    });

    // Convert video placements to timeline items
    videoPlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

      const asset = findAssetByPlacementNumber(
        placement.placementNumber,
        assets,
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

    return items;
  }, [
    imagePlacements,
    videoPlacements,
    assetManifest,
    activeVersions,
    imagePlacementFiles,
    imageProjectionSnapshot,
    isImageSyncV2CompareEnabled,
    isImageSyncV2Enabled,
  ]);

  // Convert infographic placements to overlay items (contained within images)
  const overlayItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
    const assets = assetManifest?.assets ?? [];

    if (infographicPlacements.length === 0) {
      return items;
    }

    const imageRanges = imagePlacements.map((placement) => ({
      placementNumber: placement.placementNumber,
      start: timeStringToSeconds(placement.startTime),
      end: timeStringToSeconds(placement.endTime),
    }));

    infographicPlacements.forEach((placement) => {
      const startSeconds = timeStringToSeconds(placement.startTime);
      const endSeconds = timeStringToSeconds(placement.endTime);

      const contained = imageRanges.some(
        (range) => startSeconds >= range.start && endSeconds <= range.end,
      );

      if (!contained) {
        console.warn(
          `[useTimelineData] Dropping infographic placement ${placement.placementNumber}: not contained within any image placement`,
          {
            placementNumber: placement.placementNumber,
            startSeconds,
            endSeconds,
          },
        );
        return;
      }

      const asset = findAssetByPlacementNumber(
        placement.placementNumber,
        assets,
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
        videoPath: asset?.path || fallbackInfoPath, // infographics are overlay clips (webm/mp4)
      });
    });

    items.sort((a, b) => a.startTime - b.startTime);

    return items;
  }, [
    infographicPlacements,
    imagePlacements,
    assetManifest,
    activeVersions,
    timelineRefreshTrigger,
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
      basePlacementItems.length > 0
        ? Math.max(...basePlacementItems.map((item) => item.endTime))
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
  }, [audioFiles, basePlacementItems, transcriptDuration]);

  // Resolve asset paths for display
  const timelineItems: TimelineItem[] = useMemo(() => {
    // Start with placement items
    const items = [...basePlacementItems];

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
  }, [basePlacementItems, transcriptDuration, audioFiles, calculatedTotalDuration]);

  // Return the calculated total duration (already considers all sources)
  const totalDuration = calculatedTotalDuration;

  return {
    timelineItems,
    overlayItems,
    totalDuration,
    refreshTimeline,
    refreshAudioFiles,
  };
}
