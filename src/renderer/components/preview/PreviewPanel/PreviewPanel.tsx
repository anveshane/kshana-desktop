import { useState, useEffect, useCallback } from 'react';
import { Settings } from 'lucide-react';
import type { AppSettings } from '../../../../shared/settingsTypes';
import type { BackendEnvOverrides } from '../../../../shared/backendTypes';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useBackendHealth } from '../../../hooks/useBackendHealth';
import PreviewPlaceholder from '../PreviewPlaceholder/PreviewPlaceholder';
import MediaPreview from '../MediaPreview/MediaPreview';
import TimelineView from '../TimelineView/TimelineView';
import StoryboardView from '../StoryboardView/StoryboardView';
import AssetsView from '../AssetsView/AssetsView';
import SettingsPanel from '../../SettingsPanel';
import styles from './PreviewPanel.module.scss';

type Tab = 'timeline' | 'storyboard' | 'assets' | 'preview';

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
  const [activeTab, setActiveTab] = useState<Tab>('storyboard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isRestartingBackend, setIsRestartingBackend] = useState(false);
  const { selectedFile, connectionState } = useWorkspace();

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

  const handleSaveSettings = useCallback(
    async (next: AppSettings) => {
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
    },
    [],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'timeline' ? styles.active : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
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

      <div className={styles.content}>
        {activeTab === 'timeline' && <TimelineView />}
        {activeTab === 'storyboard' && <StoryboardView />}
        {activeTab === 'assets' && <AssetsView />}
        {activeTab === 'preview' && selectedFile && (
          <MediaPreview file={selectedFile} />
        )}
        {activeTab === 'preview' && !selectedFile && <PreviewPlaceholder />}
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
