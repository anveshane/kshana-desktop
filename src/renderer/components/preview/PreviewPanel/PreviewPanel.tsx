import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Settings } from 'lucide-react';
import type { AppSettings } from '../../../../shared/settingsTypes';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { TimelineDataProvider } from '../../../contexts/TimelineDataContext';
import { useBackendHealth } from '../../../hooks/useBackendHealth';
import type { SceneVersions } from '../../../types/kshana/timeline';
import PreviewPlaceholder from '../PreviewPlaceholder/PreviewPlaceholder';
import MediaPreview from '../MediaPreview/MediaPreview';
import StoryboardView from '../StoryboardView/StoryboardView';
import AssetsView from '../AssetsView/AssetsView';
import VideoLibraryView from '../VideoLibraryView/VideoLibraryView';
import PlansView from '../PlansView/PlansView';
import TimelinePanel from '../TimelinePanel/TimelinePanel';
import BetaEditorShell from '../BetaEditorShell';
import SettingsPanel from '../../SettingsPanel';
import {
  isRichEditorBetaEnabled,
  writeRichEditorBetaToStorage,
} from '../../../services/featureFlags';
import styles from './PreviewPanel.module.scss';

type Tab =
  | 'storyboard'
  | 'assets'
  | 'video-library'
  | 'preview'
  | 'rich-editor-beta';

export default function PreviewPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('video-library');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(300);

  // Shared playback state for timeline and video preview synchronization
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const { selectedFile, connectionState, projectDirectory, pendingFileNavigation, clearFileNavigation } = useWorkspace();
  
  // Handle file navigation from chat panel
  useEffect(() => {
    if (pendingFileNavigation) {
      setActiveTab('preview');
    }
  }, [pendingFileNavigation]);
  const { timelineState, scenes: projectScenes } = useProject();

  // Initialize activeVersions from timelineState with migration support
  const [activeVersions, setActiveVersions] = useState<
    Record<number, SceneVersions>
  >(() => {
    const versions: Record<number, SceneVersions> = {};
    if (timelineState?.active_versions) {
      Object.entries(timelineState.active_versions).forEach(
        ([folder, versionData]) => {
          // Extract scene number from folder name (e.g., "scene-001" -> 1)
          const match = folder.match(/scene-(\d+)/);
          if (match) {
            const sceneNumber = parseInt(match[1], 10);

            // Handle migration from old format (number) to new format (SceneVersions)
            if (typeof versionData === 'number') {
              // Old format: treat as video version
              versions[sceneNumber] = { video: versionData };
            } else if (versionData && typeof versionData === 'object') {
              // New format: use as-is
              versions[sceneNumber] = versionData;
            }
          }
        },
      );
    }
    return versions;
  });

  // Update activeVersions when timelineState changes (with migration)
  // Use ref to track previous serialized state to avoid infinite loops
  const prevActiveVersionsRef = useRef<string>('');

  useEffect(() => {
    if (!timelineState?.active_versions) {
      prevActiveVersionsRef.current = '';
      return;
    }

    const versions: Record<number, SceneVersions> = {};
    Object.entries(timelineState.active_versions).forEach(
      ([folder, versionData]) => {
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

    // Serialize to compare if content actually changed
    const serializedVersions = JSON.stringify(versions);

    // Only update if content actually changed
    if (serializedVersions !== prevActiveVersionsRef.current) {
      prevActiveVersionsRef.current = serializedVersions;
      setActiveVersions(versions);
    }
  }, [timelineState?.active_versions]);

  // Playback loop - advance playbackTime when playing
  // Includes bounds checking to stop at totalDuration
  useEffect(() => {
    if (isPlaying && !isDragging) {
      playbackIntervalRef.current = setInterval(() => {
        setPlaybackTime((prev) => {
          const next = prev + 0.1; // Update every 100ms (0.1 seconds)
          // Stop playback when reaching the end of timeline
          if (totalDuration > 0 && next >= totalDuration) {
            setIsPlaying(false);
            return totalDuration;
          }
          return next;
        });
      }, 100);
    } else if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };
  }, [isPlaying, isDragging, totalDuration]);

  // Handle timeline resize
  const handleTimelineResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = timelineHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY; // Inverted because we're dragging up
        const newHeight = Math.max(200, Math.min(600, startHeight + deltaY));
        setTimelineHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [timelineHeight],
  );

  // Check backend health periodically
  useBackendHealth(settings);

  const richEditorBetaEnabled = useMemo(
    () => isRichEditorBetaEnabled(settings),
    [settings],
  );

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedSettings = await window.electron.settings.get();
        setSettings(storedSettings);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();

    // Subscribe to settings changes
    const unsubscribe = window.electron.settings.onChange((next) => {
      setSettings(next);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (settings?.feature?.rich_editor_beta === undefined) {
      return;
    }
    writeRichEditorBetaToStorage(settings.feature.rich_editor_beta);
  }, [settings?.feature?.rich_editor_beta]);

  useEffect(() => {
    if (!richEditorBetaEnabled && activeTab === 'rich-editor-beta') {
      setActiveTab('video-library');
    }
  }, [richEditorBetaEnabled, activeTab]);

  const handleSaveSettings = useCallback(async (next: AppSettings) => {
    setIsRestartingBackend(true);
    setSettingsError(null);
    try {
      const updated = await window.electron.settings.update(next);
      setSettings(updated);
      const result = await window.electron.backend.restart();
      if (result.status === 'error') {
        setSettingsError(result.message || 'Failed to connect to backend server');
      } else {
        setSettingsOpen(false);
      }
    } catch (error) {
      console.error('Failed to restart backend:', error);
      setSettingsError(
        error instanceof Error ? error.message : 'Failed to save settings',
      );
    } finally {
      setIsRestartingBackend(false);
    }
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'video-library' ? styles.active : ''}`}
            onClick={() => setActiveTab('video-library')}
          >
            Video Library
          </button>
          {/* Storyboard tab hidden for now */}
          {/* <button
            type="button"
            className={`${styles.tab} ${activeTab === 'storyboard' ? styles.active : ''}`}
            onClick={() => setActiveTab('storyboard')}
          >
            Storyboard
          </button> */}
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'assets' ? styles.active : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            Assets
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'preview' ? styles.active : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          {richEditorBetaEnabled && (
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'rich-editor-beta' ? styles.active : ''}`}
              onClick={() => setActiveTab('rich-editor-beta')}
            >
              Rich Editor Beta
            </button>
          )}
        </div>

        <div className={styles.headerRight}>
          <div className={styles.statusIndicators}>
            <div className={styles.statusItem}>
              <span
                className={`${styles.statusDot} ${
                  connectionState.server === 'connected'
                    ? styles.connected
                    : ''
                }`}
              />
              <span className={styles.statusLabel}>
                Server:{' '}
                {connectionState.server === 'connected'
                  ? 'Connected'
                  : connectionState.server === 'connecting'
                    ? 'Connecting'
                    : 'Disconnected'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.settingsButton}
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className={styles.contentWrapper}>
        <TimelineDataProvider activeVersions={activeVersions}>
          <div className={styles.content}>
            {/* Storyboard view hidden for now */}
            {/* {activeTab === 'storyboard' && <StoryboardView />} */}
            {activeTab === 'assets' && <AssetsView />}
            {activeTab === 'video-library' && (
              <VideoLibraryView
                playbackTime={playbackTime}
                isPlaying={isPlaying}
                isDragging={isDragging}
                onPlaybackTimeChange={setPlaybackTime}
                onPlaybackStateChange={setIsPlaying}
                onTotalDurationChange={setTotalDuration}
                activeVersions={activeVersions}
                projectScenes={projectScenes}
              />
            )}
            {activeTab === 'preview' && (
              <PlansView 
                fileToOpen={pendingFileNavigation} 
                onFileOpened={clearFileNavigation}
              />
            )}
            {activeTab === 'rich-editor-beta' && (
              <BetaEditorShell
                onSwitchToLegacy={() => setActiveTab('video-library')}
              />
            )}
          </div>

          {projectDirectory && (
            <div
              className={styles.timelineContainer}
              style={
                timelineOpen
                  ? { height: `${timelineHeight}px` }
                  : { height: '28px' }
              }
            >
              <TimelinePanel
                isOpen={timelineOpen}
                onToggle={() => setTimelineOpen(!timelineOpen)}
                onResize={handleTimelineResize}
                playbackTime={playbackTime}
                isPlaying={isPlaying}
                onSeek={setPlaybackTime}
                onPlayPause={setIsPlaying}
                onDragStateChange={setIsDragging}
                activeVersions={activeVersions}
                onActiveVersionsChange={setActiveVersions}
              />
            </div>
          )}
        </TimelineDataProvider>
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        settings={settings}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsError(null);
        }}
        onSave={handleSaveSettings}
        isRestarting={isRestartingBackend}
        error={settingsError}
      />
    </div>
  );
}
