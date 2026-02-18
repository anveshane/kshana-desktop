import { useMemo, useState, useEffect } from 'react';
import type { SelectedFile } from '../../../types/workspace';
import CodePreview from '../CodePreview/CodePreview';
import styles from './MediaPreview.module.scss';

interface MediaPreviewProps {
  file: SelectedFile;
}

export default function MediaPreview({ file }: MediaPreviewProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileUrl = useMemo(() => {
    return `file://${file.path.replace(/\\/g, '/')}`;
  }, [file.path]);

  const fileExtension = useMemo(() => {
    const parts = file.name.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }, [file.name]);

  // Load file content for text-based files
  useEffect(() => {
    if (file.type === 'script' || file.type === 'text') {
      setIsLoading(true);
      setError(null);
      window.electron.project
        .readFile(file.path)
        .then((content) => {
          if (content !== null) {
            setFileContent(content);
          } else {
            setError('File not found');
          }
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Failed to read file');
          setIsLoading(false);
        });
    } else {
      setFileContent(null);
    }
  }, [file.path, file.type]);

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
      case 'script':
      case 'text':
        if (isLoading) {
          return (
            <div className={styles.loading}>
              <p>Loading...</p>
            </div>
          );
        }
        if (error) {
          return (
            <div className={styles.error}>
              <p>{error}</p>
            </div>
          );
        }
        if (fileContent !== null) {
          return (
            <CodePreview
              content={fileContent}
              extension={fileExtension}
              fileName={file.name}
              filePath={file.path}
            />
          );
        }
        return null;
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
