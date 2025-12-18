import { useMemo, useState, useEffect, useRef } from 'react';
import type { SelectedFile } from '../../../types/workspace';
import { useProject } from '../../../contexts/ProjectContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import CodePreview from '../CodePreview/CodePreview';
import styles from './MediaPreview.module.scss';

interface MediaPreviewProps {
  file: SelectedFile;
}

export default function MediaPreview({ file }: MediaPreviewProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { useMockData } = useProject();
  const { projectDirectory } = useWorkspace();

  // Resolve file path using path resolver (handles test assets and project paths)
  useEffect(() => {
    if (file.type === 'image' || file.type === 'video' || file.type === 'audio') {
      resolveAssetPathForDisplay(
        file.path,
        projectDirectory || null,
        useMockData,
      )
        .then((resolved) => {
          setResolvedUrl(resolved);
          setError(null);
          if (file.type === 'video') {
            console.log(`[MediaPreview] Resolved video path: ${file.path} -> ${resolved}`);
          }
        })
        .catch((err) => {
          console.error(`[MediaPreview] Failed to resolve path for ${file.path}:`, err);
          setError(`Failed to resolve file path: ${err.message}`);
          // Fallback to direct file:// URL
          setResolvedUrl(`file://${file.path}`);
        });
    } else {
      // For non-media files, use direct file:// URL
      setResolvedUrl(`file://${file.path}`);
    }
  }, [file.path, file.type, projectDirectory, useMockData]);

  const fileUrl = useMemo(() => {
    return resolvedUrl || `file://${file.path}`;
  }, [resolvedUrl, file.path]);

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

  // Video error handler
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoElement = e.currentTarget;
    const error = videoElement.error;
    let errorMsg = 'Failed to load video';
    
    if (error) {
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          errorMsg = 'Video loading aborted';
          break;
        case error.MEDIA_ERR_NETWORK:
          errorMsg = 'Network error while loading video';
          break;
        case error.MEDIA_ERR_DECODE:
          errorMsg = 'Video decoding error';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMsg = 'Video format not supported or file not found';
          break;
        default:
          errorMsg = `Video error (code: ${error.code})`;
      }
    }
    
    console.error(`[MediaPreview] Video load error for ${file.path}:`, errorMsg, {
      src: videoElement.src,
      errorCode: error?.code,
    });
    setError(errorMsg);
  };
  
  const handleVideoLoadStart = () => {
    setError(null);
    console.log(`[MediaPreview] Video load started: ${file.path}`);
  };
  
  const handleVideoCanPlay = () => {
    setError(null);
    console.log(`[MediaPreview] Video can play: ${file.path}`);
  };

  const renderPreview = () => {
    switch (file.type) {
      case 'image':
        return (
          <img
            src={fileUrl}
            alt={file.name}
            className={styles.image}
            onError={() => {
              console.error(`[MediaPreview] Image load error: ${file.path}`);
              setError('Failed to load image');
            }}
          />
        );
      case 'video':
        if (error) {
          return (
            <div className={styles.error}>
              <p>{error}</p>
              <p className={styles.fileName}>{file.name}</p>
              <p className={styles.fileName} style={{ fontSize: '12px', marginTop: '8px' }}>
                Path: {file.path}
              </p>
            </div>
          );
        }
        return (
          <video
            ref={videoRef}
            src={fileUrl}
            controls
            className={styles.video}
            onError={handleVideoError}
            onLoadStart={handleVideoLoadStart}
            onCanPlay={handleVideoCanPlay}
          >
            <track kind="captions" />
            Your browser does not support the video tag.
          </video>
        );
      case 'audio':
        return (
          <div className={styles.audioContainer}>
            <div className={styles.audioIcon}>🎵</div>
            <p className={styles.audioName}>{file.name}</p>
            <audio
              src={fileUrl}
              controls
              className={styles.audio}
              onError={() => {
                console.error(`[MediaPreview] Audio load error: ${file.path}`);
                setError('Failed to load audio');
              }}
            >
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
