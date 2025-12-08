import { useState, useEffect, useCallback } from 'react';
import { Settings } from 'lucide-react';
import type { AppSettings } from '../../../../shared/settingsTypes';
import type { BackendEnvOverrides } from '../../../../shared/backendTypes';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useBackendHealth } from '../../../hooks/useBackendHealth';
import PreviewPlaceholder from '../PreviewPlaceholder/PreviewPlaceholder';
import MediaPreview from '../MediaPreview/MediaPreview';
import StoryboardView from '../StoryboardView/StoryboardView';
import AssetsView from '../AssetsView/AssetsView';
import VideoLibraryView from '../VideoLibraryView/VideoLibraryView';
import TimelinePanel from '../TimelinePanel/TimelinePanel';
import SettingsPanel from '../../SettingsPanel';
import styles from './PreviewPanel.module.scss';

type Tab = 'storyboard' | 'assets' | 'video-library' | 'preview';

const mapSettingsToEnv = (settings: AppSettings): BackendEnvOverrides => ({
  port: settings.preferredPort,
  comfyuiUrl: settings.comfyuiUrl,
  lmStudioUrl: settings.lmStudioUrl,
  lmStudioModel: settings.lmStudioModel,
  llmProvider: settings.llmProvider,
  googleApiKey: settings.googleApiKey,
  projectDir: settings.projectDir,
});

export default function PreviewPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('video-library');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(300);

  // Shared playback state for timeline and video preview synchronization
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { selectedFile, connectionState, projectDirectory } = useWorkspace();

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

  const handleSaveSettings = useCallback(async (next: AppSettings) => {
    setIsRestartingBackend(true);
    try {
      const updated = await window.electron.settings.update(next);
      setSettings(updated);
      await window.electron.backend.restart(mapSettingsToEnv(updated));
      setSettingsOpen(false);
    } catch (error) {
      console.error('Failed to restart backend:', error);
      // Keep modal open on error so user can try again
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
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'storyboard' ? styles.active : ''}`}
            onClick={() => setActiveTab('storyboard')}
          >
            Storyboard
          </button>
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
        </div>

        <div className={styles.headerRight}>
          <div className={styles.statusIndicators}>
            <div className={styles.statusItem}>
              <span
                className={`${styles.statusDot} ${
                  connectionState.lmStudio === 'connected'
                    ? styles.connected
                    : ''
                }`}
              />
              <span className={styles.statusLabel}>
                {settings?.llmProvider === 'gemini' ? 'Gemini' : 'LM Studio'}:{' '}
                {connectionState.lmStudio === 'connected'
                  ? 'Connected'
                  : connectionState.lmStudio === 'connecting'
                    ? 'Connecting'
                    : 'Disconnected'}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span
                className={`${styles.statusDot} ${
                  connectionState.comfyUI === 'connected'
                    ? styles.connected
                    : ''
                }`}
              />
              <span className={styles.statusLabel}>
                ComfyUI:{' '}
                {connectionState.comfyUI === 'connected'
                  ? 'Connected'
                  : connectionState.comfyUI === 'connecting'
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
        <div className={styles.content}>
          {activeTab === 'storyboard' && <StoryboardView />}
          {activeTab === 'assets' && <AssetsView />}
          {activeTab === 'video-library' && (
            <VideoLibraryView
              playbackTime={playbackTime}
              isPlaying={isPlaying}
              isDragging={isDragging}
              onPlaybackTimeChange={setPlaybackTime}
              onPlaybackStateChange={setIsPlaying}
            />
          )}
          {activeTab === 'preview' && selectedFile && (
            <MediaPreview file={selectedFile} />
          )}
          {activeTab === 'preview' && !selectedFile && <PreviewPlaceholder />}
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
            />
          </div>
        )}
      </div>

      <SettingsPanel
        isOpen={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        isRestarting={isRestartingBackend}
      />
    </div>
  );
}
