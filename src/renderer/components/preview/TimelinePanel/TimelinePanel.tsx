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
} from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { useTimeline } from '../../../contexts/TimelineContext';
import { useTimelineWebSocket } from '../../../hooks/useTimelineWebSocket';
import { useTimelineData, type TimelineItem } from '../../../hooks/useTimelineData';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import { setActiveVideoVersion } from '../../../utils/videoWorkspace';
import type {
  Artifact,
  TimelineMarker,
} from '../../../types/projectState';
import type {
  KshanaTimelineMarker,
  ImportedClip,
} from '../../../types/kshana';
import { PROJECT_PATHS, createAssetInfo } from '../../../types/kshana';
import TimelineMarkerComponent from '../TimelineMarker/TimelineMarker';
import MarkerPromptPopover from '../TimelineMarker/MarkerPromptPopover';
import SceneActionPopover from './SceneActionPopover';
import VersionSelector from '../VersionSelector';
import MarkdownPreview from '../MarkdownPreview';
import styles from './TimelinePanel.module.scss';

// Timeline Item Component for proper hook usage
interface TimelineItemComponentProps {
  item: TimelineItem;
  left: number;
  width: number;
  projectDirectory: string | null;
  useMockData: boolean;
  isSelected: boolean;
  isSceneDragging: boolean;
  editingSceneNumber: number | null;
  editedSceneName: string;
  sceneFolder?: string;
  onSceneDragStart: (e: React.DragEvent<HTMLDivElement>, sceneNumber: number) => void;
  onSceneDragEnd: () => void;
  onSceneBlockClick: (e: React.MouseEvent<HTMLDivElement>, sceneNumber: number) => void;
  onVideoBlockClick: (e: React.MouseEvent<HTMLDivElement>, item: TimelineItem) => void;
  onNameChange: (sceneNumber: number, name: string) => void;
  onEditedNameChange: (name: string) => void;
  onEditingCancel: () => void;
  onViewDetails?: (sceneNumber: number, sceneFolder: string) => void;
}

function TimelineItemComponent({
  item,
  left,
  width,
  projectDirectory,
  useMockData,
  isSelected,
  isSceneDragging,
  editingSceneNumber,
  editedSceneName,
  sceneFolder,
  onSceneDragStart,
  onSceneDragEnd,
  onSceneBlockClick,
  onVideoBlockClick,
  onNameChange,
  onEditedNameChange,
  onEditingCancel,
  onViewDetails,
}: TimelineItemComponentProps) {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);

  useEffect(() => {
    if (item.path) {
      resolveAssetPathForDisplay(
        item.path,
        projectDirectory,
        useMockData,
      ).then((resolved) => {
        setVideoPath(resolved);
      });
    } else {
      setVideoPath(null);
    }
  }, [item.path, projectDirectory, useMockData]);

  useEffect(() => {
    if (item.artifact && item.artifact.artifact_type === 'image') {
      resolveAssetPathForDisplay(
        item.artifact.file_path,
        projectDirectory,
        useMockData,
      ).then(async (resolved) => {
        // For test images in mock mode, try to convert to base64
        if (shouldUseBase64(resolved, useMockData)) {
          const base64 = await imageToBase64(resolved);
          if (base64) {
            setImagePath(base64);
            return;
          }
        }
        // Fallback to file:// path
        setImagePath(resolved);
      });
    } else {
      setImagePath(null);
    }
  }, [item.artifact?.file_path, projectDirectory, useMockData]);

  if (item.type === 'video' && videoPath) {
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        className={`${styles.videoBlock} ${isSelected ? styles.selected : ''}`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
        }}
        onClick={(e) => {
          onVideoBlockClick(e, item);
        }}
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

  // Scene block (with or without image)
  let thumbnailElement: React.ReactNode;
  if (imagePath) {
    thumbnailElement = (
      <img
        src={imagePath}
        alt={item.label}
        className={styles.sceneThumbnail}
      />
    );
  } else if (videoPath) {
    thumbnailElement = (
      <video
        src={videoPath}
        className={styles.sceneThumbnail}
        preload="metadata"
        muted
      />
    );
  } else {
    thumbnailElement = <div className={styles.scenePlaceholder} />;
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className={`${styles.sceneBlock} ${isSelected ? styles.selected : ''} ${isSceneDragging ? styles.dragging : ''}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
      draggable={!!item.scene}
      onDragStart={(e) => {
        if (item.scene) {
          onSceneDragStart(e, item.scene.scene_number);
        }
      }}
      onDragEnd={onSceneDragEnd}
      onClick={(e) => {
        if (item.scene) {
          onSceneBlockClick(e, item.scene.scene_number);
        }
      }}
    >
      {thumbnailElement}
      {item.scene && editingSceneNumber === item.scene.scene_number ? (
        <div className={styles.sceneNameEdit}>
          <input
            type="text"
            value={editedSceneName}
            onChange={(e) => onEditedNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onNameChange(item.scene!.scene_number, editedSceneName);
                onEditingCancel();
              } else if (e.key === 'Escape') {
                onEditingCancel();
              }
            }}
            onBlur={() => {
              onNameChange(item.scene!.scene_number, editedSceneName);
              onEditingCancel();
            }}
            onFocus={(e) => {
              // Prevent browser from scrolling to input
              e.target.scrollIntoView({
                behavior: 'instant',
                block: 'nearest',
                inline: 'nearest',
              });
            }}
            className={styles.sceneNameInput}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onClick={(e) => e.stopPropagation()}
            placeholder={`Scene ${item.scene.scene_number}`}
          />
        </div>
      ) : (
        <div
          className={styles.sceneId}
          onDoubleClick={(e) => {
            if (item.scene) {
              e.stopPropagation();
              // This will be handled by parent component
            }
          }}
          title="Double-click to edit name"
        >
          {item.label}
          {item.scene && (
            <button
              type="button"
              className={styles.sceneNameEditButton}
              onClick={(e) => {
                e.stopPropagation();
                // This will be handled by parent component
              }}
              title="Edit scene name"
            >
              <Edit2 size={10} />
            </button>
          )}
        </div>
      )}
      {item.scene && (
        <div className={styles.sceneDescription}>
          {item.scene.description}
        </div>
      )}
      {item.scene && sceneFolder && onViewDetails && (
        <div className={styles.sceneFooter}>
          <button
            type="button"
            className={styles.viewDetailsButton}
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(item.scene!.scene_number, sceneFolder);
            }}
            title="View details"
          >
            <FileText size={10} />
          </button>
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
}: TimelinePanelProps) {
  const { projectDirectory } = useWorkspace();
  const {
    isLoading,
    useMockData,
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

  // Use unified timeline data hook
  const {
    scenes,
    timelineItems,
    artifactsByScene,
    importedVideoArtifacts,
  } = useTimelineData();

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

  const currentPosition = externalPlaybackTime ?? internalPlaybackTime;
  const isPlaying = externalIsPlaying ?? internalIsPlaying;

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
      if (onSeek) {
        const newValue =
          typeof value === 'function' ? value(currentPosition) : value;
        onSeek(newValue);
      } else {
        setInternalPlaybackTime(value);
      }
    },
    [onSeek, currentPosition],
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
  const [popoverSceneNumber, setPopoverSceneNumber] = useState<number | null>(
    null,
  );
  const [popoverPosition, setPopoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [previewSceneNumber, setPreviewSceneNumber] = useState<number | null>(
    null,
  );
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(false);
  const [editingSceneNumber, setEditingSceneNumber] = useState<number | null>(
    null,
  );
  const [editedSceneName, setEditedSceneName] = useState<string>('');
  // Create scene folder map for markdown preview and version management
  const sceneFoldersByNumber = useMemo(() => {
    const map: Record<number, string> = {};
    if (!projectScenes || projectScenes.length === 0) return map;

    projectScenes.forEach((scene) => {
      map[scene.scene_number] = scene.folder;
    });
    return map;
  }, [projectScenes]);

  // Load active versions from timeline state
  const [activeVersions, setActiveVersions] = useState<Record<number, number>>(
    () => {
      const versions: Record<number, number> = {};
      Object.entries(timelineState.active_versions).forEach(([folder, version]) => {
        // Extract scene number from folder name (e.g., "scene-001" -> 1)
        const match = folder.match(/scene-(\d+)/);
        if (match) {
          const sceneNumber = parseInt(match[1], 10);
          versions[sceneNumber] = version;
        }
      });
      return versions;
    },
  );

  // Sync active versions to timeline state when they change
  useEffect(() => {
    if (!projectDirectory || useMockData) return;

    Object.entries(activeVersions).forEach(async ([sceneNumber, version]) => {
      const sceneFolder = sceneFoldersByNumber[parseInt(sceneNumber, 10)];
      if (sceneFolder) {
        // Update timeline state active_versions
        setActiveVersion(sceneFolder, version);

        // Update current.txt file
        try {
          await setActiveVideoVersion(projectDirectory, sceneFolder, version);
        } catch (error) {
          console.error('Failed to update current.txt:', error);
        }
      }
    });
  }, [activeVersions, projectDirectory, useMockData, sceneFoldersByNumber, setActiveVersion]);
  const {
    selectedScenes,
    selectScene,
    clearSelection,
    draggedSceneNumber,
    dropInsertIndex,
    startDrag,
    endDrag,
    setDropIndex,
    reorderScenes,
  } = useTimeline();

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

  // Restore scroll position when exiting edit mode
  useEffect(() => {
    if (
      editingSceneNumber === null &&
      scrollPositionBeforeEditRef.current !== null &&
      tracksRef.current
    ) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (tracksRef.current && scrollPositionBeforeEditRef.current !== null) {
          tracksRef.current.scrollLeft = scrollPositionBeforeEditRef.current;
          scrollPositionBeforeEditRef.current = null;
        }
      });
    }
  }, [editingSceneNumber]);

  // Handle scene name change
  const handleNameChange = useCallback(
    async (sceneNumber: number, name: string) => {
      // TODO: Implement name change via ProjectContext
      console.log('Name change:', sceneNumber, name);
    },
    [],
  );

  // Load markdown content when preview is opened
  const handleViewSceneDetails = useCallback(
    async (sceneNumber: number, sceneFolder: string) => {
      setPreviewSceneNumber(sceneNumber);
      setIsLoadingMarkdown(true);

      const basePath = projectDirectory || '/mock';
      const markdownPath = `${basePath}/.kshana/agent/scenes/${sceneFolder}/scene.md`;

      try {
        const content = await window.electron.project.readFile(markdownPath);
        if (content !== null) {
          setMarkdownContent(content);
        } else {
          const scene = scenes.find((s) => s.scene_number === sceneNumber);
          setMarkdownContent(
            `# Scene ${sceneNumber}: ${scene?.name || 'Untitled'}\n\n${scene?.description || 'No details available.'
            }`,
          );
        }
      } catch (error) {
        console.error('Failed to load scene markdown:', error);
        const scene = scenes.find((s) => s.scene_number === sceneNumber);
        setMarkdownContent(
          `# Scene ${sceneNumber}: ${scene?.name || 'Untitled'}\n\n${scene?.description || 'No details available.'
          }`,
        );
      } finally {
        setIsLoadingMarkdown(false);
      }
    },
    [projectDirectory, scenes],
  );

  const handleClosePreview = useCallback(() => {
    setPreviewSceneNumber(null);
    setMarkdownContent('');
  }, []);

  // Calculate scene blocks for marker context and version selector
  const sceneBlocks = useMemo(() => {
    let currentTime = 0;
    return scenes.map((scene) => {
      const startTime = currentTime;
      const duration = scene.duration || 5;
      currentTime += duration;
      return {
        scene,
        startTime,
        duration,
        artifact: artifactsByScene[scene.scene_number],
      };
    });
  }, [scenes, artifactsByScene]);

  // Calculate total duration from timeline items
  const totalDuration = useMemo(() => {
    if (timelineItems.length === 0) return 10;
    const lastItem = timelineItems[timelineItems.length - 1];
    return Math.max(lastItem.startTime + lastItem.duration, 10);
  }, [timelineItems]);

  // Load imported videos from asset manifest (for local video import feature)
  useEffect(() => {
    if (importedVideoArtifacts.length > 0) {
      const sceneEndTime =
        sceneBlocks.length > 0
          ? sceneBlocks[sceneBlocks.length - 1].startTime +
          sceneBlocks[sceneBlocks.length - 1].duration
          : 0;
      let currentTime = sceneEndTime;
      const videos = importedVideoArtifacts.map((artifact) => {
        const startTime = currentTime;
        const duration = (artifact.metadata?.duration as number) || 5;
        currentTime += duration;
        return {
          path: artifact.file_path,
          duration,
          startTime,
        };
      });
      setImportedVideos(videos);
    } else {
      // Clear imported videos if none
      setImportedVideos([]);
    }
  }, [importedVideoArtifacts, sceneBlocks]);

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
        // Get current scene context
        const currentScene = sceneBlocks.find(
          (block) =>
            position >= block.startTime &&
            position < block.startTime + block.duration,
        );

        const previousScenes = sceneBlocks
          .filter((block) => block.startTime + block.duration <= position)
          .map((block) => ({
            scene_number: block.scene.scene_number,
            description: block.scene.description,
          }));

        await sendTimelineMarker({
          marker_id: newMarker.id,
          position,
          prompt,
          scene_context: {
            current_scene: currentScene?.scene.scene_number,
            previous_scenes: previousScenes,
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
    [sceneBlocks, sendTimelineMarker],
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

  // Calculate position from mouse event
  const calculatePositionFromMouse = useCallback(
    (clientX: number): number => {
      if (!tracksRef.current) return currentPosition;
      const rect = tracksRef.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollLeft;
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

  // Handle scene drag start
  const handleSceneDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, sceneNumber: number) => {
      startDrag(sceneNumber);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(sceneNumber));
    },
    [startDrag],
  );

  // Handle scene drag end
  const handleSceneDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  // Calculate insertion index from mouse position
  const calculateInsertIndex = useCallback(
    (clientX: number): number | null => {
      if (!tracksRef.current || !sceneBlocks.length) return null;

      const rect = tracksRef.current.getBoundingClientRect();
      const x = clientX - rect.left + scrollLeft;
      const position = pixelsToSeconds(x, zoomLevel);

      // Find which scene index to insert before/after
      for (let i = 0; i < sceneBlocks.length; i += 1) {
        const block = sceneBlocks[i];
        const blockStart = block.startTime;
        const blockCenter = blockStart + block.duration / 2;

        // If position is before this block's center, insert before it
        if (position < blockCenter) {
          return i;
        }
      }

      // If position is after all scenes, insert at the end
      return sceneBlocks.length;
    },
    [sceneBlocks, scrollLeft, zoomLevel],
  );

  // Handle drag over on track content
  const handleTrackDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (draggedSceneNumber === null) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';

      const insertIndex = calculateInsertIndex(e.clientX);
      setDropIndex(insertIndex);
    },
    [draggedSceneNumber, calculateInsertIndex, setDropIndex],
  );

  // Handle drop on track content
  const handleTrackDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      if (draggedSceneNumber === null || dropInsertIndex === null) return;

      e.preventDefault();
      e.stopPropagation();

      // Find the scene number at the target index
      const targetScene = sceneBlocks[dropInsertIndex];
      if (!targetScene) {
        // Dropping at the end
        const lastScene = sceneBlocks[sceneBlocks.length - 1];
        if (lastScene) {
          await reorderScenes(
            draggedSceneNumber,
            sceneBlocks.length,
            null, // projectState no longer needed
            projectDirectory,
            () => { }, // No-op function for state update
          );
        }
      } else {
        // Find the index of the dragged scene in sceneBlocks
        const draggedIndex = sceneBlocks.findIndex(
          (block) => block.scene.scene_number === draggedSceneNumber,
        );
        if (draggedIndex !== -1) {
          await reorderScenes(
            draggedSceneNumber,
            dropInsertIndex,
            null, // projectState no longer needed
            projectDirectory,
            () => { }, // No-op function for state update
          );
        }
      }

      endDrag();
    },
    [
      draggedSceneNumber,
      dropInsertIndex,
      sceneBlocks,
      reorderScenes,
      projectDirectory,
      endDrag,
    ],
  );

  // Handle scene block click to select scene
  const handleSceneBlockClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, sceneNumber: number) => {
      // Don't select if we're dragging
      if (draggedSceneNumber !== null) {
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const multiKey = isMac ? e.metaKey : e.ctrlKey;
      const rangeKey = e.shiftKey;

      // If clicking on an already-selected scene (and not multi-select), show popover
      if (selectedScenes.has(sceneNumber) && !multiKey && !rangeKey) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPopoverPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height,
        });
        setPopoverSceneNumber(sceneNumber);
      } else {
        selectScene(sceneNumber, multiKey, rangeKey);
        // Close popover if selecting a different scene
        if (popoverSceneNumber !== sceneNumber) {
          setPopoverSceneNumber(null);
          setPopoverPosition(null);
        }
      }
    },
    [draggedSceneNumber, selectedScenes, selectScene, popoverSceneNumber],
  );

  // Handle video block click
  const handleVideoBlockClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, item: TimelineItem) => {
      // Don't handle if we're dragging
      if (draggedSceneNumber !== null) {
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      // If video has an associated scene, treat it like a scene click
      if (item.scene) {
        handleSceneBlockClick(e, item.scene.scene_number);
      } else {
        // For videos without scenes (imported videos), seek to the video's start position
        setCurrentPosition(item.startTime);
      }
    },
    [draggedSceneNumber, handleSceneBlockClick, setCurrentPosition],
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

          console.log('Imported video:', relativePath, duration, 'saved to manifest:', saved);

          resolve();
        };
        video.onerror = reject;
      });
    } catch {
      // Failed to import video
    }
  }, [projectDirectory, totalDuration, addAsset]);

  // Drag handlers removed - not used in unified timeline

  // Handle scene split at playhead
  const handleSplitScene = useCallback(() => {
    const currentSceneIndex = sceneBlocks.findIndex(
      (block) =>
        currentPosition >= block.startTime &&
        currentPosition < block.startTime + block.duration,
    );

    if (currentSceneIndex === -1) {
      return;
    }

    const block = sceneBlocks[currentSceneIndex];
    const splitTime = currentPosition - block.startTime;

    if (splitTime > 0 && splitTime < block.duration) {
      // Split the scene
      // TODO: Update project state with split scenes
      // const firstPart = {
      //   ...block.scene,
      //   duration: splitTime,
      // };
      // const secondPart = {
      //   ...block.scene,
      //   scene_number: block.scene.scene_number + 0.5, // Temporary number
      //   duration: block.duration - splitTime,
      // };
    }
  }, [currentPosition, sceneBlocks]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space: Play/Pause
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
      // Arrow Left: Step back
      else if (e.code === 'ArrowLeft' && !e.shiftKey) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.max(0, prev - 0.1));
      }
      // Arrow Right: Step forward
      else if (e.code === 'ArrowRight' && !e.shiftKey) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.min(totalDuration, prev + 0.1));
      }
      // Shift+Arrow Left: Jump back 1 second
      else if (e.code === 'ArrowLeft' && e.shiftKey) {
        e.preventDefault();
        setCurrentPosition((prev) => Math.max(0, prev - 1));
      }
      // Shift+Arrow Right: Jump forward 1 second
      else if (e.code === 'ArrowRight' && e.shiftKey) {
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
      // S: Split scene at playhead
      else if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        handleSplitScene();
      }
      // M: Add marker at current playhead position
      else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
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

  // Show empty state if no project and not using mock data
  if (!projectDirectory && !useMockData) {
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

  // Calculate timeline width based on total duration (ensure minimum width)
  const minDuration = Math.max(totalDuration, 10); // At least 10 seconds
  const timelineWidth = secondsToPixels(minDuration, zoomLevel);
  const playheadPosition = secondsToPixels(currentPosition, zoomLevel);

  // Generate time markers for ruler
  const timeMarkers: number[] = [];
  for (let i = 0; i <= Math.ceil(minDuration); i += 5) {
    timeMarkers.push(i);
  }

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
              sceneBlocks={sceneBlocks}
              activeVersions={activeVersions}
              onVersionSelect={(sceneNumber, version) => {
                setActiveVersions((prev) => ({
                  ...prev,
                  [sceneNumber]: version,
                }));
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

                {/* Unified Track */}
                {timelineItems.length > 0 && (
                  <div className={styles.track}>
                    <div
                      className={styles.trackContent}
                      onDragOver={handleTrackDragOver}
                      onDrop={handleTrackDrop}
                      onDragLeave={(e) => {
                        // Only clear if actually leaving the track area
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        const x = e.clientX;
                        const y = e.clientY;
                        if (
                          x < rect.left ||
                          x > rect.right ||
                          y < rect.top ||
                          y > rect.bottom
                        ) {
                          setDropIndex(null);
                        }
                      }}
                    >
                      {timelineItems.map((item) => {
                        const left = secondsToPixels(item.startTime, zoomLevel);
                        const width = secondsToPixels(item.duration, zoomLevel);
                        const isSelected = Boolean(
                          item.scene &&
                          selectedScenes.has(item.scene.scene_number),
                        );
                        const isSceneDragging = Boolean(
                          item.scene &&
                          draggedSceneNumber === item.scene.scene_number,
                        );

                        const sceneFolder = item.scene
                          ? sceneFoldersByNumber[item.scene.scene_number]
                          : undefined;

                        return (
                          <TimelineItemComponent
                            key={item.id}
                            item={item}
                            left={left}
                            width={width}
                            projectDirectory={projectDirectory || null}
                            useMockData={useMockData}
                            isSelected={isSelected}
                            isSceneDragging={isSceneDragging}
                            editingSceneNumber={editingSceneNumber}
                            editedSceneName={editedSceneName}
                            sceneFolder={sceneFolder}
                            onSceneDragStart={handleSceneDragStart}
                            onSceneDragEnd={handleSceneDragEnd}
                            onSceneBlockClick={handleSceneBlockClick}
                            onVideoBlockClick={handleVideoBlockClick}
                            onNameChange={handleNameChange}
                            onEditedNameChange={setEditedSceneName}
                            onViewDetails={handleViewSceneDetails}
                            onEditingCancel={() => {
                              // Restore scroll position on cancel
                              if (
                                scrollPositionBeforeEditRef.current !== null &&
                                tracksRef.current
                              ) {
                                tracksRef.current.scrollLeft =
                                  scrollPositionBeforeEditRef.current;
                                scrollPositionBeforeEditRef.current = null;
                              }
                              setEditingSceneNumber(null);
                              if (item.scene) {
                                setEditedSceneName(item.scene.name || '');
                              }
                            }}
                          />
                        );
                      })}

                      {/* Drop Indicator Line */}
                      {dropInsertIndex !== null &&
                        draggedSceneNumber !== null &&
                        (() => {
                          let indicatorLeft = 0;
                          if (dropInsertIndex < sceneBlocks.length) {
                            indicatorLeft = secondsToPixels(
                              sceneBlocks[dropInsertIndex].startTime,
                              zoomLevel,
                            );
                          } else if (sceneBlocks.length > 0) {
                            const lastBlock =
                              sceneBlocks[sceneBlocks.length - 1];
                            indicatorLeft = secondsToPixels(
                              lastBlock.startTime + lastBlock.duration,
                              zoomLevel,
                            );
                          }
                          return (
                            <div
                              className={styles.dropIndicatorLine}
                              style={{
                                left: `${indicatorLeft}px`,
                              }}
                            />
                          );
                        })()}
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

          {popoverSceneNumber !== null && popoverPosition && (
            <SceneActionPopover
              sceneNumber={popoverSceneNumber}
              position={popoverPosition}
              onClose={() => {
                setPopoverSceneNumber(null);
                setPopoverPosition(null);
              }}
              onRegenerate={(sceneNum, prompt) => {
                // TODO: Implement regenerate scene logic with prompt
                // This will call backend/agent to regenerate the scene with the given prompt
                // Parameters: sceneNum (number), prompt (string)
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const unusedParams = { sceneNum, prompt };
                return unusedParams;
              }}
              onGenerateNext={(sceneNum, prompt) => {
                // TODO: Implement generate next scene logic with prompt
                // This will call backend/agent to generate a new scene after sceneNum with the given prompt
                // Parameters: sceneNum (number), prompt (string)
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const unusedParams = { sceneNum, prompt };
                return unusedParams;
              }}
            />
          )}

          {previewSceneNumber !== null && (
            <MarkdownPreview
              isOpen={previewSceneNumber !== null}
              title={
                scenes.find((s) => s.scene_number === previewSceneNumber)
                  ?.name || `Scene ${previewSceneNumber}`
              }
              content={
                isLoadingMarkdown
                  ? 'Loading...'
                  : markdownContent || 'Loading...'
              }
              onClose={handleClosePreview}
            />
          )}
        </>
      )}
    </div>
  );
}
