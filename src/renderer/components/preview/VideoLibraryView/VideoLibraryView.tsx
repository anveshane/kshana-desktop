import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Film, Play, Calendar, Pause } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { useTimelineData } from '../../../hooks/useTimelineData';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import type { Artifact } from '../../../types/projectState';
import type { SceneRef } from '../../../types/kshana/entities';
import type { SceneVersions } from '../../../types/kshana/timeline';
import styles from './VideoLibraryView.module.scss';

// Video Card Component
interface VideoCardProps {
  artifact: Artifact;
  formatDate: (dateString: string) => string;
  projectDirectory: string | null;
}

function VideoCard({
  artifact,
  formatDate,
  projectDirectory,
}: VideoCardProps) {
  const [videoPath, setVideoPath] = useState<string>('');

  useEffect(() => {
    resolveAssetPathForDisplay(
      artifact.file_path,
      projectDirectory,
    ).then((resolved) => {
      setVideoPath(resolved);
    });
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
  activeVersions?: Record<number, SceneVersions>; // sceneNumber -> { image?: number, video?: number }
  projectScenes?: SceneRef[];
}

export default function VideoLibraryView({
  playbackTime,
  isPlaying,
  isDragging = false,
  onPlaybackTimeChange,
  onPlaybackStateChange,
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

  // Use unified timeline data hook (placement-based)
  const { timelineItems, totalDuration } = useTimelineData(activeVersions);
  
  // Get video artifacts from asset manifest for the sidebar
  const videoArtifacts = useMemo(() => {
    if (!assetManifest?.assets) return [];
    return assetManifest.assets
      .filter((asset) => asset.type === 'scene_video' || asset.type === 'final_video')
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
            title: asset.path.split('/').pop(),
            duration: asset.metadata?.duration,
            imported: asset.metadata?.imported,
          },
        };
      });
  }, [assetManifest]);

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentVideoPathRef = useRef<string | null>(null);
  const isSeekingRef = useRef(false);

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

  // Get current item from timeline (placement-based: image, video, or placeholder)
  const currentItem = timelineItems[currentItemIndex] || null;
  const currentVideo = currentItem?.type === 'video' ? currentItem : null;
  const currentImage = currentItem?.type === 'image' ? currentItem : null;

  // Resolve image path from current timeline item (placement-based)
  const sceneImagePath = useMemo(() => {
    if (!currentImage || !assetManifest?.assets) return null;

    const placementNumber = currentImage.placementNumber;
    if (placementNumber === undefined) return null;

    const activeImageVersion = activeVersions[placementNumber]?.image;

    // Find image asset matching placement number and version
    if (activeImageVersion !== undefined) {
      const imageAsset = assetManifest.assets.find(
        (asset) =>
          asset.type === 'scene_image' &&
          (asset.metadata?.placementNumber === placementNumber ||
            asset.scene_number === placementNumber) &&
          asset.version === activeImageVersion,
      );
      if (imageAsset) {
        return imageAsset.path;
      }
    }

    // Fallback: find latest image asset for this placement
    const imageAssets = assetManifest.assets.filter(
      (asset) =>
        asset.type === 'scene_image' &&
        (asset.metadata?.placementNumber === placementNumber ||
          asset.scene_number === placementNumber),
    );
    if (imageAssets.length > 0) {
      // Sort by version descending to get latest
      const sorted = imageAssets.sort((a, b) => b.version - a.version);
      return sorted[0]?.path || null;
    }

    // Use imagePath from timeline item if available
    return currentImage.imagePath || null;
  }, [currentImage, activeVersions, assetManifest]);

  // Resolve and store the display-ready image path
  const [resolvedSceneImagePath, setResolvedSceneImagePath] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!sceneImagePath || !projectDirectory) {
      setResolvedSceneImagePath(null);
      return;
    }

    resolveAssetPathForDisplay(sceneImagePath, projectDirectory)
      .then((resolved) => {
        setResolvedSceneImagePath(resolved);
      })
      .catch(() => {
        setResolvedSceneImagePath(null);
      });
  }, [sceneImagePath, projectDirectory]);

  // Handle video play/pause
  const handlePlayPause = useCallback(() => {
    onPlaybackStateChange(!isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  // Handle video time update - sync with timeline position
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (!currentVideo || isSeekingRef.current || isDragging) return;
      const videoTime = e.currentTarget.currentTime;
      const timelineTime = currentVideo.startTime + videoTime;
      onPlaybackTimeChange(timelineTime);
    },
    [currentVideo, onPlaybackTimeChange, isDragging],
  );

  // Handle video end - move to next item
  const handleVideoEnd = useCallback(() => {
    if (isDragging) return; // Don't auto-advance during dragging

    if (currentItemIndex < timelineItems.length - 1) {
      const nextIndex = currentItemIndex + 1;
      setCurrentItemIndex(nextIndex);
      onPlaybackTimeChange(timelineItems[nextIndex].startTime);
      // Video will auto-play when source changes if was playing (only if next item is video)
    } else {
      onPlaybackStateChange(false);
      setCurrentItemIndex(0);
      onPlaybackTimeChange(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }
  }, [
    currentItemIndex,
    timelineItems,
    onPlaybackTimeChange,
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
        onPlaybackTimeChange(seekTime);
        // Still seek within current video if possible
        if (videoRef.current && currentVideo) {
          const videoTime = seekTime - currentVideo.startTime;
          if (videoTime >= 0 && videoTime <= currentVideo.duration) {
            videoRef.current.currentTime = videoTime;
          }
        }
        setTimeout(() => {
          isSeekingRef.current = false;
        }, 50);
        return;
      }

      // Normal seek (not dragging) - allow item switching
      // Find which item contains this time
      const itemIndex = timelineItems.findIndex(
        (item) =>
          seekTime >= item.startTime &&
          seekTime < item.endTime,
      );

      if (itemIndex >= 0) {
        const item = timelineItems[itemIndex];
        onPlaybackTimeChange(seekTime);

        if (itemIndex !== currentItemIndex) {
          setCurrentItemIndex(itemIndex);
          // Video source will change if item is video, and play state will be handled by useEffect
        } else if (videoRef.current && item.type === 'video') {
          // Same video item, just seek within it
          const videoTime = seekTime - item.startTime;
          videoRef.current.currentTime = videoTime;
        }
      } else if (seekTime >= totalDuration) {
        // Seeked past end - go to last item
        const lastIndex = timelineItems.length - 1;
        if (lastIndex >= 0) {
          const lastItem = timelineItems[lastIndex];
          setCurrentItemIndex(lastIndex);
          onPlaybackTimeChange(lastItem.endTime);
          if (videoRef.current && lastItem.type === 'video') {
            videoRef.current.currentTime = lastItem.duration;
          }
        }
      }

      // Clear seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    },
    [
      timelineItems,
      currentItemIndex,
      totalDuration,
      onPlaybackTimeChange,
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

  // Construct version-specific path if active version is set (placement-based)
  const versionPath = useMemo(() => {
    if (!currentVideo) return null;
    
    const placementNumber = currentVideo.placementNumber;
    if (placementNumber === undefined) {
      const path = currentVideo.videoPath || null;
      if (!path) {
        console.warn(`[VideoLibraryView] No videoPath for video: ${currentVideo.label}`);
      }
      return path;
    }

    const activeVideoVersion = activeVersions[placementNumber]?.video;
    if (activeVideoVersion !== undefined && assetManifest?.assets) {
      // Find video asset matching placement number and version
      const videoAsset = assetManifest.assets.find(
        (asset) =>
          asset.type === 'scene_video' &&
          (asset.metadata?.placementNumber === placementNumber ||
            asset.scene_number === placementNumber) &&
          asset.version === activeVideoVersion,
      );
      if (videoAsset) {
        return videoAsset.path;
      }
      console.warn(
        `[VideoLibraryView] Video asset not found for placement ${placementNumber}, version ${activeVideoVersion}`,
      );
    }

    // Fallback: use videoPath from timeline item
    const fallbackPath = currentVideo.videoPath || null;
    if (!fallbackPath) {
      console.warn(
        `[VideoLibraryView] No videoPath found for placement ${placementNumber} (${currentVideo.label})`,
      );
    }
    return fallbackPath;
  }, [
    currentVideo,
    activeVersions,
    assetManifest,
  ]);

  // Resolve video path when current video or version changes
  useEffect(() => {
    if (!versionPath) {
      setCurrentVideoPath('');
      return;
    }

    resolveAssetPathForDisplay(
      versionPath,
      projectDirectory || null,
    )
      .then((resolved) => {
        if (resolved && resolved.trim()) {
          setCurrentVideoPath(resolved);
        } else {
          console.warn(`[VideoLibraryView] Empty resolved path for: ${versionPath}`);
          setCurrentVideoPath('');
        }
      })
      .catch((error) => {
        console.error(`[VideoLibraryView] Failed to resolve video path: ${versionPath}`, error);
        setCurrentVideoPath('');
      });
  }, [versionPath, projectDirectory]);

  // Update video source when current video changes
  // Don't switch videos during dragging - wait until drag ends
  useEffect(() => {
    if (!currentVideo || !videoRef.current || isDragging) {
      return;
    }

    const videoElement = videoRef.current;

    // If path is empty, clear the video source
    if (!currentVideoPath || !currentVideoPath.trim()) {
      if (videoElement.src) {
        videoElement.pause();
        videoElement.src = '';
        videoElement.load();
        currentVideoPathRef.current = null;
      }
      return;
    }

    // Only update if source actually changed to prevent flickering
    if (currentVideoPathRef.current !== currentVideoPath) {
      const wasPlaying = !videoElement.paused;
      currentVideoPathRef.current = currentVideoPath;

      // Pause current video before changing source
      videoElement.pause();

      // Clear previous error handlers
      const handleError = (e: Event) => {
        const error = videoElement.error;
        if (error) {
          console.error(`[VideoLibraryView] Video error for ${currentVideo.label}:`, {
            code: error.code,
            message: error.message,
            path: currentVideoPath,
          });
        }
      };

      const handleCanPlay = () => {
        if (wasPlaying || isPlaying) {
          videoElement.play().catch((playError) => {
            console.warn(`[VideoLibraryView] Play error for ${currentVideo.label}:`, playError);
          });
        }
        videoElement.removeEventListener('canplay', handleCanPlay);
      };

      const handleLoadedData = () => {
        // Video is loaded, safe to play if needed
        if (wasPlaying || isPlaying) {
          videoElement.play().catch((playError) => {
            console.warn(`[VideoLibraryView] Play error for ${currentVideo.label}:`, playError);
          });
        }
        videoElement.removeEventListener('loadeddata', handleLoadedData);
      };

      const handleLoadStart = () => {
        console.log(`[VideoLibraryView] Loading video: ${currentVideo.label} from ${currentVideoPath}`);
      };

      // Add error handler
      videoElement.addEventListener('error', handleError);
      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('loadeddata', handleLoadedData);
      videoElement.addEventListener('loadstart', handleLoadStart);

      // Set new source
      videoElement.src = currentVideoPath;
      videoElement.currentTime = 0;
      videoElement.load();

      return () => {
        videoElement.removeEventListener('error', handleError);
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('loadeddata', handleLoadedData);
        videoElement.removeEventListener('loadstart', handleLoadStart);
      };
    }
  }, [currentVideo, currentVideoPath, isPlaying, isDragging]);

  // Update current item index based on playbackTime - works for both videos and scenes
  // This ensures scenes without videos are also tracked during playback
  // Runs continuously during playback, and when dragging/seeking ends
  useEffect(() => {
    if (timelineItems.length === 0) return;

    // During dragging or seeking, we handle it differently
    if (isDragging || isSeekingRef.current) {
      return;
    }

    // Find which item contains the current playback time
    const itemIndex = timelineItems.findIndex(
      (item) =>
        playbackTime >= item.startTime &&
        playbackTime < item.endTime,
    );

    if (itemIndex >= 0 && itemIndex !== currentItemIndex) {
      // Switch to the correct item (scene or video)
      setCurrentItemIndex(itemIndex);
      const item = timelineItems[itemIndex];
      // If item is video, seek to the right position
      if (item.type === 'video' && videoRef.current) {
        const videoTime = playbackTime - item.startTime;
        // Video source will update via useEffect, then we'll seek to the right position
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoTime);
          }
        }, 100);
      }
    } else if (itemIndex < 0 && playbackTime >= totalDuration) {
      // Past end - go to last item
      const lastIndex = timelineItems.length - 1;
      if (lastIndex >= 0 && lastIndex !== currentItemIndex) {
        setCurrentItemIndex(lastIndex);
      }
    }
  }, [
    playbackTime,
    timelineItems,
    currentItemIndex,
    totalDuration,
    isDragging,
  ]);

  // Initialize to first item when timeline loads
  useEffect(() => {
    if (timelineItems.length > 0 && currentItemIndex >= timelineItems.length) {
      setCurrentItemIndex(0);
      onPlaybackTimeChange(0);
    } else if (timelineItems.length > 0 && currentItemIndex < 0) {
      setCurrentItemIndex(0);
      onPlaybackTimeChange(0);
    }
  }, [timelineItems.length, currentItemIndex, onPlaybackTimeChange]);

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
  }, [onPlaybackStateChange]);

  // Sync video playback with shared state
  useEffect(() => {
    if (!videoRef.current || !currentVideo || isDragging) return;

    const videoElement = videoRef.current;

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
      isDragging
    ) {
      return;
    }

    const videoElement = videoRef.current;
    const expectedVideoTime = playbackTime - currentVideo.startTime;

    // Only update if there's a significant difference to avoid jitter
    if (Math.abs(videoElement.currentTime - expectedVideoTime) > 0.2) {
      videoElement.currentTime = Math.max(0, expectedVideoTime);
    }
  }, [playbackTime, currentVideo, isDragging]);

  // Handle auto-advance for non-video items (images, placeholders)
  // When playing a non-video item, check if we've reached the end of the item
  useEffect(() => {
    if (!isPlaying || isDragging || isSeekingRef.current) return;
    if (!currentItem || currentItem.type === 'video') return; // Only handle non-video items

    const itemEndTime = currentItem.endTime;
    // If playbackTime has reached or passed the end of the current item, move to next item
    if (
      playbackTime >= itemEndTime &&
      currentItemIndex < timelineItems.length - 1
    ) {
      const nextIndex = currentItemIndex + 1;
      setCurrentItemIndex(nextIndex);
      onPlaybackTimeChange(timelineItems[nextIndex]!.startTime);
    } else if (playbackTime >= totalDuration) {
      // Reached end of timeline
      onPlaybackStateChange(false);
      setCurrentItemIndex(0);
      onPlaybackTimeChange(0);
    }
  }, [
    isPlaying,
    playbackTime,
    currentItem,
    currentItemIndex,
    timelineItems,
    totalDuration,
    isDragging,
    onPlaybackTimeChange,
    onPlaybackStateChange,
  ]);

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
          {/* Video player - only show if currentVideo exists */}
          {currentVideo ? (
            <div className={styles.videoPlayer}>
              {currentVideoPath ? (
                <video
                  ref={videoRef}
                  className={styles.playerVideo}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnd}
                  onError={(e) => {
                    const video = e.currentTarget;
                    const error = video.error;
                    if (error) {
                      console.error(`[VideoLibraryView] Video element error:`, {
                        code: error.code,
                        message: error.message,
                        path: currentVideoPath,
                        label: currentVideo.label,
                      });
                    }
                  }}
                  preload="auto"
                  playsInline
                />
              ) : (
                <div className={styles.videoPlaceholder}>
                  <Film size={48} className={styles.videoPlaceholderIcon} />
                  <p>Loading video...</p>
                  <p className={styles.videoPlaceholderSubtext}>{currentVideo.label}</p>
                </div>
              )}
              <div className={styles.currentVideoLabel}>
                {currentVideo.label}
                {(currentVideo.artifact?.metadata?.imported as boolean) && (
                  <span className={styles.importedBadge}> (Imported)</span>
                )}
              </div>
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
          ) : timelineItems.length > 0 ? (
            /* Show controls even when no video - for image/placeholder playback */
            <div className={styles.videoPlayer}>
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
                {currentItem && (currentItem.type === 'image' || currentItem.type === 'placeholder') && !resolvedSceneImagePath && (
                  <div className={styles.scenePlaceholderContent}>
                    <Film size={64} className={styles.scenePlaceholderIcon} />
                    <h3>{currentItem.label}</h3>
                  </div>
                )}
              </div>
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
                  <span className={styles.sceneTitleCompact}>{currentItem.label}</span>
                  <span className={styles.sceneMetaCompact}>
                    {currentItem.startTime.toFixed(1)}s - {currentItem.endTime.toFixed(1)}s
                  </span>
                </div>
              ) : (
                <div className={styles.sceneMetadataCompact}>
                  <span className={styles.sceneTitleCompact}>
                    {currentItem.label}
                    {currentItem.placementNumber && (
                      <span className={styles.sceneName}>
                        {' '}(Placement {currentItem.placementNumber})
                      </span>
                    )}
                  </span>
                  <span className={styles.sceneMetaCompact}>
                    {currentItem.startTime.toFixed(1)}s - {currentItem.endTime.toFixed(1)}s
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
        </div>
      </div>
    </div>
  );
}
