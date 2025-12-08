import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Film, Play, Calendar, Pause } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type {
  ProjectState,
  Artifact,
  StoryboardScene,
} from '../../../types/projectState';
import styles from './VideoLibraryView.module.scss';

interface TimelineVideoItem {
  id: string;
  path: string;
  startTime: number;
  duration: number;
  label: string;
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
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentVideoPathRef = useRef<string | null>(null);
  const isSeekingRef = useRef(false);

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

  // Get video artifacts
  const videoArtifacts: Artifact[] =
    projectState?.artifacts.filter(
      (artifact) => artifact.artifact_type === 'video',
    ) || [];

  // Get scenes and artifacts for timeline
  const scenes: StoryboardScene[] =
    projectState?.storyboard_outline?.scenes || [];

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
          if (
            !artifactsBySceneMap[artifact.scene_number] ||
            artifact.artifact_type === 'video'
          ) {
            artifactsBySceneMap[artifact.scene_number] = artifact;
          }
        }
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

  // Calculate timeline videos - same logic as TimelinePanel
  const timelineVideos = useMemo(() => {
    const videos: TimelineVideoItem[] = [];
    let currentTime = 0;

    // Add scene videos
    scenes.forEach((scene) => {
      const artifact = artifactsByScene[scene.scene_number];
      if (artifact && artifact.artifact_type === 'video') {
        const duration = scene.duration || 5;
        videos.push({
          id: `scene-video-${scene.scene_number}`,
          path: artifact.file_path,
          startTime: currentTime,
          duration,
          label: `SCN_${String(scene.scene_number).padStart(2, '0')}`,
        });
        currentTime += duration;
      } else {
        currentTime += scene.duration || 5;
      }
    });

    // Add imported videos
    importedVideoArtifacts.forEach((artifact, index) => {
      const duration = (artifact.metadata?.duration as number) || 5;
      videos.push({
        id: `imported-${index}`,
        path: artifact.file_path,
        startTime: currentTime,
        duration,
        label: 'Imported',
      });
      currentTime += duration;
    });

    return videos.sort((a, b) => a.startTime - b.startTime);
  }, [scenes, artifactsByScene, importedVideoArtifacts]);

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

  // Calculate total duration
  const totalDuration = useMemo(() => {
    if (timelineVideos.length === 0) return 0;
    const lastVideo = timelineVideos[timelineVideos.length - 1];
    return lastVideo.startTime + lastVideo.duration;
  }, [timelineVideos]);

  // Get current video from timeline
  const currentVideo = timelineVideos[currentVideoIndex] || null;

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

  // Handle video end - move to next video
  const handleVideoEnd = useCallback(() => {
    if (isDragging) return; // Don't auto-advance during dragging

    if (currentVideoIndex < timelineVideos.length - 1) {
      const nextIndex = currentVideoIndex + 1;
      setCurrentVideoIndex(nextIndex);
      onPlaybackTimeChange(timelineVideos[nextIndex].startTime);
      // Video will auto-play when source changes if was playing
    } else {
      onPlaybackStateChange(false);
      setCurrentVideoIndex(0);
      onPlaybackTimeChange(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }
  }, [
    currentVideoIndex,
    timelineVideos,
    onPlaybackTimeChange,
    onPlaybackStateChange,
    isDragging,
  ]);

  // Handle video seek - find which video and position
  const handleSeek = useCallback(
    (seekTime: number) => {
      isSeekingRef.current = true;

      // During dragging, only update playback time, don't switch videos
      // Video switching will happen when drag ends
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

      // Normal seek (not dragging) - allow video switching
      // Find which video contains this time
      const videoIndex = timelineVideos.findIndex(
        (video) =>
          seekTime >= video.startTime &&
          seekTime < video.startTime + video.duration,
      );

      if (videoIndex >= 0) {
        const video = timelineVideos[videoIndex];
        const videoTime = seekTime - video.startTime;

        onPlaybackTimeChange(seekTime);

        if (videoIndex !== currentVideoIndex) {
          setCurrentVideoIndex(videoIndex);
          // Video source will change, and play state will be handled by useEffect
        } else if (videoRef.current) {
          // Same video, just seek within it
          videoRef.current.currentTime = videoTime;
        }
      } else if (seekTime >= totalDuration) {
        // Seeked past end - go to last video
        const lastIndex = timelineVideos.length - 1;
        if (lastIndex >= 0) {
          const lastVideo = timelineVideos[lastIndex];
          setCurrentVideoIndex(lastIndex);
          onPlaybackTimeChange(lastVideo.startTime + lastVideo.duration);
          if (videoRef.current) {
            videoRef.current.currentTime = lastVideo.duration;
          }
        }
      }

      // Clear seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    },
    [
      timelineVideos,
      currentVideoIndex,
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

  // Update video source when current video changes
  // Don't switch videos during dragging - wait until drag ends
  useEffect(() => {
    if (!currentVideo || !videoRef.current || !projectDirectory || isDragging) {
      return;
    }

    const videoPath = `file://${projectDirectory}/${currentVideo.path}`;
    const videoElement = videoRef.current;

    // Only update if source actually changed to prevent flickering
    if (currentVideoPathRef.current !== videoPath) {
      const wasPlaying = !videoElement.paused;
      currentVideoPathRef.current = videoPath;

      // Pause current video before changing source
      videoElement.pause();

      // Set new source
      videoElement.src = videoPath;
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
  }, [currentVideo, projectDirectory, isPlaying, isDragging]);

  // When dragging ends, switch to the correct video based on final playback time
  useEffect(() => {
    if (!isDragging && timelineVideos.length > 0) {
      // Find which video contains the current playback time
      const videoIndex = timelineVideos.findIndex(
        (video) =>
          playbackTime >= video.startTime &&
          playbackTime < video.startTime + video.duration,
      );

      if (videoIndex >= 0 && videoIndex !== currentVideoIndex) {
        // Switch to the correct video
        setCurrentVideoIndex(videoIndex);
        const video = timelineVideos[videoIndex];
        const videoTime = playbackTime - video.startTime;
        // Video source will update via useEffect, then we'll seek to the right position
        if (videoRef.current) {
          // Wait a bit for video source to update
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = Math.max(0, videoTime);
            }
          }, 100);
        }
      } else if (videoIndex < 0 && playbackTime >= totalDuration) {
        // Past end - go to last video
        const lastIndex = timelineVideos.length - 1;
        if (lastIndex >= 0 && lastIndex !== currentVideoIndex) {
          setCurrentVideoIndex(lastIndex);
        }
      }
    }
  }, [
    isDragging,
    playbackTime,
    timelineVideos,
    currentVideoIndex,
    totalDuration,
  ]);

  // Initialize to first video when timeline loads
  useEffect(() => {
    if (
      timelineVideos.length > 0 &&
      currentVideoIndex >= timelineVideos.length
    ) {
      setCurrentVideoIndex(0);
      onPlaybackTimeChange(0);
    } else if (timelineVideos.length > 0 && currentVideoIndex < 0) {
      setCurrentVideoIndex(0);
      onPlaybackTimeChange(0);
    }
  }, [timelineVideos.length, currentVideoIndex, onPlaybackTimeChange]);

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

  if (loading) {
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
              {videoArtifacts.map((artifact) => {
                const videoPath = `file://${projectDirectory}/${artifact.file_path}`;

                return (
                  <div key={artifact.artifact_id} className={styles.videoCard}>
                    <div className={styles.videoThumbnail}>
                      <video
                        src={videoPath}
                        className={styles.video}
                        preload="metadata"
                        muted
                      />
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
              })}
            </div>
          )}
        </div>

        {/* Right Side - Timeline Preview */}
        {timelineVideos.length > 0 ? (
          <div className={styles.playerSection}>
            <div className={styles.videoPlayer}>
              {currentVideo && (
                <>
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
                  </div>
                </>
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
          </div>
        ) : (
          <div className={styles.emptyPlayer}>
            <Film size={48} className={styles.emptyPlayerIcon} />
            <p>No videos in timeline</p>
            <p className={styles.emptySubtext}>
              Add videos to the timeline to preview them here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
