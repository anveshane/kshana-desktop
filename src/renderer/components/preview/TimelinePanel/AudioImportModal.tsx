import React, { useState } from 'react';
import { X, Youtube, FileAudio } from 'lucide-react';
import styles from './AudioImportModal.module.scss';

interface AudioImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFromFile: () => Promise<void>;
  onImportFromYouTube: (url: string) => Promise<void>;
}

export default function AudioImportModal({
  isOpen,
  onClose,
  onImportFromFile,
  onImportFromYouTube,
}: AudioImportModalProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'youtube'>('file');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileImport = async () => {
    setIsProcessing(true);
    try {
      await onImportFromFile();
      onClose();
    } catch (error) {
      console.error('Error importing audio file:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleYouTubeImport = async () => {
    if (!youtubeUrl.trim()) {
      return;
    }
    setIsProcessing(true);
    try {
      await onImportFromYouTube(youtubeUrl.trim());
      setYoutubeUrl('');
      onClose();
    } catch (error) {
      console.error('Error importing YouTube audio:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Import Audio</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'file' ? styles.active : ''}`}
              onClick={() => setActiveTab('file')}
            >
              <FileAudio size={16} />
              <span>Select File</span>
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'youtube' ? styles.active : ''}`}
              onClick={() => setActiveTab('youtube')}
            >
              <Youtube size={16} />
              <span>YouTube URL</span>
            </button>
          </div>

          {activeTab === 'file' && (
            <div className={styles.tabContent}>
              <p className={styles.description}>
                Select an audio file from your computer
              </p>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleFileImport}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Browse Files'}
              </button>
            </div>
          )}

          {activeTab === 'youtube' && (
            <div className={styles.tabContent}>
              <p className={styles.description}>
                Enter a YouTube video URL to extract audio
              </p>
              <input
                type="text"
                className={styles.urlInput}
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && youtubeUrl.trim()) {
                    handleYouTubeImport();
                  }
                }}
                disabled={isProcessing}
              />
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleYouTubeImport}
                disabled={!youtubeUrl.trim() || isProcessing}
              >
                {isProcessing ? 'Extracting...' : 'Extract Audio'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
