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

/**
 * Find asset by placement number
 * Matching priority:
 * 1. Primary: asset.metadata?.placementNumber === placementNumber
 * 2. Fallback: asset.scene_number === placementNumber
 */
function inferPlacementNumberFromPath(path: string | undefined): number | null {
  if (!path) return null;
  const filename = path.split('/').pop() ?? path;
  const match = filename.match(/image(\d+)(?:[-_]|\.|$)/i);
  if (!match) return null;
  const placementNumber = Number(match[1]);
  return Number.isNaN(placementNumber) ? null : placementNumber;
}

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
    const pathPlacementNumber = inferPlacementNumberFromPath(a.path);
    const placementMatch =
      assetPlacementNumber !== undefined &&
      (Number(assetPlacementNumber) === placementNumber ||
        String(assetPlacementNumber) === String(placementNumber));
    const sceneMatch =
      assetSceneNumber !== undefined &&
      (Number(assetSceneNumber) === placementNumber ||
        String(assetSceneNumber) === String(placementNumber));
    const pathMatch =
      pathPlacementNumber !== null && pathPlacementNumber === placementNumber;

    const matches = placementMatch || sceneMatch || pathMatch;

    if (!matches) {
      // Only log if it's the same type but wrong placement (to reduce noise)
      console.debug(
        `[findAssetByPlacementNumber] Asset ${a.id} type matches but placement doesn't:`,
        {
          assetType: a.type,
          targetType: assetType,
          assetPlacementNumber,
          assetSceneNumber,
          pathPlacementNumber,
          targetPlacementNumber: placementNumber,
          placementMatch,
          sceneMatch,
          pathMatch,
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
  // Keep infographic fallback mapping in a ref so we don't introduce new hook state
  // (avoids React Fast Refresh hook order issues in dev).
  const infographicPlacementFilesRef = useRef<Record<number, string>>({});
  const reconcileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconcileStateRef = useRef<{
    running: boolean;
    startedAt: number;
    tickCount: number;
  }>({
    running: false,
    startedAt: 0,
    tickCount: 0,
  });
  const unresolvedPlacementsRef = useRef<number[]>([]);
  const unresolvedSinceRef = useRef<Map<number, number>>(new Map());
  const previousUnresolvedRef = useRef<Set<number>>(new Set());

  // Refresh timeline function - triggers asset manifest refresh
  const refreshTimeline = useCallback(async (source: string = 'manual') => {
    console.log('[useTimelineData] Refreshing timeline', {
      source,
    });
    if (refreshAssetManifest) {
      await refreshAssetManifest();
    }
    // Avoid forcing rerenders during background reconcile ticks.
    if (source !== 'reconcile_tick') {
      setTimelineRefreshTrigger((prev) => prev + 1);
    }
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
    if (!projectDirectory) return;

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
  }, [projectDirectory]);

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
    [projectDirectory, isLoaded],
  );

  // Load image placement files for fallback resolution.
  useEffect(() => {
    const source = imagePlacementRefreshTrigger > 0 ? 'file_watch' : 'initial_load';
    loadImagePlacementFiles(source).catch((error) => {
      console.warn('[useTimelineData] Failed to load image placement files', {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [loadImagePlacementFiles, imagePlacementRefreshTrigger]);

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

  const hasImageAssetForPlacement = useCallback(
    (placementNumber: number): boolean => {
      if (!assetManifest?.assets) return false;

      const activeImageVersion = activeVersions?.[placementNumber]?.image;
      const matches = assetManifest.assets.filter((asset) => {
        if (asset.type !== 'scene_image') return false;
        const metadataPlacement = asset.metadata?.placementNumber;
        const sceneNumber = asset.scene_number;
        const pathPlacementNumber = inferPlacementNumberFromPath(asset.path);
        const placementMatch =
          metadataPlacement !== undefined &&
          Number(metadataPlacement) === placementNumber;
        const sceneMatch =
          sceneNumber !== undefined && Number(sceneNumber) === placementNumber;
        const pathMatch =
          pathPlacementNumber !== null && pathPlacementNumber === placementNumber;
        return placementMatch || sceneMatch || pathMatch;
      });

      if (matches.length === 0) return false;
      if (activeImageVersion !== undefined) {
        return matches.some(
          (asset) => asset.version === activeImageVersion && !!asset.path,
        );
      }
      return matches.some((asset) => !!asset.path);
    },
    [assetManifest, activeVersions],
  );

  const unresolvedImagePlacements = useMemo(() => {
    return imagePlacements
      .filter((placement) => {
        const hasManifestAsset = hasImageAssetForPlacement(
          placement.placementNumber,
        );
        const hasFallbackFile = !!imagePlacementFiles[placement.placementNumber];
        return !hasManifestAsset && !hasFallbackFile;
      })
      .map((placement) => placement.placementNumber);
  }, [imagePlacements, hasImageAssetForPlacement, imagePlacementFiles]);

  const unresolvedPlacementsKey = unresolvedImagePlacements.join(',');

  useEffect(() => {
    const now = Date.now();
    const previous = previousUnresolvedRef.current;
    const current = new Set(unresolvedImagePlacements);

    for (const placementNumber of current) {
      if (!previous.has(placementNumber)) {
        unresolvedSinceRef.current.set(placementNumber, now);
      }
    }

    for (const placementNumber of previous) {
      if (current.has(placementNumber)) continue;
      const unresolvedSince = unresolvedSinceRef.current.get(placementNumber);
      if (unresolvedSince !== undefined) {
        console.log('[useTimelineData][reconcile_resolved]', {
          source: 'reconcile_resolved',
          placementNumber,
          timeToVisibleMs: now - unresolvedSince,
          isFirstPlacement: placementNumber === 1,
        });
        unresolvedSinceRef.current.delete(placementNumber);
      }
    }

    previousUnresolvedRef.current = current;
    unresolvedPlacementsRef.current = unresolvedImagePlacements;
  }, [unresolvedPlacementsKey, unresolvedImagePlacements]);

  // Source-agnostic reconcile loop to recover from missed websocket/file-watch events.
  useEffect(() => {
    if (!projectDirectory || !isLoaded) {
      reconcileStateRef.current.running = false;
      if (reconcileTimeoutRef.current) {
        clearTimeout(reconcileTimeoutRef.current);
        reconcileTimeoutRef.current = null;
      }
      unresolvedPlacementsRef.current = [];
      return;
    }

    if (unresolvedImagePlacements.length === 0) {
      if (reconcileStateRef.current.running) {
        const elapsedMs = Date.now() - reconcileStateRef.current.startedAt;
        console.log('[useTimelineData][reconcile_resolved]', {
          source: 'reconcile_resolved',
          elapsedMs,
          tickCount: reconcileStateRef.current.tickCount,
          hadPlacement1: unresolvedSinceRef.current.has(1),
        });
      }
      reconcileStateRef.current.running = false;
      if (reconcileTimeoutRef.current) {
        clearTimeout(reconcileTimeoutRef.current);
        reconcileTimeoutRef.current = null;
      }
      return;
    }

    if (reconcileStateRef.current.running) {
      return;
    }

    reconcileStateRef.current = {
      running: true,
      startedAt: Date.now(),
      tickCount: 0,
    };

    const runReconcileTick = async () => {
      if (!reconcileStateRef.current.running) return;

      reconcileStateRef.current.tickCount += 1;
      const elapsedMs = Date.now() - reconcileStateRef.current.startedAt;
      const unresolved = unresolvedPlacementsRef.current;
      console.log('[useTimelineData][reconcile_tick]', {
        source: 'reconcile_tick',
        tick: reconcileStateRef.current.tickCount,
        elapsedMs,
        unresolvedCount: unresolved.length,
        unresolvedPlacements: unresolved,
      });

      await loadImagePlacementFiles('reconcile_tick');
      await refreshTimeline('reconcile_tick');

      if (!reconcileStateRef.current.running) return;
      const nextDelayMs =
        Date.now() - reconcileStateRef.current.startedAt <= 30000 ? 1000 : 5000;
      reconcileTimeoutRef.current = setTimeout(() => {
        runReconcileTick().catch((error) => {
          console.warn('[useTimelineData][reconcile_tick] Tick failed', {
            source: 'reconcile_tick',
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, nextDelayMs);
    };

    runReconcileTick().catch((error) => {
      console.warn('[useTimelineData][reconcile_tick] Initial tick failed', {
        source: 'reconcile_tick',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [
    projectDirectory,
    isLoaded,
    unresolvedPlacementsKey,
    unresolvedImagePlacements.length,
    loadImagePlacementFiles,
    refreshTimeline,
  ]);

  useEffect(() => {
    return () => {
      reconcileStateRef.current.running = false;
      if (reconcileTimeoutRef.current) {
        clearTimeout(reconcileTimeoutRef.current);
        reconcileTimeoutRef.current = null;
      }
    };
  }, []);

  // Convert base placements (images + videos) to timeline items
  const basePlacementItems: TimelineItem[] = useMemo(() => {
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

    return items;
  }, [
    imagePlacements,
    videoPlacements,
    assetManifest,
    activeVersions,
    imagePlacementFiles,
  ]);

  // Convert infographic placements to overlay items (contained within images)
  const overlayItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

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
