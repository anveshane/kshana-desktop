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
} from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useTimeline } from '../../../contexts/TimelineContext';
import { useTimelineWebSocket } from '../../../hooks/useTimelineWebSocket';
import type {
  ProjectState,
  StoryboardScene,
  Artifact,
  TimelineMarker,
} from '../../../types/projectState';
import TimelineMarkerComponent from '../TimelineMarker/TimelineMarker';
import MarkerPromptPopover from '../TimelineMarker/MarkerPromptPopover';
import SceneActionPopover from './SceneActionPopover';
import VersionSelector from '../VersionSelector';
import styles from './TimelinePanel.module.scss';

// Mock scenes for when no project state exists (same as StoryboardView)
const MOCK_SCENES: StoryboardScene[] = [
  {
    scene_number: 1,
    description:
      'A young boy is seen lying in the ground, looking up at the sky. The lighting suggests late afternoon golden hour.',
    duration: 5,
    shot_type: 'Mid Shot',
    lighting: 'Golden Hour',
  },
  {
    scene_number: 2,
    description:
      'The boy stands up abruptly and kicks the soccer ball with significant force towards the horizon. Dust particles float.',
    duration: 3,
    shot_type: 'Low Angle',
    lighting: 'Action',
  },
  {
    scene_number: 3,
    description:
      "The Exchange - A mysterious figure's hand, covered in a ragged glove, hands over a metallic data drive in the rain.",
    duration: 8,
    shot_type: 'Close Up',
    lighting: 'Night',
  },
  {
    scene_number: 4,
    description:
      'Escape sequence - The protagonist flees on a high-speed bike through neon-lit streets. Blurring lights create streaks.',
    duration: 12,
    shot_type: 'Tracking',
    lighting: 'Speed',
  },
];

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
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Use external playback state if provided, otherwise use internal state
  const [internalPlaybackTime, setInternalPlaybackTime] = useState(0);
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);

  const currentPosition = externalPlaybackTime ?? internalPlaybackTime;
  const isPlaying = externalIsPlaying ?? internalIsPlaying;

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
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
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
  const [editingSceneNumber, setEditingSceneNumber] = useState<number | null>(
    null,
  );
  const [editedSceneName, setEditedSceneName] = useState<string>('');
  const [importedVideos, setImportedVideos] = useState<
    Array<{ path: string; duration: number; startTime: number }>
  >([]);
  const [activeVersions, setActiveVersions] = useState<Record<number, number>>(
    {},
  );
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

  // Load project state
  const loadProjectState = useCallback(async () => {
    if (!projectDirectory) return;

    setLoading(true);
    try {
      const stateFilePath = `${projectDirectory}/.kshana/project.json`;
      const content = await window.electron.project.readFile(stateFilePath);
      if (content) {
        const state = JSON.parse(content) as ProjectState;
        setProjectState(state);
      } else {
        setProjectState(null);
      }
    } catch {
      setProjectState(null);
    } finally {
      setLoading(false);
    }
  }, [projectDirectory]);

  useEffect(() => {
    loadProjectState();
  }, [loadProjectState]);

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
      if (!projectDirectory || !projectState) return;

      // Update local state immediately (optimistic update)
      const updatedScenes = (projectState.storyboard_outline?.scenes || []).map(
        (scene) =>
          scene.scene_number === sceneNumber
            ? { ...scene, name: name || undefined }
            : scene,
      );

      const updatedState: ProjectState = {
        ...projectState,
        storyboard_outline: projectState.storyboard_outline
          ? {
              ...projectState.storyboard_outline,
              scenes: updatedScenes,
            }
          : {
              scenes: updatedScenes,
            },
      };

      // Update local state immediately to avoid flickering
      setProjectState(updatedState);

      // Restore scroll position after state update
      if (scrollPositionBeforeEditRef.current !== null && tracksRef.current) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (
            tracksRef.current &&
            scrollPositionBeforeEditRef.current !== null
          ) {
            tracksRef.current.scrollLeft = scrollPositionBeforeEditRef.current;
            scrollPositionBeforeEditRef.current = null;
          }
        });
      }

      // Save to project.json in the background
      try {
        const stateFilePath = `${projectDirectory}/.kshana/project.json`;
        await window.electron.project.writeFile(
          stateFilePath,
          JSON.stringify(updatedState, null, 2),
        );
      } catch {
        // If save fails, reload from disk to restore previous state
        await loadProjectState();
      }
    },
    [projectDirectory, projectState, loadProjectState],
  );

  // Get scenes and artifacts - memoized to prevent infinite loops
  // Use mock scenes if no project state exists (same as StoryboardView)
  const scenes: StoryboardScene[] = useMemo(
    () => projectState?.storyboard_outline?.scenes || MOCK_SCENES,
    [projectState?.storyboard_outline?.scenes],
  );

  const { artifactsByScene, importedVideoArtifacts } = useMemo(() => {
    const artifactsBySceneMap: Record<number, Artifact> = {};
    const importedVideoArtifactsList: Artifact[] = [];

    if (projectState?.artifacts) {
      projectState.artifacts.forEach((artifact) => {
        if (
          artifact.scene_number &&
          (artifact.artifact_type === 'image' ||
            artifact.artifact_type === 'video')
        ) {
          // Use video if available, otherwise image
          if (
            !artifactsBySceneMap[artifact.scene_number] ||
            artifact.artifact_type === 'video'
          ) {
            artifactsBySceneMap[artifact.scene_number] = artifact;
          }
        }
        // Track imported videos separately
        if (artifact.artifact_type === 'video' && artifact.metadata?.imported) {
          importedVideoArtifactsList.push(artifact);
        }
      });
    }

    return {
      artifactsByScene: artifactsBySceneMap,
      importedVideoArtifacts: importedVideoArtifactsList,
    };
  }, [projectState?.artifacts]);

  // Get all video artifacts (both scene videos and imported videos)
  const allVideoArtifacts: Artifact[] = useMemo(
    () =>
      projectState?.artifacts.filter(
        (artifact) => artifact.artifact_type === 'video',
      ) || [],
    [projectState?.artifacts],
  );

  // Calculate scene blocks (used for rendering and context)
  // ALL scenes from storyboard are included, regardless of artifacts
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

  // Create unified timeline items - combine all videos and scenes
  interface TimelineItem {
    id: string;
    type: 'video' | 'scene';
    startTime: number;
    duration: number;
    artifact?: Artifact;
    scene?: StoryboardScene;
    path?: string;
    label: string;
  }

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // Add ALL scene blocks from storyboard - every scene appears on timeline
    sceneBlocks.forEach((block) => {
      const sceneLabel =
        block.scene.name || `Scene ${block.scene.scene_number}`;
      if (block.artifact && block.artifact.artifact_type === 'video') {
        // Scene has video - add as video item
        items.push({
          id: `scene-video-${block.scene.scene_number}`,
          type: 'video',
          startTime: block.startTime,
          duration: block.duration,
          artifact: block.artifact,
          scene: block.scene,
          path: block.artifact.file_path,
          label: sceneLabel,
        });
      } else {
        // Scene without video - add as scene item (will show placeholder or image)
        items.push({
          id: `scene-${block.scene.scene_number}`,
          type: 'scene',
          startTime: block.startTime,
          duration: block.duration,
          scene: block.scene,
          artifact: block.artifact,
          label: sceneLabel,
        });
      }
    });

    // Calculate scene end time for positioning imported videos
    const sceneEndTime =
      sceneBlocks.length > 0
        ? sceneBlocks[sceneBlocks.length - 1].startTime +
          sceneBlocks[sceneBlocks.length - 1].duration
        : 0;

    // Add imported videos (they go after all scenes)
    let importedVideoTime = sceneEndTime;
    importedVideos.forEach((video, index) => {
      items.push({
        id: `imported-${index}`,
        type: 'video',
        startTime: importedVideoTime,
        duration: video.duration,
        path: video.path,
        label: 'Imported',
      });
      importedVideoTime += video.duration;
    });

    // Add other video artifacts that don't have scene numbers
    let orphanVideoTime = importedVideoTime;
    allVideoArtifacts.forEach((artifact) => {
      if (!artifact.scene_number && !artifact.metadata?.imported) {
        const duration = (artifact.metadata?.duration as number) || 5;
        items.push({
          id: artifact.artifact_id,
          type: 'video',
          startTime: orphanVideoTime,
          duration,
          artifact,
          path: artifact.file_path,
          label: `VID_${artifact.artifact_id.slice(-6)}`,
        });
        orphanVideoTime += duration;
      }
    });

    // Sort timeline items by startTime to ensure correct order
    items.sort((a, b) => a.startTime - b.startTime);

    return items;
  }, [sceneBlocks, importedVideos, allVideoArtifacts]);

  // Calculate total duration from all timeline items
  const totalDuration =
    timelineItems.length > 0
      ? Math.max(
          ...timelineItems.map((item) => item.startTime + item.duration),
          10,
        )
      : 10;

  // Calculate scene blocks for marker context - memoized
  const sceneBlocksForMarkers = useMemo(() => {
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

  // Calculate scene duration for imported videos positioning
  const sceneDurationForImports = useMemo(() => {
    return scenes.reduce((acc, scene) => acc + (scene.duration || 5), 0);
  }, [scenes]);

  // Load imported videos from project state
  useEffect(() => {
    if (projectState && importedVideoArtifacts.length > 0) {
      let currentTime = sceneDurationForImports;
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
    } else if (projectState && importedVideoArtifacts.length === 0) {
      // Clear imported videos if none in project state
      setImportedVideos([]);
    }
  }, [projectState, sceneDurationForImports, importedVideoArtifacts]);

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
        const currentScene = sceneBlocksForMarkers.find(
          (block) =>
            position >= block.startTime &&
            position < block.startTime + block.duration,
        );

        const previousScenes = sceneBlocksForMarkers
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
    [sceneBlocksForMarkers, sendTimelineMarker],
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
        const maxDuration = Math.max(
          totalDuration,
          ...importedVideos.map((v) => v.startTime + v.duration),
        );
        if (next >= maxDuration) {
          setIsPlaying(false);
          setCurrentPosition(maxDuration);
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
    importedVideos,
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
      const maxDuration = Math.max(
        totalDuration,
        ...importedVideos.map((v) => v.startTime + v.duration),
      );
      return Math.max(0, Math.min(maxDuration, seconds));
    },
    [scrollLeft, zoomLevel, totalDuration, importedVideos, currentPosition],
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
            projectState,
            projectDirectory,
            setProjectState,
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
            projectState,
            projectDirectory,
            setProjectState,
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
      projectState,
      projectDirectory,
      setProjectState,
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

  // Handle video import - copy to videos folder
  const handleImportVideo = useCallback(async () => {
    if (!projectDirectory) return;

    try {
      const videoPath = await window.electron.project.selectVideoFile();
      if (!videoPath) return;

      // Create videos folder if it doesn't exist
      const videosFolder = `${projectDirectory}/videos`;
      await window.electron.project.createFolder(projectDirectory, 'videos');

      // Copy video to videos folder
      const videoFileName =
        videoPath.split('/').pop() || `video-${Date.now()}.mp4`;
      const destPath = await window.electron.project.copy(
        videoPath,
        videosFolder,
      );
      const relativePath = `videos/${videoFileName}`;

      // Get video duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = `file://${destPath}`;

      // eslint-disable-next-line compat/compat
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          const { duration } = video;

          setImportedVideos((prev) => [
            ...prev,
            {
              path: relativePath,
              duration,
              startTime: totalDuration,
            },
          ]);

          // Save to project state as artifact
          const artifact: Artifact = {
            artifact_id: `imported-video-${Date.now()}`,
            artifact_type: 'video',
            file_path: relativePath,
            metadata: {
              imported: true,
              original_path: videoPath,
              duration,
            },
            created_at: new Date().toISOString(),
          };

          // Create or update project state
          const updatedState: ProjectState = projectState
            ? {
                ...projectState,
                artifacts: [...(projectState.artifacts || []), artifact],
              }
            : {
                // Create new project state if none exists
                project_id: `proj-${Date.now()}`,
                project_name: projectDirectory?.split('/').pop() || 'Untitled',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                phase: 'initial',
                characters: {},
                locations: {},
                artifacts: [artifact],
                character_assets: {},
                setting_assets: {},
                character_details: {},
              };

          // Ensure .kshana directory exists and save state
          const kshanaDir = `${projectDirectory}/.kshana`;
          const stateFilePath = `${kshanaDir}/project.json`;

          // Create .kshana folder if needed, then write project.json
          window.electron.project
            .createFolder(projectDirectory!, '.kshana')
            .then(() =>
              window.electron.project.writeFile(
                stateFilePath,
                JSON.stringify(updatedState, null, 2),
              ),
            )
            .then(() => {
              setProjectState(updatedState);
              return undefined;
            })
            .catch(() => {
              // Failed to save project state
              return undefined;
            });

          resolve();
        };
        video.onerror = reject;
      });
    } catch {
      // Failed to import video
    }
  }, [projectDirectory, totalDuration, projectState]);

  // Drag handlers removed - not used in unified timeline

  // Handle scene split at playhead
  const handleSplitScene = useCallback(() => {
    const currentSceneIndex = sceneBlocksForMarkers.findIndex(
      (block) =>
        currentPosition >= block.startTime &&
        currentPosition < block.startTime + block.duration,
    );

    if (currentSceneIndex === -1) {
      return;
    }

    const block = sceneBlocksForMarkers[currentSceneIndex];
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
  }, [currentPosition, sceneBlocksForMarkers]);

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

  if (!projectDirectory) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Open a project to view the timeline</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading timeline...</div>
      </div>
    );
  }

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
                        const videoPath = item.path
                          ? `file://${projectDirectory}/${item.path}`
                          : null;
                        const imagePath =
                          item.artifact &&
                          item.artifact.artifact_type === 'image'
                            ? `file://${projectDirectory}/${item.artifact.file_path}`
                            : null;

                        if (item.type === 'video' && videoPath) {
                          return (
                            <div
                              key={item.id}
                              className={styles.videoBlock}
                              style={{
                                left: `${left}px`,
                                width: `${width}px`,
                              }}
                            >
                              <video
                                src={videoPath}
                                className={styles.videoThumbnail}
                                preload="metadata"
                                muted
                              />
                              <div className={styles.videoLabel}>
                                {item.label}
                              </div>
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
                          thumbnailElement = (
                            <div className={styles.scenePlaceholder} />
                          );
                        }

                        const isSelected =
                          item.scene &&
                          selectedScenes.has(item.scene.scene_number);
                        const isSceneDragging =
                          item.scene &&
                          draggedSceneNumber === item.scene.scene_number;

                        return (
                          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                          <div
                            key={item.id}
                            className={`${styles.sceneBlock} ${isSelected ? styles.selected : ''} ${isSceneDragging ? styles.dragging : ''}`}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                            }}
                            draggable={!!item.scene}
                            onDragStart={(e) => {
                              if (item.scene) {
                                handleSceneDragStart(
                                  e,
                                  item.scene.scene_number,
                                );
                              }
                            }}
                            onDragEnd={handleSceneDragEnd}
                            onClick={(e) => {
                              if (item.scene) {
                                handleSceneBlockClick(
                                  e,
                                  item.scene.scene_number,
                                );
                              }
                            }}
                          >
                            {thumbnailElement}
                            {item.scene &&
                            editingSceneNumber === item.scene.scene_number ? (
                              <div className={styles.sceneNameEdit}>
                                <input
                                  type="text"
                                  value={editedSceneName}
                                  onChange={(e) =>
                                    setEditedSceneName(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleNameChange(
                                        item.scene!.scene_number,
                                        editedSceneName,
                                      );
                                      setEditingSceneNumber(null);
                                    } else if (e.key === 'Escape') {
                                      // Restore scroll position on cancel
                                      if (
                                        scrollPositionBeforeEditRef.current !==
                                          null &&
                                        tracksRef.current
                                      ) {
                                        tracksRef.current.scrollLeft =
                                          scrollPositionBeforeEditRef.current;
                                        scrollPositionBeforeEditRef.current =
                                          null;
                                      }
                                      setEditingSceneNumber(null);
                                      setEditedSceneName(
                                        item.scene!.name || '',
                                      );
                                    }
                                  }}
                                  onBlur={() => {
                                    handleNameChange(
                                      item.scene!.scene_number,
                                      editedSceneName,
                                    );
                                    setEditingSceneNumber(null);
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
                                    // Save scroll position before editing
                                    if (tracksRef.current) {
                                      scrollPositionBeforeEditRef.current =
                                        tracksRef.current.scrollLeft;
                                    }
                                    setEditingSceneNumber(
                                      item.scene.scene_number,
                                    );
                                    setEditedSceneName(item.scene.name || '');
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
                                      // Save scroll position before editing
                                      if (tracksRef.current) {
                                        scrollPositionBeforeEditRef.current =
                                          tracksRef.current.scrollLeft;
                                      }
                                      setEditingSceneNumber(
                                        item.scene!.scene_number,
                                      );
                                      setEditedSceneName(
                                        item.scene!.name || '',
                                      );
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
                          </div>
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
        </>
      )}
    </div>
  );
}
