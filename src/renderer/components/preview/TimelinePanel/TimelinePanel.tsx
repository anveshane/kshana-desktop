import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Upload,
  Scissors,
  Edit2,
  FileText,
  Music,
} from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { useTimelineWebSocket } from '../../../hooks/useTimelineWebSocket';
import { type TimelineItem } from '../../../hooks/useTimelineData';
import { useTimelineDataContext } from '../../../contexts/TimelineDataContext';
import {
  resolveAssetPathForDisplay,
  resolveAssetPathWithRetry,
} from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import type { TimelineMarker } from '../../../types/projectState';
import type { KshanaTimelineMarker, ImportedClip } from '../../../types/kshana';
import type { SceneVersions } from '../../../types/kshana/timeline';
import { PROJECT_PATHS, createAssetInfo } from '../../../types/kshana';
import TimelineMarkerComponent from '../TimelineMarker/TimelineMarker';
import MarkerPromptPopover from '../TimelineMarker/MarkerPromptPopover';
import VersionSelector from '../VersionSelector';
import AudioImportModal from './AudioImportModal';
import styles from './TimelinePanel.module.scss';

// Timeline Item Component for proper hook usage
interface TimelineItemComponentProps {
  item: TimelineItem;
  left: number;
  width: number;
  projectDirectory: string | null;
  isSelected: boolean;
  onItemClick?: (
    e: React.MouseEvent<HTMLDivElement>,
    item: TimelineItem,
  ) => void;
}

function TimelineItemComponent({
  item,
  left,
  width,
  projectDirectory,
  isSelected,
  onItemClick,
}: TimelineItemComponentProps) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const imageRetryCountRef = React.useRef<number>(0);
  const imageResolveAbortRef = React.useRef<AbortController | null>(null);

  // Resolve video path from item (video and infographic both use videoPath for mp4)
  useEffect(() => {
    if (
      (item.type === 'video' || item.type === 'infographic') &&
      item.videoPath
    ) {
      resolveAssetPathForDisplay(item.videoPath, projectDirectory).then(
        (resolved) => {
          setVideoPath(resolved);
        },
      );
    } else {
      setVideoPath(null);
    }
  }, [item.type, item.videoPath, projectDirectory]);

  // Resolve image path from timeline item only (projection-backed in v2).
  useEffect(() => {
    if (item.type !== 'image') {
      setImagePath(null);
      setImageLoading(false);
      setImageLoadError(false);
      imageRetryCountRef.current = 0;
      return;
    }

    // Abort previous resolution if still pending
    if (imageResolveAbortRef.current) {
      imageResolveAbortRef.current.abort();
    }
    imageResolveAbortRef.current = new AbortController();
    const abortController = imageResolveAbortRef.current;

    setImageLoading(true);
    setImageLoadError(false);

    const pathToResolve = item.imagePath;

    if (pathToResolve) {
      console.log(
        `[TimelineItemComponent] Resolving image path for ${item.label}:`,
        {
          itemImagePath: item.imagePath,
          resolvedPath: pathToResolve,
          projectDirectory,
          placementNumber: item.placementNumber,
        },
      );

      // Use retry logic for path resolution
      resolveAssetPathWithRetry(pathToResolve, projectDirectory, {
        maxRetries: 3,
        retryDelayBase: 500,
        timeout: 5000,
        verifyExists: true,
      })
        .then(async (resolved) => {
          if (abortController.signal.aborted) return;

          console.log(
            `[TimelineItemComponent] Resolved path for ${item.label}:`,
            resolved,
          );
          setImageLoading(false);
          imageRetryCountRef.current = 0;

          // For test images, try to convert to base64
          if (shouldUseBase64(resolved)) {
            try {
              const base64 = await imageToBase64(resolved);
              if (base64 && !abortController.signal.aborted) {
                console.log(
                  `[TimelineItemComponent] Using base64 for ${item.label}`,
                );
                setImagePath(base64);
                return;
              }
            } catch (error) {
              console.warn(
                `[TimelineItemComponent] Failed to convert to base64:`,
                error,
              );
            }
          }
          // Fallback to file:// path
          if (!abortController.signal.aborted) {
            setImagePath(resolved);
          }
        })
        .catch((error) => {
          if (abortController.signal.aborted) return;

          console.error(
            `[TimelineItemComponent] Failed to resolve image path for ${item.label}:`,
            error,
          );
          setImageLoading(false);

          // Retry mechanism for image load failures
          if (imageRetryCountRef.current < 3) {
            imageRetryCountRef.current += 1;
            const retryDelay = 1000 * imageRetryCountRef.current;
            console.log(
              `[TimelineItemComponent] Retrying image load in ${retryDelay}ms (attempt ${imageRetryCountRef.current}/3)`,
            );
            setTimeout(() => {
              if (!abortController.signal.aborted) {
                // Trigger re-resolution by updating a dependency
                setImageLoadError(true);
              }
            }, retryDelay);
          } else {
            setImageLoadError(true);
            setImagePath(null);
          }
        });
    } else {
      if (item.type === 'image') {
        console.warn(
          `[TimelineItemComponent] No imagePath for ${item.label}:`,
          {
            itemImagePath: item.imagePath,
            placementNumber: item.placementNumber,
          },
        );
      }
      setImageLoading(false);
      setImagePath(null);
    }

    // Cleanup function
    return () => {
      if (imageResolveAbortRef.current) {
        imageResolveAbortRef.current.abort();
        imageResolveAbortRef.current = null;
      }
    };
  }, [
    item.type,
    item.imagePath,
    item.label,
    item.placementNumber,
    projectDirectory,
    imageLoadError,
  ]);

  // Handle placeholder type
  if (item.type === 'placeholder') {
    return (
      <div
        className={`${styles.sceneBlock} ${styles.placeholderBlock} ${isSelected ? styles.selected : ''}`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          if (onItemClick) {
            onItemClick(e, item);
          }
        }}
        title={item.label}
      >
        <div className={styles.scenePlaceholder} />
        <div className={styles.sceneId}>{item.label}</div>
      </div>
    );
  }

  // Handle audio type
  if (item.type === 'audio' && item.audioPath) {
    return (
      <div
        className={`${styles.audioBlock} ${isSelected ? styles.selected : ''}`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          if (onItemClick) {
            onItemClick(e, item);
          }
        }}
        title={item.label}
      >
        <div className={styles.audioWaveform} />
        <div className={styles.audioLabel}>{item.label}</div>
      </div>
    );
  }

  // Handle video type
  if (item.type === 'video' && videoPath) {
    return (
      <div
        className={`${styles.videoBlock} ${isSelected ? styles.selected : ''}`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          if (onItemClick) {
            onItemClick(e, item);
          }
        }}
        title={item.prompt || item.label}
      >
        <video
          src={videoPath}
          className={styles.videoThumbnail}
          preload="metadata"
          muted
        />
        <div className={styles.videoLabel}>{item.label}</div>
      </div>
    );
  }

  // Handle infographic type (mp4 from Remotion, same as video block)
  if (item.type === 'infographic' && videoPath) {
    return (
      <div
        className={`${styles.videoBlock} ${isSelected ? styles.selected : ''}`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          if (onItemClick) {
            onItemClick(e, item);
          }
        }}
        title={item.prompt || item.label}
      >
        <video
          src={videoPath}
          className={styles.videoThumbnail}
          preload="metadata"
          muted
        />
        <div className={styles.videoLabel}>{item.label}</div>
      </div>
    );
  }

  if (item.type === 'infographic' && !videoPath) {
    return (
      <div
        className={`${styles.videoBlock} ${isSelected ? styles.selected : ''}`}
        style={{ left: `${left}px`, width: `${width}px` }}
        onClick={(e) => onItemClick && onItemClick(e, item)}
        title={item.prompt || item.label}
      >
        <div className={styles.scenePlaceholder}>Info</div>
        <div className={styles.videoLabel}>{item.label}</div>
      </div>
    );
  }

  // Handle image type
  let thumbnailElement: React.ReactNode;
  if (imagePath) {
    thumbnailElement = (
      <img
        src={imagePath}
        alt={item.label}
        className={styles.sceneThumbnail}
        onError={() => {
          console.error(
            `[TimelineItemComponent] Image load error for ${item.label}`,
          );
          setImagePath(null);
          setImageLoadError(true);
        }}
      />
    );
  } else if (imageLoading) {
    thumbnailElement = (
      <div className={styles.scenePlaceholder}>
        <div style={{ fontSize: '10px', opacity: 0.5 }}>Loading...</div>
      </div>
    );
  } else {
    thumbnailElement = <div className={styles.scenePlaceholder} />;
  }

  return (
    <div
      className={`${styles.sceneBlock} ${isSelected ? styles.selected : ''}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
      onClick={(e) => {
        if (onItemClick) {
          onItemClick(e, item);
        }
      }}
      title={item.prompt || item.label}
    >
      {thumbnailElement}
      <div className={styles.sceneId}>{item.label}</div>
      {item.prompt && (
        <div className={styles.sceneDescription} title={item.prompt}>
          {item.prompt.length > 50
            ? `${item.prompt.substring(0, 50)}...`
            : item.prompt}
        </div>
      )}
    </div>
  );
}

// Format time as HH:MM:SS:FF (hours:minutes:seconds:frames)
const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30); // Assuming 30 fps
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
};

// Convert seconds to pixels based on zoom level
const secondsToPixels = (seconds: number, zoomLevel: number): number => {
  const pixelsPerSecond = 50 * zoomLevel; // Base: 50px per second
  return seconds * pixelsPerSecond;
};

// Convert pixels to seconds based on zoom level
const pixelsToSeconds = (pixels: number, zoomLevel: number): number => {
  const pixelsPerSecond = 50 * zoomLevel;
  return pixels / pixelsPerSecond;
};

/** Seconds of empty space after last scene so the timeline can be scrolled past content. Playhead stays within content only. */
const TAIL_PADDING_SECONDS = 5;

interface TimelinePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onResize: (e: React.MouseEvent) => void;
  // eslint-disable-next-line react/require-default-props
  playbackTime?: number;
  // eslint-disable-next-line react/require-default-props
  isPlaying?: boolean;
  // eslint-disable-next-line react/require-default-props
  onSeek?: (time: number) => void;
  // eslint-disable-next-line react/require-default-props
  onPlayPause?: (playing: boolean) => void;
  // eslint-disable-next-line react/require-default-props
  onDragStateChange?: (dragging: boolean) => void;
  // eslint-disable-next-line react/require-default-props
  activeVersions?: Record<number, SceneVersions>;
  // eslint-disable-next-line react/require-default-props
  onActiveVersionsChange?: (versions: Record<number, SceneVersions>) => void;
}

export default function TimelinePanel({
  isOpen,
  onToggle,
  onResize,
  playbackTime: externalPlaybackTime,
  isPlaying: externalIsPlaying,
  onSeek,
  onPlayPause,
  onDragStateChange,
  activeVersions: externalActiveVersions,
  onActiveVersionsChange,
}: TimelinePanelProps) {
  const { projectDirectory } = useWorkspace();
  const {
    isLoading,
    scenes: projectScenes,
    timelineState,
    saveTimelineState,
    updatePlayhead,
    updateZoom,
    setActiveVersion,
    updateMarkers,
    updateImportedClips,
    addAsset,
  } = useProject();

  // Use unified timeline data from context (single source of truth for TimelinePanel + VideoLibraryView)
  const {
    timelineItems,
    overlayItems,
    totalDuration: timelineTotalDuration,
    refreshAudioFiles,
  } = useTimelineDataContext();

  // Initialize zoom level from timeline state
  const [zoomLevel, setZoomLevel] = useState(timelineState.zoom_level);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Sync zoom level to timeline state
  useEffect(() => {
    updateZoom(zoomLevel);
  }, [zoomLevel, updateZoom]);

  // Use external playback state if provided, otherwise use internal state
  // Initialize from timeline state if available
  const [internalPlaybackTime, setInternalPlaybackTime] = useState(
    timelineState.playhead_seconds,
  );
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);

  // Calculate total duration from timeline (placement-based)
  const totalDuration = useMemo(() => {
    if (timelineTotalDuration > 0) return timelineTotalDuration;
    if (timelineItems.length === 0) return 10;
    const lastItem = timelineItems[timelineItems.length - 1];
    return Math.max(lastItem.endTime, 10);
  }, [timelineTotalDuration, timelineItems]);

  // Clamp playback position to totalDuration to prevent playhead from going beyond content
  const rawCurrentPosition = externalPlaybackTime ?? internalPlaybackTime;
  const currentPosition = Math.max(
    0,
    Math.min(rawCurrentPosition, totalDuration),
  );
  const isPlaying = externalIsPlaying ?? internalIsPlaying;

  // If position was clamped, update internal state
  useEffect(() => {
    // Only clamp if using internal state and position exceeds duration
    if (!externalPlaybackTime && internalPlaybackTime > totalDuration) {
      setInternalPlaybackTime(totalDuration);
    }
  }, [
    internalPlaybackTime,
    totalDuration,
    externalPlaybackTime,
    setInternalPlaybackTime,
  ]);

  // Sync playhead position to timeline state (debounced)
  useEffect(() => {
    if (!externalPlaybackTime) {
      // Only sync if using internal state
      const timeoutId = setTimeout(() => {
        updatePlayhead(currentPosition);
      }, 100); // Debounce 100ms for playhead updates
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [currentPosition, externalPlaybackTime, updatePlayhead]);

  const setCurrentPosition = useCallback(
    (value: number | ((prev: number) => number)) => {
      const newValue =
        typeof value === 'function' ? value(currentPosition) : value;
      const clamped = Math.max(0, Math.min(totalDuration, newValue));
      if (onSeek) {
        onSeek(clamped);
      } else {
        setInternalPlaybackTime(clamped);
      }
    },
    [onSeek, currentPosition, totalDuration],
  );

  const setIsPlaying = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      if (onPlayPause) {
        const newValue = typeof value === 'function' ? value(isPlaying) : value;
        onPlayPause(newValue);
      } else {
        setInternalIsPlaying(value);
      }
    },
    [onPlayPause, isPlaying],
  );
  // Helper functions to convert between marker formats
  const convertKshanaMarkerToLocal = useCallback(
    (marker: KshanaTimelineMarker): TimelineMarker => ({
      id: marker.id,
      position: marker.position_seconds,
      prompt: marker.prompt,
      status: marker.status,
      generatedArtifactId: marker.generated_artifact_id,
      createdAt: marker.created_at,
    }),
    [],
  );

  const convertLocalMarkerToKshana = useCallback(
    (marker: TimelineMarker): KshanaTimelineMarker => ({
      id: marker.id,
      position_seconds: marker.position,
      prompt: marker.prompt,
      status: marker.status,
      generated_artifact_id: marker.generatedArtifactId,
      created_at: marker.createdAt,
    }),
    [],
  );

  // Load markers and imported clips from timeline state on mount
  const [markers, setMarkers] = useState<TimelineMarker[]>(() => {
    return timelineState.markers.map(convertKshanaMarkerToLocal);
  });

  // Sync markers to timeline state when they change
  useEffect(() => {
    const kshanaMarkers = markers.map(convertLocalMarkerToKshana);
    updateMarkers(kshanaMarkers);
  }, [markers, convertLocalMarkerToKshana, updateMarkers]);

  // Imported videos state - kept for local video import functionality
  const [importedVideos, setImportedVideos] = useState<
    Array<{ path: string; duration: number; startTime: number }>
  >(() => {
    // Initialize from timeline state
    return timelineState.imported_clips.map((clip) => ({
      path: clip.path,
      duration: clip.duration_seconds,
      startTime: clip.start_time_seconds,
    }));
  });

  // Use a ref to track if we're updating from external source to prevent loops
  const isUpdatingFromExternalRef = useRef(false);

  // Load imported clips from timeline state when it changes externally
  // Only update if the data actually changed to prevent infinite loops
  useEffect(() => {
    const importedClips = timelineState.imported_clips.map((clip) => ({
      path: clip.path,
      duration: clip.duration_seconds,
      startTime: clip.start_time_seconds,
    }));

    // Compare with current state to avoid unnecessary updates
    setImportedVideos((current) => {
      const currentVideosStr = JSON.stringify(current);
      const newVideosStr = JSON.stringify(importedClips);

      if (currentVideosStr !== newVideosStr) {
        isUpdatingFromExternalRef.current = true;
        return importedClips;
      }
      return current;
    });
  }, [timelineState.imported_clips]);

  // Sync imported videos to timeline state when they change locally

  useEffect(() => {
    // Skip if this update came from external source
    if (isUpdatingFromExternalRef.current) {
      isUpdatingFromExternalRef.current = false;
      return;
    }

    const kshanaClips: ImportedClip[] = importedVideos.map((video, index) => ({
      id: video.path || `imported-${index}`,
      path: video.path,
      duration_seconds: video.duration,
      start_time_seconds: video.startTime,
    }));

    // Compare with current timeline state to avoid unnecessary updates
    const currentClipsStr = JSON.stringify(
      timelineState.imported_clips.map((c) => ({
        path: c.path,
        duration: c.duration_seconds,
        startTime: c.start_time_seconds,
      })),
    );
    const newClipsStr = JSON.stringify(
      kshanaClips.map((c) => ({
        path: c.path,
        duration: c.duration_seconds,
        startTime: c.start_time_seconds,
      })),
    );

    if (currentClipsStr !== newClipsStr) {
      updateImportedClips(kshanaClips);
    }
  }, [importedVideos, updateImportedClips, timelineState.imported_clips]);

  const [markerPromptOpen, setMarkerPromptOpen] = useState(false);
  const [markerPromptPosition, setMarkerPromptPosition] = useState<
    number | null
  >(null);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);

  // Load active versions from timeline state or use external prop (with migration)
  const [internalActiveVersions, setInternalActiveVersions] = useState<
    Record<number, SceneVersions>
  >(() => {
    const versions: Record<number, SceneVersions> = {};
    Object.entries(timelineState.active_versions).forEach(
      ([folder, versionData]) => {
        // Extract scene number from folder name (e.g., "scene-001" -> 1)
        const match = folder.match(/scene-(\d+)/);
        if (match) {
          const sceneNumber = parseInt(match[1], 10);

          // Handle migration from old format (number) to new format (SceneVersions)
          if (typeof versionData === 'number') {
            versions[sceneNumber] = { video: versionData };
          } else if (versionData && typeof versionData === 'object') {
            versions[sceneNumber] = versionData;
          }
        }
      },
    );
    return versions;
  });

  // Use external activeVersions if provided, otherwise use internal state
  const activeVersions = externalActiveVersions ?? internalActiveVersions;
  const setActiveVersions = onActiveVersionsChange ?? setInternalActiveVersions;

  // Sync active versions to timeline state when they change
  // For placement-based timeline, we use placementNumber as key
  // Note: Timeline state still uses sceneFolder format, so we map placementNumber to a folder-like key
  const prevActiveVersionsRef = useRef<string>('');

  useEffect(() => {
    if (!projectDirectory) return;

    // Serialize current activeVersions for comparison
    const serializedActiveVersions = JSON.stringify(activeVersions);

    // Only update if activeVersions actually changed
    if (serializedActiveVersions === prevActiveVersionsRef.current) {
      return;
    }

    prevActiveVersionsRef.current = serializedActiveVersions;

    // Update timeline state active_versions
    // Map placementNumber to a folder-like key for timeline state compatibility
    Object.entries(activeVersions).forEach(
      ([placementNumberStr, sceneVersions]) => {
        const placementNumber = parseInt(placementNumberStr, 10);
        // Use placement-{number} as the key to distinguish from scene folders
        const folderKey = `placement-${String(placementNumber).padStart(3, '0')}`;

        if (sceneVersions) {
          if (sceneVersions.image !== undefined) {
            setActiveVersion(folderKey, 'image', sceneVersions.image);
          }
          if (sceneVersions.video !== undefined) {
            setActiveVersion(folderKey, 'video', sceneVersions.video);
          }
        }
      },
    );
  }, [activeVersions, projectDirectory, setActiveVersion]);
  // Scene selection and drag/drop removed for placement-based timeline
  // Placements are timestamp-based and cannot be reordered

  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const playheadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Drag state management
  const [isDragging, setIsDragging] = useState(false);
  const wasPlayingBeforeDragRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartPositionRef = useRef(0);
  const isClickRef = useRef(true);
  const scrollPositionBeforeEditRef = useRef<number | null>(null);

  // WebSocket integration for timeline markers
  const handleMarkerUpdate = useCallback(
    (
      markerId: string,
      status: TimelineMarker['status'],
      artifactId?: string,
    ) => {
      setMarkers((prev) =>
        prev.map((marker) =>
          marker.id === markerId
            ? { ...marker, status, generatedArtifactId: artifactId }
            : marker,
        ),
      );
    },
    [],
  );

  const { sendTimelineMarker } = useTimelineWebSocket(handleMarkerUpdate);

  // Scene-based functionality removed for placement-based timeline

  // Load imported videos from asset manifest (for local video import feature)
  // Note: Imported videos are handled separately and appended after timeline items
  useEffect(() => {
    // Imported videos logic can be added here if needed
    // For now, they're handled in the timeline items rendering
  }, []);

  // Timeline click handler removed - no longer opens marker prompt
  // Marker functionality can be accessed via keyboard shortcut or toolbar button

  // Handle marker creation
  const handleCreateMarker = useCallback(
    async (position: number, prompt: string) => {
      const newMarker: TimelineMarker = {
        id: `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        position,
        prompt,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      setMarkers((prev) => [...prev, newMarker]);
      setMarkerPromptOpen(false);
      setMarkerPromptPosition(null);

      // Update marker status to processing
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === newMarker.id ? { ...m, status: 'processing' } : m,
        ),
      );

      // Send to backend via WebSocket
      try {
        // Get current timeline item context (placement-based)
        const currentItem = timelineItems.find(
          (item) => position >= item.startTime && position < item.endTime,
        );

        const previousItems = timelineItems
          .filter((item) => item.endTime <= position)
          .map((item) => ({
            placementNumber: item.placementNumber,
            label: item.label,
            prompt: item.prompt,
          }));

        await sendTimelineMarker({
          marker_id: newMarker.id,
          position,
          prompt,
          scene_context: {
            current_scene: currentItem?.placementNumber,
            previous_scenes: previousItems
              .filter((item) => item.placementNumber !== undefined)
              .map((item) => ({
                scene_number: item.placementNumber!,
                description: item.prompt || item.label,
              })),
          },
        });
      } catch {
        // Update marker status to error
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === newMarker.id ? { ...m, status: 'error' } : m,
          ),
        );
      }
    },
    [timelineItems, sendTimelineMarker],
  );

  // Open marker popover at current playhead position (keyboard shortcut)
  const handleOpenMarkerPopover = useCallback(() => {
    if (currentPosition >= 0 && currentPosition <= totalDuration) {
      setMarkerPromptPosition(currentPosition);
      setMarkerPromptOpen(true);
    }
  }, [currentPosition, totalDuration]);

  // Play/pause functionality - only update playhead if using internal state
  // If external state is provided, let VideoLibraryView handle playback
  useEffect(() => {
    if (externalPlaybackTime !== undefined || externalIsPlaying !== undefined) {
      // External state is being used, don't manage playback here
      if (playheadIntervalRef.current) {
        clearInterval(playheadIntervalRef.current);
        playheadIntervalRef.current = null;
      }
      return;
    }

    // Internal state management (fallback if no external state provided)
    if (isPlaying) {
      playheadIntervalRef.current = setInterval(() => {
        const next = currentPosition + 0.1; // Update every 100ms
        if (next >= totalDuration) {
          setIsPlaying(false);
          setCurrentPosition(totalDuration);
        } else {
          setCurrentPosition(next);
        }
      }, 100);
    } else if (playheadIntervalRef.current) {
      clearInterval(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }

    // eslint-disable-next-line consistent-return
    return (): void => {
      if (playheadIntervalRef.current) {
        clearInterval(playheadIntervalRef.current);
      }
    };
  }, [
    isPlaying,
    totalDuration,
    externalPlaybackTime,
    externalIsPlaying,
    setCurrentPosition,
    setIsPlaying,
    currentPosition,
  ]);

  // Offset for the timeline content margin
  const TIMELINE_OFFSET = 10;

  // Helper function to clear text selection
  const clearSelection = useCallback(() => {
    if (window.getSelection) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    }
  }, []);

  // Calculate position from mouse event
  const calculatePositionFromMouse = useCallback(
    (clientX: number): number => {
      if (!tracksRef.current) return currentPosition;
      const rect = tracksRef.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollLeft - TIMELINE_OFFSET;
      const seconds = pixelsToSeconds(x, zoomLevel);
      return Math.max(0, Math.min(totalDuration, seconds));
    },
    [scrollLeft, zoomLevel, totalDuration, currentPosition],
  );

  // Handle playhead drag start
  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!tracksRef.current) return;

      setIsDragging(true);
      if (onDragStateChange) {
        onDragStateChange(true);
      }
      wasPlayingBeforeDragRef.current = isPlaying;
      dragStartXRef.current = e.clientX;
      dragStartPositionRef.current = currentPosition;
      isClickRef.current = true;

      // Pause video playback
      if (isPlaying) {
        setIsPlaying(false);
      }

      // Calculate initial position
      const newPosition = calculatePositionFromMouse(e.clientX);
      setCurrentPosition(newPosition);

      // Global mouse move handler
      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Check if moved enough to be considered a drag
        const moveDistance = Math.abs(
          moveEvent.clientX - dragStartXRef.current,
        );
        if (moveDistance > 5) {
          isClickRef.current = false;
        }

        const position = calculatePositionFromMouse(moveEvent.clientX);
        setCurrentPosition(position);
      };

      // Global mouse up handler
      const handleMouseUpGlobal = (mouseUpEvent: MouseEvent) => {
        const wasClick = isClickRef.current;
        setIsDragging(false);
        if (onDragStateChange) {
          onDragStateChange(false);
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUpGlobal);

        // If it was a click (not drag), just seek to position
        if (wasClick) {
          const position = calculatePositionFromMouse(mouseUpEvent.clientX);
          setCurrentPosition(position);
        } else if (wasPlayingBeforeDragRef.current) {
          // Resume playback if it was playing before drag
          setIsPlaying(true);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUpGlobal);
    },
    [
      isPlaying,
      currentPosition,
      calculatePositionFromMouse,
      setIsPlaying,
      setCurrentPosition,
      onDragStateChange,
    ],
  );

  // Handle timeline item click (placement-based)
  const handleItemClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, item: TimelineItem) => {
      e.stopPropagation();
      e.preventDefault();

      // Seek to item's start position
      setCurrentPosition(item.startTime);
    },
    [setCurrentPosition],
  );

  // Handle timeline area scrubbing (click and drag)
  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't start scrubbing if clicking on playhead (it has its own handler)
      const target = e.target as HTMLElement;
      if (target.closest(`.${styles.playhead}`)) {
        return;
      }

      // Don't start scrubbing if clicking on a scene block (it has its own handler)
      if (target.closest(`.${styles.sceneBlock}`)) {
        return;
      }

      // Don't start scrubbing if clicking on a video block (it has its own handler)
      if (target.closest(`.${styles.videoBlock}`)) {
        return;
      }

      if (!tracksRef.current) return;

      setIsDragging(true);
      if (onDragStateChange) {
        onDragStateChange(true);
      }
      wasPlayingBeforeDragRef.current = isPlaying;
      dragStartXRef.current = e.clientX;
      dragStartPositionRef.current = currentPosition;
      isClickRef.current = true;

      // Pause video playback
      if (isPlaying) {
        setIsPlaying(false);
      }

      // Seek to clicked position immediately
      const newPosition = calculatePositionFromMouse(e.clientX);
      setCurrentPosition(newPosition);

      // Global mouse move handler
      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Check if moved enough to be considered a drag
        const moveDistance = Math.abs(
          moveEvent.clientX - dragStartXRef.current,
        );
        if (moveDistance > 5) {
          isClickRef.current = false;
        }

        const position = calculatePositionFromMouse(moveEvent.clientX);
        setCurrentPosition(position);
      };

      // Global mouse up handler
      const handleMouseUpGlobal = (mouseUpEvent: MouseEvent) => {
        const wasClick = isClickRef.current;
        setIsDragging(false);
        if (onDragStateChange) {
          onDragStateChange(false);
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUpGlobal);

        // If it was a click (not drag), clear selection and seek
        if (wasClick) {
          clearSelection();
          const position = calculatePositionFromMouse(mouseUpEvent.clientX);
          setCurrentPosition(position);
        } else if (wasPlayingBeforeDragRef.current) {
          // Resume playback if it was playing before drag
          setIsPlaying(true);
        }
      };

      document.addEventListener('mousemove', handleMouseMove, {
        passive: true,
      });
      document.addEventListener('mouseup', handleMouseUpGlobal);
    },
    [
      isPlaying,
      currentPosition,
      calculatePositionFromMouse,
      setIsPlaying,
      setCurrentPosition,
      onDragStateChange,
      clearSelection,
    ],
  );

  // Handle zoom
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev * 1.5, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev / 1.5, 0.1));
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  }, []);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoomLevel((prev) => Math.max(0.1, Math.min(5, prev * delta)));
    }
  }, []);

  // Handle video import - copy to videos/imported folder
  const handleImportVideo = useCallback(async () => {
    if (!projectDirectory) return;

    try {
      const videoPath = await window.electron.project.selectVideoFile();
      if (!videoPath) return;

      // Create videos/imported folder structure if it doesn't exist
      // Similar to ProjectService.createProjectStructure - create nested folders
      const parts = PROJECT_PATHS.VIDEOS_IMPORTED.split('/');
      let basePath = projectDirectory;
      for (const part of parts) {
        if (part) {
          await window.electron.project.createFolder(basePath, part);
          basePath = `${basePath}/${part}`;
        }
      }
      const videosFolder = basePath;

      // Copy video to videos/imported folder
      const videoFileName =
        videoPath.split('/').pop() || `video-${Date.now()}.mp4`;
      const destPath = await window.electron.project.copy(
        videoPath,
        videosFolder,
      );
      const relativePath = `${PROJECT_PATHS.VIDEOS_IMPORTED}/${videoFileName}`;

      // Get video duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = `file://${destPath}`;

      // eslint-disable-next-line compat/compat
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = async () => {
          const { duration } = video;

          // Generate unique asset ID
          const assetId = `imported-video-${Date.now()}-${videoFileName.replace(/[^a-zA-Z0-9]/g, '-')}`;

          // Create asset info for the manifest
          const assetInfo = createAssetInfo(
            assetId,
            'final_video',
            relativePath,
            1,
            {
              metadata: {
                imported: true,
                duration,
                title: videoFileName,
              },
            },
          );

          // Save to asset manifest
          const saved = await addAsset(assetInfo);
          if (!saved) {
            console.error('Failed to save imported video to asset manifest');
          }

          // Update local state and timeline state
          setImportedVideos((prev) => [
            ...prev,
            {
              path: relativePath,
              duration,
              startTime: totalDuration,
            },
          ]);

          console.log(
            'Imported video:',
            relativePath,
            duration,
            'saved to manifest:',
            saved,
          );

          resolve();
        };
        video.onerror = reject;
      });
    } catch {
      // Failed to import video
    }
  }, [projectDirectory, totalDuration, addAsset]);

  // Handle audio import from file
  const handleImportAudioFromFile = useCallback(async () => {
    if (!projectDirectory) return;

    try {
      const audioPath = await window.electron.project.selectAudioFile();
      if (!audioPath) return;

      // Create .kshana/agent/audio folder structure if it doesn't exist
      const parts = PROJECT_PATHS.AGENT_AUDIO.split('/');
      let basePath = projectDirectory;
      for (const part of parts) {
        if (part) {
          await window.electron.project.createFolder(basePath, part);
          basePath = `${basePath}/${part}`;
        }
      }
      const audioFolder = basePath;

      // Copy audio to .kshana/agent/audio folder
      const audioFileName =
        audioPath.split('/').pop() || `audio-${Date.now()}.mp3`;
      await window.electron.project.copy(audioPath, audioFolder);

      // Add small delay before refresh to ensure file copy completes
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Refresh audio files so both timeline and video library view update
      refreshAudioFiles();
      console.log('Audio file imported successfully');
    } catch (error) {
      console.error('Failed to import audio file:', error);
    }
  }, [projectDirectory, refreshAudioFiles]);

  // YouTube audio import removed - can be re-added later if needed
  const handleImportAudioFromYouTube = useCallback(
    async (_youtubeUrl: string) => {
      // YouTube extraction functionality removed
      alert('YouTube audio extraction is currently disabled');
    },
    [],
  );

  // Drag handlers removed - not used in unified timeline

  // Handle scene split at playhead (disabled for placement-based timeline)
  const handleSplitScene = useCallback(() => {
    // Placements are timestamp-based and cannot be split
    // This functionality is not applicable to placement-based timeline
    console.log('Split scene not supported for placement-based timeline');
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement;
      const isTyping = 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable;
      
      // Space: Play/Pause
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
      // Arrow Left: Step back (only when not typing)
      else if (e.code === 'ArrowLeft' && !e.shiftKey && !isTyping) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.max(0, prev - 0.1));
      }
      // Arrow Right: Step forward (only when not typing)
      else if (e.code === 'ArrowRight' && !e.shiftKey && !isTyping) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.min(totalDuration, prev + 0.1));
      }
      // Shift+Arrow Left: Jump back 1 second (only when not typing)
      else if (e.code === 'ArrowLeft' && e.shiftKey && !isTyping) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.max(0, prev - 1));
      }
      // Shift+Arrow Right: Jump forward 1 second (only when not typing)
      else if (e.code === 'ArrowRight' && e.shiftKey && !isTyping) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.min(totalDuration, prev + 1));
      }
      // Plus/Equal: Zoom in
      else if (
        (e.code === 'Equal' || e.code === 'NumpadAdd') &&
        (e.ctrlKey || e.metaKey)
      ) {
        e.preventDefault();
        handleZoomIn();
      }
      // Minus: Zoom out
      else if (
        (e.code === 'Minus' || e.code === 'NumpadSubtract') &&
        (e.ctrlKey || e.metaKey)
      ) {
        e.preventDefault();
        handleZoomOut();
      }
      // S: Split scene at playhead (only when not typing)
      else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !isTyping) {
        e.preventDefault();
        handleSplitScene();
      }
      // M: Add marker at current playhead position (only when not typing)
      else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !isTyping) {
        e.preventDefault();
        handleOpenMarkerPopover();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line consistent-return
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isOpen,
    totalDuration,
    handleZoomIn,
    handleZoomOut,
    handleSplitScene,
    handleOpenMarkerPopover,
    setCurrentPosition,
    setIsPlaying,
  ]);

  // Show empty state if no project
  if (!projectDirectory) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Open a project to view the timeline</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading timeline...</div>
      </div>
    );
  }

  const effectiveProjectDir = projectDirectory || '/mock';

  // Timeline extends past content by TAIL_PADDING_SECONDS so user can scroll into empty space. Playhead stays in [0, totalDuration].
  const displayDuration =
    totalDuration > 0 ? totalDuration + TAIL_PADDING_SECONDS : 10;
  const timelineWidth = secondsToPixels(displayDuration, zoomLevel);
  const maxMarkerTime = Math.ceil(displayDuration / 5) * 5;

  const timeMarkers: number[] = [];
  for (let i = 0; i <= maxMarkerTime; i += 5) {
    timeMarkers.push(i);
  }

  // Playhead stays within content only; currentPosition is already clamped to [0, totalDuration]
  const playheadPosition = Math.min(
    secondsToPixels(currentPosition, zoomLevel),
    secondsToPixels(totalDuration, zoomLevel),
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerControl}>
          <span className={styles.headerTitle}>Timeline</span>
          <button
            type="button"
            className={styles.toggleButton}
            onClick={onToggle}
            title={isOpen ? 'Hide Timeline' : 'Show Timeline'}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
        {isOpen && (
          <button
            type="button"
            className={styles.resizeHandle}
            onMouseDown={onResize}
            aria-label="Resize timeline"
          />
        )}
      </div>
      {isOpen && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <button
                type="button"
                className={styles.playButton}
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <span className={styles.timeDisplay}>
                {formatTime(currentPosition)}
              </span>
            </div>
            <div className={styles.toolbarRight}>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={handleImportVideo}
                title="Import Video (Ctrl+I)"
              >
                <Upload size={14} />
                <span>Import</span>
              </button>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={() => setIsAudioModalOpen(true)}
                title="Import Audio"
              >
                <Music size={14} />
                <span>Import Audio</span>
              </button>
              <button
                type="button"
                className={styles.toolbarButton}
                onClick={handleSplitScene}
                title="Split Scene at Playhead (S)"
              >
                <Scissors size={14} />
              </button>
              <button
                type="button"
                className={styles.zoomButton}
                onClick={handleZoomOut}
                title="Zoom Out (Ctrl+-)"
              >
                <ZoomOut size={14} />
              </button>
              <span className={styles.zoomLevel}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                className={styles.zoomButton}
                onClick={handleZoomIn}
                title="Zoom In (Ctrl++)"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          <div className={styles.timelineContainer} ref={timelineRef}>
            <VersionSelector
              timelineItems={timelineItems}
              activeVersions={activeVersions}
              onVersionSelect={(placementNumber, assetType, version) => {
                const newVersions: Record<number, SceneVersions> = {
                  ...activeVersions,
                  [placementNumber]: {
                    ...activeVersions[placementNumber],
                    [assetType]: version,
                  },
                };
                setActiveVersions(newVersions);
              }}
            />
            {/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
            <div
              className={styles.tracksArea}
              ref={tracksRef}
              onScroll={handleScroll}
              onMouseDown={handleTimelineMouseDown}
              onWheel={handleWheel}
              role="application"
              aria-label="Timeline tracks"
              tabIndex={0}
            >
              <div
                className={styles.timelineContent}
                style={{ width: `${timelineWidth}px` }}
              >
                {/* Time Ruler */}
                <div className={styles.timeRuler}>
                  {timeMarkers.map((time) => (
                    <div
                      key={time}
                      className={styles.timeMarker}
                      style={{ left: `${secondsToPixels(time, zoomLevel)}px` }}
                    >
                      <div className={styles.timeMarkerLine} />
                      <span className={styles.timeMarkerLabel}>
                        {formatTime(time).substring(0, 8)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Playhead */}
                <div
                  className={`${styles.playhead} ${isDragging ? styles.dragging : ''}`}
                  style={{ left: `${playheadPosition}px` }}
                  onMouseDown={handlePlayheadMouseDown}
                  role="slider"
                  tabIndex={0}
                  aria-label="Timeline playhead"
                  aria-valuenow={currentPosition}
                  aria-valuemin={0}
                  aria-valuemax={totalDuration}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      setCurrentPosition((prev) => Math.max(0, prev - 0.1));
                    } else if (e.key === 'ArrowRight') {
                      setCurrentPosition((prev) =>
                        Math.min(totalDuration, prev + 0.1),
                      );
                    }
                  }}
                />

                {/* Main Track */}
                {timelineItems.filter((item) => item.type !== 'audio').length >
                  0 && (
                  <div className={styles.track}>
                    <div className={styles.trackContent}>
                      {timelineItems
                        .filter((item) => item.type !== 'audio')
                        .map((item) => {
                          const left = secondsToPixels(
                            item.startTime,
                            zoomLevel,
                          );
                          const width = secondsToPixels(
                            item.duration,
                            zoomLevel,
                          );

                          return (
                            <TimelineItemComponent
                              key={item.id}
                              item={item}
                              left={left}
                              width={width}
                              projectDirectory={projectDirectory || null}
                              isSelected={false}
                              onItemClick={handleItemClick}
                            />
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Overlay Track (Infographics) */}
                {overlayItems.length > 0 && (
                  <div className={`${styles.track} ${styles.overlayTrack}`}>
                    <div className={styles.trackContent}>
                      {overlayItems.map((item) => {
                        const left = secondsToPixels(
                          item.startTime,
                          zoomLevel,
                        );
                        const width = secondsToPixels(
                          item.duration,
                          zoomLevel,
                        );

                        return (
                          <TimelineItemComponent
                            key={item.id}
                            item={item}
                            left={left}
                            width={width}
                            projectDirectory={projectDirectory || null}
                            isSelected={false}
                            onItemClick={handleItemClick}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Audio Track */}
                {timelineItems.filter((item) => item.type === 'audio').length >
                  0 && (
                  <div className={`${styles.track} ${styles.audioTrack}`}>
                    <div className={styles.trackContent}>
                      {timelineItems
                        .filter((item) => item.type === 'audio')
                        .map((item) => {
                          const left = secondsToPixels(
                            item.startTime,
                            zoomLevel,
                          );
                          const width = secondsToPixels(
                            item.duration,
                            zoomLevel,
                          );

                          return (
                            <TimelineItemComponent
                              key={item.id}
                              item={item}
                              left={left}
                              width={width}
                              projectDirectory={projectDirectory || null}
                              isSelected={false}
                              onItemClick={handleItemClick}
                            />
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Markers */}
                {markers.map((marker) => (
                  <TimelineMarkerComponent
                    key={marker.id}
                    marker={marker}
                    position={secondsToPixels(marker.position, zoomLevel)}
                  />
                ))}
              </div>
            </div>
            {/* eslint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
          </div>

          {markerPromptOpen && markerPromptPosition !== null && (
            <MarkerPromptPopover
              position={markerPromptPosition}
              onClose={() => {
                setMarkerPromptOpen(false);
                setMarkerPromptPosition(null);
              }}
              onSubmit={(prompt) => {
                if (markerPromptPosition !== null) {
                  handleCreateMarker(markerPromptPosition, prompt);
                }
              }}
            />
          )}

          <AudioImportModal
            isOpen={isAudioModalOpen}
            onClose={() => setIsAudioModalOpen(false)}
            onImportFromFile={handleImportAudioFromFile}
            onImportFromYouTube={handleImportAudioFromYouTube}
          />
        </>
      )}
    </div>
  );
}
