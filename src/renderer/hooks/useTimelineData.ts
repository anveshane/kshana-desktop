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
import { useWordCaptions } from './useWordCaptions';
import { timeStringToSeconds } from '../utils/placementParsers';
import type { AssetInfo } from '../types/kshana/assetManifest';
import type { SceneVersions, TimelineTrack } from '../types/kshana/timeline';
import type { TextOverlayCue } from '../types/captions';
import { PROJECT_PATHS } from '../types/kshana';
import {
  createEmptyImageProjectionSnapshot,
  selectBestAssetForPlacement,
  type ImageProjectionSnapshot,
} from '../services/assets';
import {
  applyImageTimingOverridesToItems,
  applyInfographicTimingOverridesToItems,
  applyVideoSplitOverridesToItems,
  applyRippleTimingFromImageDurationEdits,
  type ImageTimingOverride,
  type VideoSplitOverride,
} from '../utils/timelineImageEditing';

export interface TimelineItem {
  id: string; // "PLM-1", "vd-placement-1", "info-placement-1", "placeholder-start", "audio-1"
  type:
    | 'image'
    | 'video'
    | 'infographic'
    | 'placeholder'
    | 'audio'
    | 'text_overlay'
    | 'text'
    | 'sticker'
    | 'graphics';
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // calculated: endTime - startTime
  label: string;
  prompt?: string;
  placementNumber?: number;
  imagePath?: string; // resolved if asset matched
  videoPath?: string; // resolved if asset matched (also used for infographic mp4)
  audioPath?: string; // path to audio file
  sourceStartTime?: number; // original placement start (before UI override)
  sourceEndTime?: number; // original placement end (before UI override)
  sourceOffsetSeconds?: number; // source media offset for split/trimmed video segments
  sourcePlacementNumber?: number; // original placement number for derived segments
  sourcePlacementDurationSeconds?: number; // original full source duration
  segmentIndex?: number; // derived segment index for split video
  textOverlayCue?: TextOverlayCue;
  trackId?: string;
  elementId?: string;
  textContent?: string;
  isMissing?: boolean;
}

export interface TimelineData {
  timelineItems: TimelineItem[];
  overlayItems: TimelineItem[];
  textOverlayItems: TimelineItem[];
  textOverlayCues: TextOverlayCue[];
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

function resolveElementPathForExistence(
  projectDirectory: string | null,
  sourcePath: string,
): string {
  const normalized = sourcePath.replace(/\\/g, '/');
  if (!projectDirectory) return normalized;
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return normalized;
  }
  return `${projectDirectory}/${normalized}`;
}

function mapRichTracksToTimelineItems(
  tracks: TimelineTrack[],
  missingPaths: Set<string>,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  tracks.forEach((track) => {
    if (track.hidden) return;

    track.elements.forEach((element) => {
      const startTime = element.start_time_seconds;
      const duration = Math.max(0, element.duration_seconds);
      const endTime = startTime + duration;

      if (element.type === 'video' || element.type === 'image') {
        const sourcePath = element.source_path;
        items.push({
          id: `track-${track.id}-${element.id}`,
          type: element.type,
          startTime,
          endTime,
          duration,
          label: element.name,
          videoPath: element.type === 'video' ? sourcePath : undefined,
          imagePath: element.type === 'image' ? sourcePath : undefined,
          trackId: track.id,
          elementId: element.id,
          isMissing: missingPaths.has(sourcePath),
        });
        return;
      }

      if (element.type === 'audio') {
        if (track.muted || element.muted) return;
        items.push({
          id: `track-${track.id}-${element.id}`,
          type: 'audio',
          startTime,
          endTime,
          duration,
          label: element.name || 'Audio',
          audioPath: element.source_path,
          trackId: track.id,
          elementId: element.id,
          isMissing: missingPaths.has(element.source_path),
        });
        return;
      }

      if (element.type === 'text') {
        items.push({
          id: `track-${track.id}-${element.id}`,
          type: 'text',
          startTime,
          endTime,
          duration,
          label: element.name || 'Text',
          textContent: element.content,
          trackId: track.id,
          elementId: element.id,
        });
        return;
      }

      if (element.type === 'sticker') {
        items.push({
          id: `track-${track.id}-${element.id}`,
          type: 'sticker',
          startTime,
          endTime,
          duration,
          label: element.name || 'Sticker',
          trackId: track.id,
          elementId: element.id,
        });
        return;
      }

      items.push({
        id: `track-${track.id}-${element.id}`,
        type: 'graphics',
        startTime,
        endTime,
        duration,
        label: element.name || 'Graphics',
        trackId: track.id,
        elementId: element.id,
      });
    });
  });

  return items;
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
    timelineState,
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
  const { cues: wordCaptionCues } = useWordCaptions();
  const [audioFiles, setAudioFiles] = useState<
    Array<{ path: string; duration: number }>
  >([]);
  const [audioRefreshTrigger, setAudioRefreshTrigger] = useState(0);
  const [timelineRefreshTrigger, setTimelineRefreshTrigger] = useState(0);
  const [imagePlacementFiles, setImagePlacementFiles] = useState<
    Record<number, string>
  >({});
  const [videoPlacementFiles, setVideoPlacementFiles] = useState<
    Record<number, string>
  >({});
  const [imagePlacementRefreshTrigger, setImagePlacementRefreshTrigger] =
    useState(0);
  const [imageProjectionSnapshot, setImageProjectionSnapshot] =
    useState<ImageProjectionSnapshot>(() => getImageProjectionSnapshot());
  const [missingTrackPaths, setMissingTrackPaths] = useState<Set<string>>(
    new Set(),
  );
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
    if (!projectDirectory || !isLoaded) {
      setMissingTrackPaths(new Set());
      return;
    }

    const sourcePaths = new Set<string>();
    (timelineState.tracks ?? []).forEach((track) => {
      track.elements.forEach((element) => {
        if (
          (element.type === 'video' ||
            element.type === 'image' ||
            element.type === 'audio') &&
          element.source_path
        ) {
          sourcePaths.add(element.source_path);
        }
      });
    });

    if (sourcePaths.size === 0) {
      setMissingTrackPaths(new Set());
      return;
    }

    let cancelled = false;
    const checkPaths = async () => {
      const missing = new Set<string>();
      await Promise.all(
        [...sourcePaths].map(async (sourcePath) => {
          const absolutePath = resolveElementPathForExistence(
            projectDirectory,
            sourcePath,
          );
          const exists =
            await window.electron.project.checkFileExists(absolutePath);
          if (!exists) {
            missing.add(sourcePath);
          }
        }),
      );
      if (!cancelled) {
        setMissingTrackPaths(missing);
      }
    };

    checkPaths().catch(() => {
      if (!cancelled) {
        setMissingTrackPaths(new Set());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectDirectory, isLoaded, timelineState.tracks]);

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
      const filePath = event.path.replace(/\\/g, '/');
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
  // Single consolidated file watcher (debounced) for audio/video/infographic fallback; image placements only when v2 is off.
  useEffect(() => {
    if (!projectDirectory) return;

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path.replace(/\\/g, '/');
      const isAudio = filePath.includes('.kshana/agent/audio');
      const isImagePlacement = filePath.includes('.kshana/agent/image-placements');
      const isInfographic = filePath.includes('.kshana/agent/infographic-placements');
      const isVideoPlacement = filePath.includes('.kshana/agent/video-placements');

      if (!isAudio && !isImagePlacement && !isInfographic && !isVideoPlacement) return;

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (isAudio) setAudioRefreshTrigger((prev) => prev + 1);
        if (isImagePlacement && !isImageSyncV2Enabled) {
          setImagePlacementRefreshTrigger((prev) => prev + 1);
        }
        if (isInfographic || isVideoPlacement) {
          setTimelineRefreshTrigger((prev) => prev + 1);
        }
        debounceTimeout = null;
      }, 300);
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [projectDirectory, isImageSyncV2Enabled]);

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

  // Load video placement files for fallback resolution
  useEffect(() => {
    if (!projectDirectory || !isLoaded) return;

    const loadVideoPlacementFiles = async () => {
      try {
        const videoDir = `${projectDirectory}/.kshana/agent/video-placements`;
        const files = await window.electron.project.readTree(videoDir, 1);

        const placementMap: Record<number, string> = {};
        if (files && files.children) {
          const candidateFiles = files.children
            .filter((file) => file.type === 'file')
            .map((file) => file.name)
            .sort((a, b) => b.localeCompare(a));

          for (const name of candidateFiles) {
            const match = name.match(/^video(\d+)[-_].+\.(mp4|mov|webm)$/i);
            if (!match) continue;
            const placementNumber = parseInt(match[1], 10);
            if (!Number.isNaN(placementNumber) && !placementMap[placementNumber]) {
              placementMap[placementNumber] = `agent/video-placements/${name}`;
            }
          }
        }

        setVideoPlacementFiles((prev) =>
          arePlacementMapsEqual(prev, placementMap) ? prev : placementMap,
        );
      } catch (error) {
        console.debug(
          '[useTimelineData] Video placements directory not found or error loading:',
          error,
        );
        setVideoPlacementFiles((prev) =>
          Object.keys(prev).length === 0 ? prev : {},
        );
      }
    };

    loadVideoPlacementFiles();
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
        ? projectedImagePath || null
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
        imagePath: selectedImagePath ?? undefined,
        sourceStartTime: startSeconds,
        sourceEndTime: endSeconds,
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

      const videoFallbackPath = videoPlacementFiles[placement.placementNumber];
      const resolvedVideoPath = asset?.path || videoFallbackPath || undefined;

      items.push({
        id: `vd-placement-${placement.placementNumber}`,
        type: 'video',
        startTime: startSeconds,
        endTime: endSeconds,
        duration: endSeconds - startSeconds,
        label: `vd-placement-${placement.placementNumber}`,
        prompt: placement.prompt,
        placementNumber: placement.placementNumber,
        videoPath: resolvedVideoPath,
        sourceStartTime: startSeconds,
        sourceEndTime: endSeconds,
        sourceOffsetSeconds: 0,
        sourcePlacementNumber: placement.placementNumber,
        sourcePlacementDurationSeconds: endSeconds - startSeconds,
        segmentIndex: 0,
      });
    });

    const imageOverrides: Record<string, ImageTimingOverride> =
      timelineState.image_timing_overrides ?? {};
    const withImageDurationEdits = applyImageTimingOverridesToItems(items, imageOverrides);
    const videoSplitOverrides: Record<string, VideoSplitOverride> =
      timelineState.video_split_overrides ?? {};
    const withVideoSplits = applyVideoSplitOverridesToItems(
      withImageDurationEdits,
      videoSplitOverrides,
    );
    return applyRippleTimingFromImageDurationEdits(withVideoSplits);
  }, [
    imagePlacements,
    videoPlacements,
    assetManifest,
    activeVersions,
    imagePlacementFiles,
    videoPlacementFiles,
    imageProjectionSnapshot,
    isImageSyncV2CompareEnabled,
    isImageSyncV2Enabled,
    timelineState.image_timing_overrides,
    timelineState.video_split_overrides,
  ]);

  // Convert infographic placements to overlay items (can be standalone or within images)
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
        console.info(
          `[useTimelineData] Infographic placement ${placement.placementNumber} is standalone (not contained within an image placement)`,
          {
            placementNumber: placement.placementNumber,
            startSeconds,
            endSeconds,
          },
        );
        // Continue processing instead of dropping the infographic
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
        sourceStartTime: startSeconds,
        sourceEndTime: endSeconds,
      });
    });

    const infographicOverrides: Record<string, ImageTimingOverride> =
      timelineState.infographic_timing_overrides ?? {};
    const withInfographicTimingEdits = applyInfographicTimingOverridesToItems(
      items,
      infographicOverrides,
    );
    withInfographicTimingEdits.sort((a, b) => a.startTime - b.startTime);

    return withInfographicTimingEdits;
  }, [
    infographicPlacements,
    imagePlacements,
    assetManifest,
    activeVersions,
    timelineState.infographic_timing_overrides,
    timelineRefreshTrigger,
  ]);

  const textOverlayItems: TimelineItem[] = useMemo(() => {
    if (wordCaptionCues.length === 0) return [];
    const cueStart = Math.min(...wordCaptionCues.map((cue) => cue.startTime));
    const cueEnd = Math.max(...wordCaptionCues.map((cue) => cue.endTime));
    const startTime = Number.isFinite(cueStart) ? Math.max(0, cueStart) : 0;
    const endTime = Number.isFinite(cueEnd)
      ? Math.max(startTime + 0.01, cueEnd)
      : startTime + 0.01;

    return [
      {
        id: 'text-overlay-track',
        type: 'text_overlay',
        startTime,
        endTime,
        duration: endTime - startTime,
        label: 'Text Captions',
      },
    ];
  }, [wordCaptionCues]);

  const richTrackItems: TimelineItem[] = useMemo(() => {
    const tracks = timelineState.tracks ?? [];
    if (tracks.length === 0) return [];
    return mapRichTracksToTimelineItems(tracks, missingTrackPaths);
  }, [timelineState.tracks, missingTrackPaths]);

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

    const textOverlayDuration =
      wordCaptionCues.length > 0
        ? Math.max(...wordCaptionCues.map((cue) => cue.endTime))
        : 0;

    const richTrackDuration =
      richTrackItems.length > 0
        ? Math.max(...richTrackItems.map((item) => item.endTime))
        : 0;

    // Use the maximum of all three - whichever is longest
    const maxDuration = Math.max(
      maxAudioDuration,
      lastPlacementEndTime,
      transcriptDur,
      textOverlayDuration,
      richTrackDuration,
    );

    console.log('[useTimelineData] Calculated total duration:', {
      maxAudioDuration,
      lastPlacementEndTime,
      transcriptDur,
      textOverlayDuration,
      richTrackDuration,
      maxDuration,
    });

    return maxDuration;
  }, [
    audioFiles,
    basePlacementItems,
    transcriptDuration,
    wordCaptionCues,
    richTrackItems,
  ]);

  // Resolve asset paths for display
  const timelineItems: TimelineItem[] = useMemo(() => {
    // Start with placement items and rich track items from timeline schema v2.
    const items = [...basePlacementItems, ...richTrackItems];

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

    // Fill gaps only for primary visual clips.
    const primaryVisualItems = items.filter(
      (item) =>
        item.type === 'image' ||
        item.type === 'video' ||
        item.type === 'infographic',
    );
    const filledItems = fillGapsWithPlaceholders(
      primaryVisualItems,
      calculatedTotalDuration,
    );

    // Add non-primary tracks back without affecting placeholder generation.
    const nonPrimaryItems = items.filter(
      (item) =>
        item.type !== 'image' &&
        item.type !== 'video' &&
        item.type !== 'infographic',
    );
    filledItems.push(...nonPrimaryItems);

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
  }, [
    basePlacementItems,
    richTrackItems,
    transcriptDuration,
    audioFiles,
    calculatedTotalDuration,
  ]);

  // Return the calculated total duration (already considers all sources)
  const totalDuration = calculatedTotalDuration;

  return {
    timelineItems,
    overlayItems,
    textOverlayItems,
    textOverlayCues: wordCaptionCues,
    totalDuration,
    refreshTimeline,
    refreshAudioFiles,
  };
}
