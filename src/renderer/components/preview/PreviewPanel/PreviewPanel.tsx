import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import PreviewPlaceholder from '../PreviewPlaceholder/PreviewPlaceholder';
import MediaPreview from '../MediaPreview/MediaPreview';
import TimelineView from '../TimelineView/TimelineView';
import styles from './PreviewPanel.module.scss';

type Tab = 'preview' | 'timeline';

export default function PreviewPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const { selectedFile, connectionState } = useWorkspace();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'preview' ? styles.active : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'timeline' ? styles.active : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
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
              <span className={styles.statusLabel}>LM Studio: Connected</span>
            </div>
            <div className={styles.statusItem}>
              <span
                className={`${styles.statusDot} ${
                  connectionState.comfyUI === 'connected'
                    ? styles.connected
                    : ''
                }`}
              />
              <span className={styles.statusLabel}>ComfyUI: Connected</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.settingsButton}
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'preview' && selectedFile && (
          <MediaPreview file={selectedFile} />
        )}
        {activeTab === 'preview' && !selectedFile && <PreviewPlaceholder />}
        {activeTab === 'timeline' && <TimelineView />}
      </div>
    </div>
  );
}
