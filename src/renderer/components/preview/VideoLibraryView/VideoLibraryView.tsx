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
import styles from './VideoLibraryView.module.scss';

// Video Card Component
interface VideoCardProps {
  artifact: Artifact;
  formatDate: (dateString: string) => string;
  projectDirectory: string | null;
  useMockData: boolean;
}

function VideoCard({
  artifact,
  formatDate,
  projectDirectory,
  useMockData,
}: VideoCardProps) {
  const [videoPath, setVideoPath] = useState<string>('');

  useEffect(() => {
    resolveAssetPathForDisplay(
      artifact.file_path,
      projectDirectory,
      useMockData,
    ).then((resolved) => {
      setVideoPath(resolved);
    });
  }, [artifact.file_path, projectDirectory, useMockData]);

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
          <div className={styles.sceneBadge}>
            Scene {artifact.scene_number}
          </div>
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
}

export default function VideoLibraryView({
  playbackTime,
  isPlaying,
  isDragging = false,
  onPlaybackTimeChange,
  onPlaybackStateChange,
}: VideoLibraryViewProps) {
  const { projectDirectory } = useWorkspace();
  const { isLoading, useMockData } = useProject();
  
  // Use unified timeline data hook
  const {
    scenes,
    timelineItems,
    videoArtifacts,
    totalDuration,
  } = useTimelineData();

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

  // Get current item from timeline (can be video or scene)
  const currentItem = timelineItems[currentItemIndex] || null;
  const currentVideo = currentItem?.type === 'video' ? currentItem : null;

  // Calculate current scene from currentItem or playbackTime
  // Prefer scene from currentItem if it exists, otherwise calculate from playbackTime
  const currentScene = useMemo(() => {
    // If current item has a scene, use that
    if (currentItem?.scene) {
      return currentItem.scene;
    }

    // Otherwise, calculate scene from playbackTime (for scenes without videos)
    if (scenes.length === 0) return null;

    let accumulatedTime = 0;
    for (const scene of scenes) {
      const sceneDuration = scene.duration || 5;
      if (
        playbackTime >= accumulatedTime &&
        playbackTime < accumulatedTime + sceneDuration
      ) {
        return scene;
      }
      accumulatedTime += sceneDuration;
    }
    // If past all scenes, return last scene
    return scenes[scenes.length - 1] || null;
  }, [playbackTime, scenes, currentItem]);

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
          seekTime < item.startTime + item.duration,
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
          onPlaybackTimeChange(lastItem.startTime + lastItem.duration);
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

  // Resolve video path when current video changes
  useEffect(() => {
    if (!currentVideo?.path) {
      setCurrentVideoPath('');
      return;
    }

    resolveAssetPathForDisplay(
      currentVideo.path,
      projectDirectory || null,
      useMockData,
    ).then((resolved) => {
      setCurrentVideoPath(resolved);
    });
  }, [currentVideo?.path, projectDirectory, useMockData]);

  // Update video source when current video changes
  // Don't switch videos during dragging - wait until drag ends
  useEffect(() => {
    if (!currentVideo || !videoRef.current || !currentVideoPath || isDragging) {
      return;
    }

    const videoElement = videoRef.current;

    // Only update if source actually changed to prevent flickering
    if (currentVideoPathRef.current !== currentVideoPath) {
      const wasPlaying = !videoElement.paused;
      currentVideoPathRef.current = currentVideoPath;

      // Pause current video before changing source
      videoElement.pause();

      // Set new source
      videoElement.src = currentVideoPath;
      videoElement.currentTime = 0;

      // Wait for video to be ready before playing
      const handleCanPlay = () => {
        if (wasPlaying || isPlaying) {
          videoElement.play().catch(() => {
            // Ignore play errors - video might not be ready yet
          });
        }
        videoElement.removeEventListener('canplay', handleCanPlay);
      };

      const handleLoadedData = () => {
        // Video is loaded, safe to play if needed
        if (wasPlaying || isPlaying) {
          videoElement.play().catch(() => {
            // Ignore play errors
          });
        }
        videoElement.removeEventListener('loadeddata', handleLoadedData);
      };

      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('loadeddata', handleLoadedData);
      videoElement.load();

      return () => {
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('loadeddata', handleLoadedData);
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
        playbackTime < item.startTime + item.duration,
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
    if (
      timelineItems.length > 0 &&
      currentItemIndex >= timelineItems.length
    ) {
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

  // Handle auto-advance for scenes without videos
  // When playing a scene item (not video), check if we've reached the end of the item
  useEffect(() => {
    if (!isPlaying || isDragging || isSeekingRef.current) return;
    if (!currentItem || currentItem.type === 'video') return; // Only handle scene items

    const itemEndTime = currentItem.startTime + currentItem.duration;
    // If playbackTime has reached or passed the end of the current scene, move to next item
    if (playbackTime >= itemEndTime && currentItemIndex < timelineItems.length - 1) {
      const nextIndex = currentItemIndex + 1;
      setCurrentItemIndex(nextIndex);
      onPlaybackTimeChange(timelineItems[nextIndex].startTime);
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

  // Show empty state if no project and not using mock data
  if (!projectDirectory && !useMockData) {
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
                  useMockData={useMockData}
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
              <video
                ref={videoRef}
                className={styles.playerVideo}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnd}
                preload="auto"
                playsInline
              />
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
            /* Show controls even when no video - for scene playback */
            <div className={styles.videoPlayer}>
              <div className={styles.scenePlaceholder}>
                {currentItem && currentItem.type === 'scene' && (
                  <div className={styles.scenePlaceholderContent}>
                    <Film size={64} className={styles.scenePlaceholderIcon} />
                    <h3>{currentItem.label}</h3>
                    {currentItem.scene?.description && (
                      <p className={styles.scenePlaceholderDescription}>
                        {currentItem.scene.description}
                      </p>
                    )}
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

          {/* Scene info panel - show when currentScene exists and NOT playing imported video */}
          {currentScene && (!currentVideo || currentVideo.scene) ? (
            <div className={styles.sceneInfoPanel}>
              <div className={styles.sceneHeader}>
                <h3 className={styles.sceneTitle}>
                  Scene {currentScene.scene_number}
                  {currentScene.name && (
                    <span className={styles.sceneName}>: {currentScene.name}</span>
                  )}
                </h3>
              </div>
              {currentScene.description && (
                <div className={styles.sceneDescription}>
                  {currentScene.description}
                </div>
              )}
              <div className={styles.sceneMetadata}>
                {currentScene.shot_type && (
                  <div className={styles.sceneMetaItem}>
                    <strong>Shot Type:</strong> {currentScene.shot_type}
                  </div>
                )}
                {currentScene.lighting && (
                  <div className={styles.sceneMetaItem}>
                    <strong>Lighting:</strong> {currentScene.lighting}
                  </div>
                )}
                {currentScene.duration && (
                  <div className={styles.sceneMetaItem}>
                    <strong>Duration:</strong> {currentScene.duration}s
                  </div>
                )}
                {currentScene.location && (
                  <div className={styles.sceneMetaItem}>
                    <strong>Location:</strong> {currentScene.location}
                  </div>
                )}
                {currentScene.mood && (
                  <div className={styles.sceneMetaItem}>
                    <strong>Mood:</strong> {currentScene.mood}
                  </div>
                )}
                {currentScene.characters && currentScene.characters.length > 0 && (
                  <div className={styles.sceneMetaItem}>
                    <strong>Characters:</strong> {currentScene.characters.join(', ')}
                  </div>
                )}
              </div>
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
