import { useMemo } from 'react';
import type { SelectedFile } from '../../../types/workspace';
import styles from './MediaPreview.module.scss';

interface MediaPreviewProps {
  file: SelectedFile;
}

export default function MediaPreview({ file }: MediaPreviewProps) {
  const fileUrl = useMemo(() => {
    // Convert file path to file:// URL
    return `file://${file.path}`;
  }, [file.path]);

  const renderPreview = () => {
    switch (file.type) {
      case 'image':
        return <img src={fileUrl} alt={file.name} className={styles.image} />;
      case 'video':
        return (
          <video src={fileUrl} controls className={styles.video}>
            <track kind="captions" />
          </video>
        );
      case 'audio':
        return (
          <div className={styles.audioContainer}>
            <div className={styles.audioIcon}>🎵</div>
            <p className={styles.audioName}>{file.name}</p>
            <audio src={fileUrl} controls className={styles.audio}>
              <track kind="captions" />
            </audio>
          </div>
        );
      default:
        return (
          <div className={styles.unsupported}>
            <p>Preview not available for this file type</p>
            <p className={styles.fileName}>{file.name}</p>
          </div>
        );
    }
  };

  return <div className={styles.container}>{renderPreview()}</div>;
}
