import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Film, Play, Calendar, Pause, Download, ChevronDown } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { useTimelineDataContext } from '../../../contexts/TimelineDataContext';
import { useAudioController } from '../../../hooks/useAudioController';
import { usePlaybackController } from '../../../hooks/usePlaybackController';
import {
  resolveAssetPathForDisplay,
  resolveAssetPathWithRetry,
} from '../../../utils/pathResolver';
import { normalizePathForExport } from '../../../utils/pathNormalizer';
import type { Artifact } from '../../../types/projectState';
import type { SceneRef } from '../../../types/kshana/entities';
import type { SceneVersions } from '../../../types/kshana/timeline';
import type { TextOverlayCue } from '../../../types/captions';
import { getActiveCue, getActiveWordIndex } from '../../../utils/captionGrouping';
import styles from './VideoLibraryView.module.scss';

function normalizeVideoSourcePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('file://')) {
    return decodeURIComponent(trimmed.replace(/^file:\/\//, '')).replace(/\\/g, '/');
  }

  return trimmed.replace(/\\/g, '/');
}

function doesVideoSourceMatch(currentSrc: string, expectedSrc: string): boolean {
  if (!currentSrc || !expectedSrc) return false;
  if (currentSrc === expectedSrc) return true;

  const normalizedCurrent = normalizeVideoSourcePath(currentSrc);
  const normalizedExpected = normalizeVideoSourcePath(expectedSrc);
  if (!normalizedCurrent || !normalizedExpected) return false;

  return normalizedCurrent === normalizedExpected;
}

// Video Card Component
interface VideoCardProps {
  artifact: Artifact;
  formatDate: (dateString: string) => string;
  projectDirectory: string | null;
}

function VideoCard({ artifact, formatDate, projectDirectory }: VideoCardProps) {
  const [videoPath, setVideoPath] = useState<string>('');

  useEffect(() => {
    resolveAssetPathForDisplay(artifact.file_path, projectDirectory).then(
      (resolved) => {
        setVideoPath(resolved);
      },
    );
  }, [artifact.file_path, projectDirectory]);

  return (
    <div className={styles.videoCard}>
      <div className={styles.videoThumbnail}>
        {videoPath && (
          <video
            src={videoPath}
            className={styles.video}
            preload="metadata"
            muted
          />
        )}
        {artifact.scene_number && (
          <div className={styles.sceneBadge}>Scene {artifact.scene_number}</div>
        )}
      </div>
      <div className={styles.videoInfo}>
        <div className={styles.videoTitle}>
          {(artifact.metadata?.title as string) ||
            `Video ${artifact.artifact_id.slice(-8)}`}
        </div>
        <div className={styles.videoMeta}>
          <div className={styles.metaItem}>
            <Calendar size={12} />
            <span>{formatDate(artifact.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VideoLibraryViewProps {
  playbackTime: number;
  isPlaying: boolean;
  isDragging?: boolean;
  onPlaybackTimeChange: (time: number) => void;
  onPlaybackStateChange: (playing: boolean) => void;
  onTotalDurationChange?: (duration: number) => void;
  activeVersions?: Record<number, SceneVersions>; // sceneNumber -> { image?: number, video?: number }
  projectScenes?: SceneRef[];
}

export default function VideoLibraryView({
  playbackTime,
  isPlaying,
  isDragging = false,
  onPlaybackTimeChange,
  onPlaybackStateChange,
  onTotalDurationChange,
  activeVersions = {},
  projectScenes = [],
}: VideoLibraryViewProps) {
  const { projectDirectory } = useWorkspace();
  const { isLoading, assetManifest } = useProject();

  // Create scene folder map
  const sceneFoldersByNumber = useMemo(() => {
    const map: Record<number, string> = {};
    projectScenes.forEach((scene) => {
      map[scene.scene_number] = scene.folder;
    });
    return map;
  }, [projectScenes]);

  // Use unified timeline data from context (single source of truth for TimelinePanel + VideoLibraryView)
  const {
    timelineItems,
    overlayItems,
    textOverlayCues,
    totalDuration,
  } = useTimelineDataContext();

  // Notify parent when totalDuration changes (for playback bounds checking)
  useEffect(() => {
    if (onTotalDurationChange) {
      onTotalDurationChange(totalDuration);
    }
  }, [totalDuration, onTotalDurationChange]);

  // Get video artifacts from asset manifest for the sidebar
  const videoArtifacts = useMemo(() => {
    if (!assetManifest?.assets) return [];
    return assetManifest.assets
      .filter(
        (asset) => asset.type === 'scene_video' || asset.type === 'final_video',
      )
      .map((asset) => {
        let createdAt: string;
        if (asset.created_at) {
          const date = new Date(asset.created_at);
          createdAt = isNaN(date.getTime())
            ? new Date().toISOString()
            : date.toISOString();
        } else {
          createdAt = new Date().toISOString();
        }
        return {
          artifact_id: asset.id,
          artifact_type: 'video',
          file_path: asset.path,
          created_at: createdAt,
          scene_number: asset.scene_number,
          metadata: {
            title: asset.path.replace(/\\/g, '/').split('/').pop(),
            duration: asset.metadata?.duration,
            imported: asset.metadata?.imported,
          },
        };
      });
  }, [assetManifest]);

  // Refs must be declared before usePlaybackController hook
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const currentVideoPathRef = useRef<string | null>(null);
  const appliedClipIdentityRef = useRef<string | null>(null);
  const videoPathRequestIdRef = useRef(0);
  const sceneImageRequestIdRef = useRef(0);
  const isSeekingRef = useRef(false);
  const isVideoLoadingRef = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const lastPlaybackTimeRef = useRef(0);

  // Use production-grade playback controller instead of manual state management
  const { currentItem, currentItemIndex } = usePlaybackController(
    timelineItems,
    playbackTime,
    isPlaying,
    isDragging,
    () => isSeekingRef.current, // Pass function to get current seeking state
  );

  // Format date
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Format time display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const renderCaptionCue = useCallback(
    (cue: TextOverlayCue, highlightedWordIndex: number): React.ReactNode => {
      return cue.words.map((word, index) => (
        <span
          key={`${cue.id}-${word.startTime}-${word.endTime}-${index}`}
          className={
            index === highlightedWordIndex
              ? styles.wordCaptionWordActive
              : styles.wordCaptionWord
          }
        >
          {index > 0 ? ' ' : ''}
          {word.text}
        </span>
      ));
    },
    [],
  );

  // Wrapper to prevent backward jumps during normal playback
  // Backward jumps are only allowed during explicit seeks or when dragging
  const safeSetPlaybackTime = useCallback(
    (newTime: number, isSeeking = false) => {
      const lastTime = lastPlaybackTimeRef.current;

      // Allow backward jumps if:
      // - Explicitly seeking
      // - Small correction (< 0.5s)
      // - Moving forward (newTime >= lastTime)
      // - Starting from 0
      if (isSeeking || newTime >= lastTime - 0.5 || lastTime === 0) {
        onPlaybackTimeChange(newTime);
        lastPlaybackTimeRef.current = newTime;
      } else {
        console.warn(
          '[VideoLibraryView] Prevented backward jump during playback:',
          {
            from: lastTime,
            to: newTime,
          },
        );
      }
    },
    [onPlaybackTimeChange],
  );

  // Get current video and image from playback controller
  // currentItem is already provided by usePlaybackController
  const currentVideo = currentItem?.type === 'video' ? currentItem : null;
  const currentImage = currentItem?.type === 'image' ? currentItem : null;
  const sceneClipIdentity = useMemo(() => {
    if (!currentItem) return null;
    if (
      currentItem.type === 'video' ||
      currentItem.type === 'audio' ||
      currentItem.type === 'text_overlay'
    ) {
      return null;
    }

    const idPart = currentItem.id || currentItem.label;
    return `${idPart}:${currentItem.startTime}:${currentItem.endTime}:${currentItem.imagePath ?? ''}`;
  }, [currentItem]);
  const clipIdentity = useMemo(() => {
    if (!currentVideo) return null;

    const idPart = currentVideo.id || currentVideo.label;
    return `${idPart}:${currentVideo.startTime}:${currentVideo.endTime}:${currentVideo.sourceOffsetSeconds ?? 0}`;
  }, [currentVideo]);

  const currentOverlay = useMemo(() => {
    if (overlayItems.length === 0) return null;
    return (
      overlayItems.find(
        (item) =>
          playbackTime >= item.startTime && playbackTime < item.endTime,
      ) || null
    );
  }, [overlayItems, playbackTime]);

  const activeOverlay =
    currentItem?.type === 'image' ? currentOverlay : null;

  const activeTextCue = useMemo(
    () => getActiveCue(textOverlayCues, playbackTime),
    [textOverlayCues, playbackTime],
  );
  const activeWordIndex = useMemo(
    () => getActiveWordIndex(activeTextCue, playbackTime),
    [activeTextCue, playbackTime],
  );

  // Log when currentVideo changes
  useEffect(() => {
    console.log('[VideoLibraryView] currentVideo changed:', {
      currentItemIndex,
      currentItemType: currentItem?.type,
      currentVideoLabel: currentVideo?.label,
      currentVideoPlacementNumber: currentVideo?.placementNumber,
      currentVideoPath: currentVideo?.videoPath,
      currentVideoStartTime: currentVideo?.startTime?.toFixed(2),
      currentVideoEndTime: currentVideo?.endTime?.toFixed(2),
      hasVideoRef: !!videoRef.current,
      currentVideoElementSrc: videoRef.current?.src,
    });
  }, [currentVideo, currentItemIndex, currentItem]);

  // Extract audio file metadata from timeline data (stable - only changes when audio file changes)
  const audioFile = useMemo(() => {
    const audioItems = timelineItems.filter((item) => item.type === 'audio');
    if (audioItems.length === 0) return null;

    const firstAudio = audioItems[0];
    if (!firstAudio.audioPath) return null;

    return {
      path: firstAudio.audioPath,
      duration: firstAudio.duration,
    };
  }, [timelineItems]); // ✅ Stable - only changes when audio file actually changes

  // Resolve audio path
  const [resolvedAudioPath, setResolvedAudioPath] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!audioFile?.path || !projectDirectory) {
      setResolvedAudioPath(null);
      return;
    }

    // Use retry logic similar to image placements to handle file copy timing issues
    resolveAssetPathWithRetry(audioFile.path, projectDirectory, {
      maxRetries: 3,
      retryDelayBase: 500,
      timeout: 5000,
      verifyExists: true,
    })
      .then((resolved) => {
        setResolvedAudioPath(resolved);
      })
      .catch((error) => {
        console.error(
          '[VideoLibraryView] Failed to resolve audio path:',
          error,
        );
        setResolvedAudioPath(null);
      });
  }, [audioFile?.path, projectDirectory]);

  // Use audio controller hook (imperative audio management)
  const { audioRef } = useAudioController({
    playbackTime,
    isPlaying,
    audioFile,
    resolvedAudioPath,
    projectDirectory,
    isDragging,
    isSeeking: () => isSeekingRef.current, // Pass function to get current seeking state
    onPlaybackStateChange,
    currentVideoItem: currentVideo ? { endTime: currentVideo.endTime } : null,
  });

  // Resolve image path from current timeline item (placement-based)
  const sceneImagePath = useMemo(() => {
    if (!currentImage) {
      console.debug('[VideoLibraryView] No current image item');
      return null;
    }

    return currentImage.imagePath || null;
  }, [currentImage]);

  // Resolve and store the display-ready image path
  const [resolvedSceneImagePath, setResolvedSceneImagePath] = useState<
    string | null
  >(null);

  const [resolvedOverlayPath, setResolvedOverlayPath] = useState<string | null>(
    null,
  );

  useEffect(() => {
    sceneImageRequestIdRef.current += 1;
    const requestId = sceneImageRequestIdRef.current;
    // Clear stale image immediately so previous clip art does not linger.
    setResolvedSceneImagePath(null);

    if (!sceneImagePath || !projectDirectory) {
      setResolvedSceneImagePath(null);
      return;
    }

    resolveAssetPathWithRetry(sceneImagePath, projectDirectory, {
      maxRetries: 3,
      retryDelayBase: 350,
      timeout: 5000,
      verifyExists: true,
    })
      .then((resolved) => {
        if (requestId !== sceneImageRequestIdRef.current) {
          return;
        }
        setResolvedSceneImagePath(resolved);
      })
      .catch(() => {
        if (requestId !== sceneImageRequestIdRef.current) {
          return;
        }
        setResolvedSceneImagePath(null);
      });
  }, [sceneImagePath, sceneClipIdentity, projectDirectory]);

  useEffect(() => {
    if (!activeOverlay?.videoPath || !projectDirectory) {
      setResolvedOverlayPath(null);
      return;
    }

    resolveAssetPathForDisplay(activeOverlay.videoPath, projectDirectory)
      .then((resolved) => {
        setResolvedOverlayPath(resolved);
      })
      .catch(() => {
        setResolvedOverlayPath(null);
      });
  }, [activeOverlay?.videoPath, activeOverlay?.id, projectDirectory]);

  // Handle video play/pause
  const handlePlayPause = useCallback(() => {
    const newPlayingState = !isPlaying;
    onPlaybackStateChange(newPlayingState);

    // Audio play/pause is handled by audio controller
  }, [isPlaying, onPlaybackStateChange]);

  // Handle video time update - sync with timeline position
  // Video time updates should always be trusted - they come from the video element itself
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!currentVideo || isSeekingRef.current || isDragging) return;
      const sourceOffset = currentVideo.sourceOffsetSeconds ?? 0;
      const videoTime = e.currentTarget.currentTime;
      const timelineTime = currentVideo.startTime + (videoTime - sourceOffset);
      // Always update playbackTime from video - don't use safeSetPlaybackTime
      // Video element's currentTime is authoritative and should be trusted
      console.log('[VideoLibraryView] Video time update:', {
        videoTime: videoTime.toFixed(2),
        timelineTime: timelineTime.toFixed(2),
        currentVideoLabel: currentVideo?.label,
        currentVideoStartTime: currentVideo.startTime.toFixed(2),
      });
      onPlaybackTimeChange(timelineTime);
      lastPlaybackTimeRef.current = timelineTime; // Update ref for safeSetPlaybackTime
    },
    [currentVideo, onPlaybackTimeChange, isDragging],
  );

  // Handle video end - playback controller will handle item transitions automatically
  // We just need to advance playbackTime to trigger the transition
  const handleVideoEnd = useCallback(() => {
    if (isDragging) return; // Don't auto-advance during dragging

    if (
      currentItemIndex !== null &&
      currentItemIndex < timelineItems.length - 1
    ) {
      const nextIndex = currentItemIndex + 1;
      const nextItem = timelineItems[nextIndex];
      if (nextItem) {
        // Advance playbackTime to next item's start - playback controller will handle the transition
        safeSetPlaybackTime(nextItem.startTime, false);
        // Video will auto-play when source changes if was playing (only if next item is video)
      }
    } else {
      // Reached end of timeline
      onPlaybackStateChange(false);
      safeSetPlaybackTime(0, false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
      // Audio position is managed by timeline-driven sync, not scene events
    }
  }, [
    currentItemIndex,
    timelineItems,
    safeSetPlaybackTime,
    onPlaybackStateChange,
    isDragging,
  ]);

  // Handle seek - find which item and position
  const handleSeek = useCallback(
    (seekTime: number) => {
      isSeekingRef.current = true;

      // During dragging, only update playback time, don't switch items
      // Item switching will happen when drag ends
      if (isDragging) {
        safeSetPlaybackTime(seekTime, true);
        // Still seek within current video if possible
        if (videoRef.current && currentVideo) {
          const sourceOffset = currentVideo.sourceOffsetSeconds ?? 0;
          const videoTime = sourceOffset + (seekTime - currentVideo.startTime);
          if (
            videoTime >= sourceOffset &&
            videoTime <= sourceOffset + currentVideo.duration
          ) {
            videoRef.current.currentTime = videoTime;
          }
        }
        // Audio position is managed by timeline-driven sync, not scene logic
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 50);
        return;
      }

      // Normal seek (not dragging) - playback controller will handle item switching automatically
      // Just update playbackTime and let the controller determine which item should be active
      safeSetPlaybackTime(seekTime, true);

      // If seeking within the same video item, update video element directly
      if (currentVideo && videoRef.current) {
        const sourceOffset = currentVideo.sourceOffsetSeconds ?? 0;
        const videoTime = sourceOffset + (seekTime - currentVideo.startTime);
        if (
          videoTime >= sourceOffset &&
          videoTime <= sourceOffset + currentVideo.duration
        ) {
          videoRef.current.currentTime = videoTime;
        }
      }

      // Audio position is managed by timeline-driven sync, not scene logic

      // Clear seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    },
    [
      timelineItems,
      currentItemIndex,
      totalDuration,
      safeSetPlaybackTime,
      isDragging,
      currentVideo,
    ],
  );

  // Handle seek bar input (for the range slider)
  const handleSeekBarChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const seekTime = parseFloat(e.target.value);
      handleSeek(seekTime);
    },
    [handleSeek],
  );

  // Resolved video path state
  const [currentVideoPath, setCurrentVideoPath] = useState<string>('');
  const shouldShowVideo = Boolean(currentVideo && currentVideoPath);
  const shouldShowLoadingVideo = Boolean(currentVideo && !currentVideoPath);

  // Construct version-specific path if active version is set (placement-based)
  const versionPath = useMemo(() => {
    if (!currentVideo) {
      console.log('[VideoLibraryView] No currentVideo for versionPath');
      return null;
    }

    console.log('[VideoLibraryView] Calculating versionPath:', {
      currentVideo: {
        label: currentVideo.label,
        placementNumber: currentVideo.placementNumber,
        videoPath: currentVideo.videoPath,
        startTime: currentVideo.startTime,
        endTime: currentVideo.endTime,
      },
    });

    const selectedPath = currentVideo.videoPath || null;
    if (!selectedPath) {
      console.warn(
        `[VideoLibraryView] No videoPath found for ${currentVideo.label}`,
      );
    }
    return selectedPath;
  }, [currentVideo]);

  // If versionPath is null but videoPath exists, use videoPath directly as fallback
  const effectiveVersionPath = useMemo(() => {
    if (versionPath) return versionPath;

    // Fallback: if versionPath is null but videoPath exists, use videoPath directly
    const fallbackPath = currentVideo?.videoPath;
    if (!versionPath && fallbackPath) {
      console.warn(
        '[VideoLibraryView] versionPath is null, using fallback videoPath:',
        fallbackPath,
      );
      return fallbackPath;
    }

    return versionPath;
  }, [versionPath, currentVideo]);

  useEffect(() => {
    setCurrentVideoPath('');
    currentVideoPathRef.current = null;
    appliedClipIdentityRef.current = null;
    isVideoLoadingRef.current = false;
  }, [clipIdentity]);

  // Resolve video path when current video or version changes
  useEffect(() => {
    videoPathRequestIdRef.current += 1;
    const requestId = videoPathRequestIdRef.current;
    console.log('[VideoLibraryView] Resolving video path:', {
      effectiveVersionPath,
      versionPath,
      hasProjectDirectory: !!projectDirectory,
      requestId,
    });

    if (!effectiveVersionPath) {
      console.log(
        '[VideoLibraryView] No effectiveVersionPath, clearing currentVideoPath',
      );
      if (requestId === videoPathRequestIdRef.current) {
        setCurrentVideoPath('');
      }
      return undefined;
    }

    resolveAssetPathForDisplay(effectiveVersionPath, projectDirectory || null)
      .then((resolved) => {
        if (requestId !== videoPathRequestIdRef.current) {
          return undefined;
        }
        console.log('[VideoLibraryView] Video path resolved:', {
          effectiveVersionPath,
          resolved,
        });
        if (resolved && resolved.trim()) {
          setCurrentVideoPath(resolved);
        } else {
          console.warn(
            `[VideoLibraryView] Empty resolved path for: ${effectiveVersionPath}`,
          );
          setCurrentVideoPath('');
        }
      })
      .catch((error) => {
        if (requestId !== videoPathRequestIdRef.current) {
          return undefined;
        }
        console.error(
          `[VideoLibraryView] Failed to resolve video path: ${effectiveVersionPath}`,
          error,
        );
        setCurrentVideoPath('');
      });
  }, [effectiveVersionPath, projectDirectory]);

  // Update video source when current video changes
  // Don't switch videos during dragging - wait until drag ends
  useEffect(() => {
    console.log('[VideoLibraryView] Video source update effect:', {
      hasCurrentVideo: !!currentVideo,
      currentVideoLabel: currentVideo?.label,
      currentVideoPath,
      isDragging,
      hasVideoRef: !!videoRef.current,
    });

    if (!videoRef.current || isDragging) {
      console.log('[VideoLibraryView] Skipping video source update:', {
        hasCurrentVideo: !!currentVideo,
        hasVideoRef: !!videoRef.current,
        isDragging,
      });
      return undefined;
    }

    const videoElement = videoRef.current;
    const clearVideoSource = () => {
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
      currentVideoPathRef.current = null;
      appliedClipIdentityRef.current = null;
      isVideoLoadingRef.current = false;
    };

    if (!currentVideo) {
      if (videoElement.src) {
        clearVideoSource();
      } else {
        currentVideoPathRef.current = null;
        appliedClipIdentityRef.current = null;
        isVideoLoadingRef.current = false;
      }
      return undefined;
    }

    // If path is empty, check if we need to clear existing video
    if (!currentVideoPath || !currentVideoPath.trim()) {
      if (videoElement.src) {
        clearVideoSource();
      } else {
        currentVideoPathRef.current = null;
        appliedClipIdentityRef.current = null;
        isVideoLoadingRef.current = false;
      }
      console.log('[VideoLibraryView] Waiting for video path resolution:', {
        currentVideoLabel: currentVideo.label,
        currentVideoPath,
        hasExistingSrc: !!videoElement.src,
      });
      return undefined;
    }

    const clipChanged = appliedClipIdentityRef.current !== clipIdentity;
    const pathChanged = currentVideoPathRef.current !== currentVideoPath;
    const srcMismatch = !doesVideoSourceMatch(videoElement.src, currentVideoPath);
    const shouldApplySource = clipChanged || pathChanged || srcMismatch;
    if (!shouldApplySource) {
      return undefined;
    }

    console.log('[VideoLibraryView] Video source changing:', {
      from: currentVideoPathRef.current,
      to: currentVideoPath,
      currentVideoLabel: currentVideo.label,
      clipChanged,
      pathChanged,
      srcMismatch,
    });

    const wasPlaying = !videoElement.paused;

    // Pause current video before changing source
    videoElement.pause();

    const handleError = () => {
      isVideoLoadingRef.current = false;
      const { error } = videoElement;
      if (error) {
        console.error(`[VideoLibraryView] Video error for ${currentVideo.label}:`, {
          code: error.code,
          message: error.message,
          path: currentVideoPath,
          effectiveVersionPath,
          videoPath: currentVideo.videoPath,
        });

        // Try fallback: use videoPath directly if versionPath failed
        if (currentVideo.videoPath && currentVideoPath !== currentVideo.videoPath) {
          console.log(
            '[VideoLibraryView] Video load error, trying fallback path:',
            currentVideo.videoPath,
          );
          resolveAssetPathForDisplay(currentVideo.videoPath, projectDirectory || null)
            .then((resolved) => {
              if (
                resolved &&
                resolved.trim() &&
                resolved !== currentVideoPath &&
                videoRef.current
              ) {
                console.log(
                  '[VideoLibraryView] Fallback path resolved successfully:',
                  resolved,
                );
                currentVideoPathRef.current = resolved;
                appliedClipIdentityRef.current = clipIdentity;
                isVideoLoadingRef.current = true;
                videoRef.current.src = resolved;
                videoRef.current.load();
              }
            })
            .catch((fallbackError) => {
              console.error(
                '[VideoLibraryView] Fallback path resolution also failed:',
                fallbackError,
              );
            });
        }
      }
    };

    const handleCanPlay = () => {
      isVideoLoadingRef.current = false;
      console.log(`[VideoLibraryView] Video can play: ${currentVideo.label}`);
      // Seek to the correct position based on playbackTime
      const sourceOffset = currentVideo.sourceOffsetSeconds ?? 0;
      const timelinePlaybackTime = lastPlaybackTimeRef.current;
      const videoTime =
        sourceOffset + (timelinePlaybackTime - currentVideo.startTime);
      if (
        videoTime > sourceOffset &&
        videoTime < sourceOffset + currentVideo.duration
      ) {
        videoElement.currentTime = Math.max(0, videoTime);
      }
      // Resume playback if it was playing
      if (wasPlaying || isPlaying) {
        videoElement.play().catch((playError) => {
          console.warn(
            `[VideoLibraryView] Play error for ${currentVideo.label}:`,
            playError,
          );
        });
      }
      videoElement.removeEventListener('canplay', handleCanPlay);
    };

    const handleLoadedData = () => {
      isVideoLoadingRef.current = false;
      console.log(`[VideoLibraryView] Video loaded: ${currentVideo.label}`);
      // Video is loaded, seek to correct position
      const sourceOffset = currentVideo.sourceOffsetSeconds ?? 0;
      const timelinePlaybackTime = lastPlaybackTimeRef.current;
      const videoTime =
        sourceOffset + (timelinePlaybackTime - currentVideo.startTime);
      if (
        videoTime > sourceOffset &&
        videoTime < sourceOffset + currentVideo.duration
      ) {
        videoElement.currentTime = Math.max(0, videoTime);
      }
      // Resume playback if it was playing
      if (wasPlaying || isPlaying) {
        videoElement.play().catch((playError) => {
          console.warn(
            `[VideoLibraryView] Play error for ${currentVideo.label}:`,
            playError,
          );
        });
      }
      videoElement.removeEventListener('loadeddata', handleLoadedData);
    };

    const handleLoadStart = () => {
      console.log(
        `[VideoLibraryView] Loading video: ${currentVideo.label} from ${currentVideoPath}`,
      );
      isVideoLoadingRef.current = true;
    };

    videoElement.addEventListener('error', handleError);
    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('loadstart', handleLoadStart);

    console.log('[VideoLibraryView] Setting video element src:', {
      newSrc: currentVideoPath,
      oldSrc: videoElement.src,
      currentVideoLabel: currentVideo.label,
      wasPlaying,
    });
    currentVideoPathRef.current = currentVideoPath;
    appliedClipIdentityRef.current = clipIdentity;
    isVideoLoadingRef.current = true;
    videoElement.src = currentVideoPath;
    videoElement.muted = true; // Mute video audio so only imported audio track plays
    // Don't reset currentTime to 0 - let it be set by the loaded event handlers based on playbackTime
    videoElement.load();
    console.log('[VideoLibraryView] Video element src set and load() called:', {
      src: videoElement.src,
      readyState: videoElement.readyState,
      networkState: videoElement.networkState,
    });

    return () => {
      videoElement.removeEventListener('error', handleError);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('loadstart', handleLoadStart);
    };
  }, [
    currentVideo,
    currentVideoPath,
    clipIdentity,
    isPlaying,
    isDragging,
    effectiveVersionPath,
    projectDirectory,
  ]);

  // Item index is now managed by usePlaybackController
  // No boundary checking logic needed - TimeIndex handles all lookups
  // Log when currentItem changes for debugging
  useEffect(() => {
    if (currentItem) {
      console.log('[VideoLibraryView] Current item from playback controller:', {
        itemIndex: currentItemIndex,
        itemType: currentItem.type,
        itemLabel: currentItem.label,
        playbackTime: playbackTime.toFixed(2),
        itemStartTime: currentItem.startTime.toFixed(2),
        itemEndTime: currentItem.endTime.toFixed(2),
      });
    }
  }, [currentItem, currentItemIndex, playbackTime]);

  // Initialization is handled by playback controller
  // No manual initialization needed - controller determines currentItemIndex from playbackTime

  // Sync play state with video element
  useEffect(() => {
    if (!videoRef.current) return;

    const videoElement = videoRef.current;
    const handlePlay = () => onPlaybackStateChange(true);
    const handlePause = () => onPlaybackStateChange(false);

    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    return () => {
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [onPlaybackStateChange, currentItemIndex]);

  // Sync video playback with shared state
  useEffect(() => {
    if (!videoRef.current || !currentVideo || isDragging) return;

    const videoElement = videoRef.current;

    // Ensure video is muted so only imported audio plays
    if (!videoElement.muted) {
      videoElement.muted = true;
    }

    // Sync play/pause state
    if (isPlaying && videoElement.paused) {
      videoElement.play().catch(() => {
        // Ignore play errors
      });
    } else if (!isPlaying && !videoElement.paused) {
      videoElement.pause();
    }
  }, [isPlaying, currentVideo, isDragging]);

  // Sync video position with playbackTime (when not seeking or dragging)
  useEffect(() => {
    if (
      !videoRef.current ||
      !currentVideo ||
      isSeekingRef.current ||
      isDragging ||
      isVideoLoadingRef.current // Don't sync while video is loading
    ) {
      return;
    }

    const videoElement = videoRef.current;

    // Don't sync if video is not ready (still loading)
    if (videoElement.readyState < 2) {
      return;
    }

    const sourceOffset = currentVideo.sourceOffsetSeconds ?? 0;
    const expectedVideoTime = sourceOffset + (playbackTime - currentVideo.startTime);

    // Only update if there's a significant difference to avoid jitter
    // Also ensure we're within valid bounds
    if (
      expectedVideoTime >= sourceOffset &&
      expectedVideoTime <= sourceOffset + currentVideo.duration &&
      Math.abs(videoElement.currentTime - expectedVideoTime) > 0.2
    ) {
      videoElement.currentTime = Math.max(0, expectedVideoTime);
    }
  }, [playbackTime, currentVideo, isDragging]);

  // Load overlay video source when available
  useEffect(() => {
    const overlayElement = overlayVideoRef.current;
    if (!overlayElement) return;

    if (!resolvedOverlayPath || !activeOverlay) {
      overlayElement.removeAttribute('src');
      overlayElement.load();
      return;
    }

    overlayElement.src = resolvedOverlayPath;
    overlayElement.muted = true;
    overlayElement.load();
  }, [resolvedOverlayPath, activeOverlay?.id]);

  // Sync overlay play/pause state
  useEffect(() => {
    const overlayElement = overlayVideoRef.current;
    if (!overlayElement || !activeOverlay || isDragging) return;

    if (isPlaying && overlayElement.paused) {
      overlayElement.play().catch(() => {
        // Ignore play errors
      });
    } else if (!isPlaying && !overlayElement.paused) {
      overlayElement.pause();
    }
  }, [isPlaying, activeOverlay, isDragging]);

  // Sync overlay position with playbackTime
  useEffect(() => {
    const overlayElement = overlayVideoRef.current;
    if (!overlayElement || !activeOverlay || isDragging) return;

    if (overlayElement.readyState < 2) {
      return;
    }

    const expectedOverlayTime = playbackTime - activeOverlay.startTime;
    if (
      expectedOverlayTime >= 0 &&
      expectedOverlayTime <= activeOverlay.duration &&
      Math.abs(overlayElement.currentTime - expectedOverlayTime) > 0.2
    ) {
      overlayElement.currentTime = Math.max(0, expectedOverlayTime);
    }
  }, [playbackTime, activeOverlay, isDragging]);

  // Audio management is now handled by useAudioController hook

  // Keep lastPlaybackTimeRef updated when playbackTime changes from external source
  useEffect(() => {
    // Update the ref to track the current playback time
    // This ensures the ref is always in sync with the prop
    lastPlaybackTimeRef.current = playbackTime;
  }, [playbackTime]);

  // Auto-advance is handled by playback controller
  // When playbackTime advances, controller automatically determines which item should be active
  // No manual auto-advance logic needed

  // Handle video download
  const handleDownloadVideo = useCallback(async () => {
    if (!projectDirectory || timelineItems.length === 0 || isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      console.log('[VideoDownload] Starting video download process...');
      console.log('[VideoDownload] Timeline items:', timelineItems.length);
      console.log('[VideoDownload] Project directory:', projectDirectory);

      // Extract audio path before filtering out audio items
      const audioItems = timelineItems.filter((item) => item.type === 'audio');
      let resolvedAudioPath: string | null = null;

      if (audioItems.length > 0 && audioItems[0]?.audioPath) {
        try {
          // Step 1: Resolve for display (returns file:// URL)
          const displayPath = await resolveAssetPathForDisplay(
            audioItems[0].audioPath,
            projectDirectory,
          );

          // Step 2: Normalize for export (strips file://)
          resolvedAudioPath = normalizePathForExport(displayPath);

          console.log('[VideoDownload] Audio path resolution:', {
            original: audioItems[0].audioPath,
            display: displayPath,
            normalized: resolvedAudioPath,
          });
        } catch (error) {
          console.warn('[VideoDownload] Failed to resolve audio path:', error);
        }
      } else {
        console.log('[VideoDownload] No audio items found in timeline');
      }

      // Prepare timeline items data with resolved paths
      // Filter out audio items as they're not part of video composition
      console.log('[VideoDownload] Resolving asset paths...');
      const itemsDataWithPaths = await Promise.all(
        timelineItems
          .filter((item) => item.type !== 'audio') // Exclude audio items
          .map(async (item, index) => {
            let resolvedPath = '';
            if (
              (item.type === 'video' || item.type === 'infographic') &&
              item.videoPath
            ) {
              resolvedPath = await resolveAssetPathForDisplay(
                item.videoPath,
                projectDirectory,
              );
              console.log(
                `[VideoDownload] Resolved ${item.type} ${index + 1}: ${item.videoPath} -> ${resolvedPath}`,
              );
            } else if (item.type === 'image' && item.imagePath) {
              resolvedPath = await resolveAssetPathForDisplay(
                item.imagePath,
                projectDirectory,
              );
              console.log(
                `[VideoDownload] Resolved image ${index + 1}: ${item.imagePath} -> ${resolvedPath}`,
              );
            }

            const finalPath =
              resolvedPath || item.videoPath || item.imagePath || '';
            const exportType =
              item.type === 'infographic' ? 'video' : item.type;
            return {
              type: exportType as 'video' | 'image' | 'placeholder',
              path: finalPath,
              duration: item.duration,
              startTime: item.startTime,
              endTime: item.endTime,
              sourceOffsetSeconds:
                exportType === 'video' ? item.sourceOffsetSeconds ?? 0 : 0,
              originalIndex: index,
              label: item.label,
            };
          }),
      );

      // Filter out items with empty paths and log warnings
      const skippedItems: Array<{
        index: number;
        type: string;
        label?: string;
      }> = [];
      const itemsData = itemsDataWithPaths.filter((item, index) => {
        const hasValidPath = item.path && item.path.trim() !== '';
        if (!hasValidPath) {
          skippedItems.push({
            index: item.originalIndex + 1,
            type: item.type,
            label: item.label,
          });
          console.warn(
            `[VideoDownload] Skipping timeline item ${item.originalIndex + 1} (${item.type}): no file path`,
            {
              type: item.type,
              label: item.label,
            },
          );
        }
        return hasValidPath;
      });

      if (skippedItems.length > 0) {
        console.warn(
          `[VideoDownload] Skipped ${skippedItems.length} timeline item(s) with missing paths:`,
          skippedItems,
        );
      }

      if (itemsData.length === 0) {
        console.error('[VideoDownload] No valid timeline items to compose');
        alert(
          'No valid timeline items found. Please ensure at least one timeline item has a valid video or image path.',
        );
        setIsDownloading(false);
        return;
      }

      console.log(
        `[VideoDownload] Starting video composition with ${itemsData.length} valid item(s) (${skippedItems.length} skipped)...`,
      );
      console.log(
        '[VideoDownload] Items data:',
        itemsData.map((item, i) => ({
          index: i + 1,
          type: item.type,
          path: `${item.path.substring(0, 80)}...`,
          duration: item.duration,
        })),
      );

      // Compose the video with audio track
      // Type assertion needed due to TypeScript language server cache issue
      const composeVideo = window.electron.project.composeTimelineVideo as (
        timelineItems: Array<{
          type: 'image' | 'video' | 'placeholder';
          path: string;
          duration: number;
          startTime: number;
          endTime: number;
          sourceOffsetSeconds?: number;
        }>,
        projectDirectory: string,
        audioPath?: string,
        overlayItems?: Array<{
          path: string;
          duration: number;
          startTime: number;
          endTime: number;
        }>,
        textOverlayCues?: TextOverlayCue[],
      ) => Promise<{ success: boolean; outputPath?: string; error?: string }>;

      const overlayItemsWithPaths = await Promise.all(
        overlayItems.map(async (item, index) => {
          let resolvedPath = '';
          if (item.videoPath) {
            resolvedPath = await resolveAssetPathForDisplay(
              item.videoPath,
              projectDirectory,
            );
            console.log(
              `[VideoDownload] Resolved overlay ${index + 1}: ${item.videoPath} -> ${resolvedPath}`,
            );
          }

          return {
            path: resolvedPath || item.videoPath || '',
            duration: item.duration,
            startTime: item.startTime,
            endTime: item.endTime,
            originalIndex: index,
            label: item.label,
          };
        }),
      );

      const skippedOverlayItems: Array<{
        index: number;
        label?: string;
      }> = [];
      const overlayItemsData = overlayItemsWithPaths.filter((item) => {
        const hasValidPath = item.path && item.path.trim() !== '';
        if (!hasValidPath) {
          skippedOverlayItems.push({
            index: item.originalIndex + 1,
            label: item.label,
          });
          console.warn(
            `[VideoDownload] Skipping overlay item ${item.originalIndex + 1}: no file path`,
            { label: item.label },
          );
        }
        return hasValidPath;
      });

      if (skippedOverlayItems.length > 0) {
        console.warn(
          `[VideoDownload] Skipped ${skippedOverlayItems.length} overlay item(s) with missing paths:`,
          skippedOverlayItems,
        );
      }

      const result = await composeVideo(
        itemsData,
        projectDirectory,
        resolvedAudioPath || undefined, // Pass audio path if available
        overlayItemsData,
        textOverlayCues,
      );

      console.log('[VideoDownload] Composition result:', result);

      if (!result.success) {
        console.error('[VideoDownload] Composition failed:', result.error);
        alert(`Failed to compose video: ${result.error || 'Unknown error'}`);
        return;
      }

      if (!result.outputPath) {
        console.error('[VideoDownload] No output path returned');
        alert('Video composition completed but no output path was returned');
        return;
      }

      console.log(
        '[VideoDownload] Composition successful. Output:',
        result.outputPath,
      );
      console.log('[VideoDownload] Opening save dialog...');

      // Open save dialog
      const savePath = await window.electron.project.saveVideoFile();
      if (!savePath) {
        console.log('[VideoDownload] User cancelled save dialog');
        // User cancelled
        return;
      }

      console.log('[VideoDownload] Save path selected:', savePath);

      // Extract directory and filename from savePath
      const lastSlash = savePath.lastIndexOf('/');
      const saveDir = lastSlash >= 0 ? savePath.substring(0, lastSlash) : '';
      const saveFileName =
        lastSlash >= 0 ? savePath.substring(lastSlash + 1) : savePath;

      console.log('[VideoDownload] Copying video to:', saveDir);
      console.log('[VideoDownload] Target filename:', saveFileName);

      // Copy the composed video to the destination directory
      const copiedPath = await window.electron.project.copy(
        result.outputPath,
        saveDir,
      );

      console.log('[VideoDownload] Video copied to:', copiedPath);

      // Rename to the user's chosen filename if different
      const finalPath = savePath;
      if (copiedPath !== finalPath) {
        console.log('[VideoDownload] Renaming to:', saveFileName);
        await window.electron.project.rename(copiedPath, saveFileName);
      }

      console.log('[VideoDownload] Video download completed successfully!');
      alert('Video downloaded successfully!');
    } catch (error) {
      console.error('Error downloading video:', error);
      alert(
        `Failed to download video: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      setIsDownloading(false);
    }
  }, [
    projectDirectory,
    timelineItems,
    overlayItems,
    textOverlayCues,
    isDownloading,
  ]);

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  // Helper: resolve timeline items + overlays for export (shared by all export handlers)
  const resolveExportData = useCallback(async () => {
    if (!projectDirectory || timelineItems.length === 0) return null;

    // Extract audio path
    const audioItems = timelineItems.filter((item) => item.type === 'audio');
    let resolvedAudioPath: string | null = null;
    if (audioItems.length > 0 && audioItems[0]?.audioPath) {
      try {
        const displayPath = await resolveAssetPathForDisplay(
          audioItems[0].audioPath,
          projectDirectory,
        );
        resolvedAudioPath = normalizePathForExport(displayPath);
      } catch (error) {
        console.warn('[Export] Failed to resolve audio path:', error);
      }
    }

    // Resolve main timeline items
    const itemsDataWithPaths = await Promise.all(
      timelineItems
        .filter((item) => item.type !== 'audio')
        .map(async (item) => {
          let resolvedPath = '';
          if (
            (item.type === 'video' || item.type === 'infographic') &&
            item.videoPath
          ) {
            resolvedPath = await resolveAssetPathForDisplay(
              item.videoPath,
              projectDirectory,
            );
          } else if (item.type === 'image' && item.imagePath) {
            resolvedPath = await resolveAssetPathForDisplay(
              item.imagePath,
              projectDirectory,
            );
          }
          const finalPath =
            resolvedPath || item.videoPath || item.imagePath || '';
          const exportType =
            item.type === 'infographic' ? 'video' : item.type;
          return {
            type: exportType as 'video' | 'image' | 'placeholder',
            path: finalPath,
            duration: item.duration,
            startTime: item.startTime,
            endTime: item.endTime,
            sourceOffsetSeconds:
              exportType === 'video' ? item.sourceOffsetSeconds ?? 0 : 0,
            label: item.label,
          };
        }),
    );
    const itemsData = itemsDataWithPaths.filter(
      (item) => item.path && item.path.trim() !== '',
    );

    // Resolve overlays
    const overlayItemsWithPaths = await Promise.all(
      overlayItems.map(async (item) => {
        let resolvedPath = '';
        if (item.videoPath) {
          resolvedPath = await resolveAssetPathForDisplay(
            item.videoPath,
            projectDirectory,
          );
        }
        return {
          path: resolvedPath || item.videoPath || '',
          duration: item.duration,
          startTime: item.startTime,
          endTime: item.endTime,
          label: item.label,
        };
      }),
    );
    const overlayItemsData = overlayItemsWithPaths.filter(
      (item) => item.path && item.path.trim() !== '',
    );

    console.log(
      `[Export] Resolved ${overlayItemsData.length}/${overlayItems.length} overlay items`,
      overlayItemsData.map((o, i) => ({
        index: i,
        label: o.label,
        path: o.path ? `${o.path.substring(0, 60)}...` : '(empty)',
        start: o.startTime,
        duration: o.duration,
      })),
    );

    return {
      itemsData,
      resolvedAudioPath,
      overlayItemsData,
      textOverlayCues,
    };
  }, [projectDirectory, timelineItems, overlayItems, textOverlayCues]);

  // Handle CapCut export
  const handleExportCapcut = useCallback(async () => {
    if (!projectDirectory || timelineItems.length === 0 || isExporting) return;
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      console.log('[Export:CapCut] Starting CapCut export...');
      const data = await resolveExportData();
      if (!data || data.itemsData.length === 0) {
        alert('No valid timeline items found for export.');
        return;
      }
      console.log(
        `[Export:CapCut] Data: ${data.itemsData.length} timeline items, ${data.overlayItemsData.length} overlays, ${data.textOverlayCues?.length ?? 0} captions`,
      );

      const exportFn = window.electron.project.exportCapcut as (
        timelineItems: Array<{
          type: 'image' | 'video' | 'placeholder';
          path: string;
          duration: number;
          startTime: number;
          endTime: number;
          sourceOffsetSeconds?: number;
          label?: string;
        }>,
        projectDirectory: string,
        audioPath?: string,
        overlayItems?: Array<{
          path: string;
          duration: number;
          startTime: number;
          endTime: number;
          label?: string;
        }>,
        textOverlayCues?: TextOverlayCue[],
      ) => Promise<{ success: boolean; outputPath?: string; error?: string }>;

      const result = await exportFn(
        data.itemsData,
        projectDirectory,
        data.resolvedAudioPath || undefined,
        data.overlayItemsData,
        data.textOverlayCues || undefined,
      );

      if (result.error === 'cancelled') return;
      if (!result.success) {
        alert(`Failed to export CapCut project: ${result.error || 'Unknown error'}`);
        return;
      }
      alert('CapCut project exported successfully! You can now open it in CapCut.');
    } catch (error) {
      console.error('[Export:CapCut] Error:', error);
      alert(
        `Failed to export CapCut project: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      setIsExporting(false);
    }
  }, [projectDirectory, timelineItems, isExporting, resolveExportData]);

  // Show empty state if no project
  if (!projectDirectory) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Film size={48} className={styles.emptyIcon} />
          <h3>No Project Open</h3>
          <p>Open a project to view the video library</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading video library...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Film size={16} />
          <h3>Video Library</h3>
          <span className={styles.count}>{videoArtifacts.length}</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.exportDropdownWrapper} ref={exportMenuRef}>
            <button
              type="button"
              className={styles.downloadButton}
              onClick={handleDownloadVideo}
              disabled={isDownloading || isExporting || timelineItems.length === 0}
              title="Download complete timeline video as MP4"
            >
              <Download size={16} />
              {isDownloading ? 'Composing...' : isExporting ? 'Exporting...' : 'Download'}
            </button>
            <button
              type="button"
              className={styles.exportDropdownToggle}
              onClick={() => setShowExportMenu((prev) => !prev)}
              disabled={isDownloading || isExporting || timelineItems.length === 0}
              title="Export options"
            >
              <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className={styles.exportDropdownMenu}>
                <button
                  type="button"
                  className={styles.exportDropdownItem}
                  onClick={handleDownloadVideo}
                  disabled={isDownloading || isExporting}
                >
                  <Download size={14} />
                  Export as MP4
                </button>
                <button
                  type="button"
                  className={styles.exportDropdownItem}
                  onClick={handleExportCapcut}
                  disabled={isDownloading || isExporting}
                >
                  <Download size={14} />
                  Export as CapCut Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* Left Sidebar - Video Grid */}
        <div className={styles.sidebar}>
          {videoArtifacts.length === 0 ? (
            <div className={styles.emptyState}>
              <Film size={32} className={styles.emptyIcon} />
              <p>No videos available</p>
              <p className={styles.emptySubtext}>
                Videos will appear here once they are generated or imported
              </p>
            </div>
          ) : (
            <div className={styles.videoGrid}>
              {videoArtifacts.map((artifact) => (
                <VideoCard
                  key={artifact.artifact_id}
                  artifact={artifact}
                  formatDate={formatDate}
                  projectDirectory={projectDirectory || null}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Side - Timeline Preview */}
        <div className={styles.playerSection}>
          {timelineItems.length > 0 ? (
            <div className={styles.videoPlayer}>
              <video
                ref={videoRef}
                className={`${styles.playerVideo} ${
                  shouldShowVideo ? '' : styles.videoHidden
                }`}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnd}
                onError={(e) => {
                  if (!currentVideo) return;
                  const video = e.currentTarget;
                  const { error } = video;
                  if (error) {
                    console.error(`[VideoLibraryView] Video element error:`, {
                      code: error.code,
                      message: error.message,
                      path: currentVideoPath,
                      label: currentVideo.label,
                    });
                    // Try fallback: use videoPath directly if versionPath failed
                    if (
                      currentVideo.videoPath &&
                      currentVideoPath !== currentVideo.videoPath
                    ) {
                      console.log(
                        '[VideoLibraryView] Video load error, will try fallback path:',
                        currentVideo.videoPath,
                      );
                    }
                  }
                }}
                preload="auto"
                playsInline
                muted
              />

              {!shouldShowVideo && shouldShowLoadingVideo && (
                <div className={styles.videoPlaceholder}>
                  <Film size={48} className={styles.videoPlaceholderIcon} />
                  <p>Loading video...</p>
                  <p className={styles.videoPlaceholderSubtext}>
                    {currentVideo?.label}
                  </p>
                </div>
              )}

              {!shouldShowVideo && !shouldShowLoadingVideo && (
                <div
                  className={`${styles.scenePlaceholder} ${
                    resolvedSceneImagePath ? styles.hasBackgroundImage : ''
                  }`}
                  style={
                    resolvedSceneImagePath
                      ? {
                          backgroundImage: `url(${resolvedSceneImagePath})`,
                        }
                      : undefined
                  }
                >
                  {currentItem &&
                    (currentItem.type === 'image' ||
                      currentItem.type === 'placeholder') &&
                    !resolvedSceneImagePath && (
                      <div className={styles.scenePlaceholderContent}>
                        <Film size={64} className={styles.scenePlaceholderIcon} />
                        <h3>{currentItem.label}</h3>
                      </div>
                    )}
                </div>
              )}

              {!shouldShowVideo && activeOverlay && resolvedOverlayPath && (
                <video
                  ref={overlayVideoRef}
                  className={styles.overlayVideo}
                  preload="auto"
                  playsInline
                  muted
                  aria-hidden
                />
              )}

              {currentVideo && (
                <div className={styles.currentVideoLabel}>{currentVideo.label}</div>
              )}
              {activeTextCue && (
                <div className={styles.wordCaptionOverlay}>
                  <div className={styles.wordCaptionText}>
                    {renderCaptionCue(activeTextCue, activeWordIndex)}
                  </div>
                </div>
              )}
              <div className={styles.playerControls}>
                <button
                  type="button"
                  className={styles.playPauseButton}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <div className={styles.timeDisplay}>
                  {formatTime(playbackTime)} / {formatTime(totalDuration)}
                </div>
                <input
                  type="range"
                  min="0"
                  max={totalDuration || 0}
                  value={playbackTime}
                  onChange={handleSeekBarChange}
                  className={styles.seekBar}
                />
              </div>
            </div>
          ) : null}

          {/* Placement info panel - show when currentItem exists and NOT playing video */}
          {currentItem && (!currentVideo || currentItem.type !== 'video') ? (
            <div className={styles.sceneInfoPanelCompact}>
              {currentItem.type === 'placeholder' ? (
                <div className={styles.sceneMetadataCompact}>
                  <span className={styles.sceneTitleCompact}>
                    {currentItem.label}
                  </span>
                  <span className={styles.sceneMetaCompact}>
                    {currentItem.startTime.toFixed(1)}s -{' '}
                    {currentItem.endTime.toFixed(1)}s
                  </span>
                </div>
              ) : (
                <div className={styles.sceneMetadataCompact}>
                  <span className={styles.sceneTitleCompact}>
                    {currentItem.label}
                    {currentItem.placementNumber && (
                      <span className={styles.sceneName}>
                        {' '}
                        (Placement {currentItem.placementNumber})
                      </span>
                    )}
                  </span>
                  <span className={styles.sceneMetaCompact}>
                    {currentItem.startTime.toFixed(1)}s -{' '}
                    {currentItem.endTime.toFixed(1)}s
                  </span>
                </div>
              )}
            </div>
          ) : timelineItems.length === 0 ? (
            /* Empty state - only show if no scene and no items in timeline */
            <div className={styles.emptyPlayer}>
              <Film size={48} className={styles.emptyPlayerIcon} />
              <p>No items in timeline</p>
              <p className={styles.emptySubtext}>
                Add videos or scenes to the timeline to preview them here
              </p>
            </div>
          ) : null}

          {/* Hidden audio element for playback - managed by useAudioController */}
          {/* Always render with stable key to prevent React from recreating it */}
          <audio
            ref={audioRef}
            key="timeline-audio"
            preload="auto"
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
