import { useMemo, useState, useEffect } from 'react';
import { Image as ImageIcon, Video, X, Play } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { FileNode, getFileType } from '../../../../shared/fileSystemTypes';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import styles from './AssetsView.module.scss';

interface MediaAsset {
  name: string;
  path: string;
  type: 'image' | 'video';
}

export default function AssetsView() {
  const { projectDirectory } = useWorkspace();
  
  const [generatedImages, setGeneratedImages] = useState<MediaAsset[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<MediaAsset[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [selectedImage, setSelectedImage] = useState<MediaAsset | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<MediaAsset | null>(null);
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});
  const [videoPaths, setVideoPaths] = useState<Record<string, string>>({});

  // Load generated images and videos from placement directories
  useEffect(() => {
    if (!projectDirectory) {
      setGeneratedImages([]);
      setGeneratedVideos([]);
      return;
    }

    const loadMediaFiles = async () => {
      setIsLoadingMedia(true);
      try {
        const imagePlacementsDir = `${projectDirectory}/.kshana/agent/image-placements`;
        const videoPlacementsDir = `${projectDirectory}/.kshana/agent/video-placements`;

        // Load images
        try {
          const imageTree = await window.electron.project.readTree(imagePlacementsDir, 1);
          const imageFiles: MediaAsset[] = [];
          
          const collectImageFiles = (node: FileNode) => {
            if (node.type === 'file' && node.extension) {
              const fileType = getFileType(node.extension);
              if (fileType === 'image') {
                imageFiles.push({
                  name: node.name,
                  path: node.path,
                  type: 'image',
                });
              }
            }
            if (node.children) {
              node.children.forEach(collectImageFiles);
            }
          };
          
          collectImageFiles(imageTree);
          setGeneratedImages(imageFiles);
        } catch (err) {
          // Directory might not exist yet
          setGeneratedImages([]);
        }

        // Load videos
        try {
          const videoTree = await window.electron.project.readTree(videoPlacementsDir, 1);
          const videoFiles: MediaAsset[] = [];
          
          const collectVideoFiles = (node: FileNode) => {
            if (node.type === 'file' && node.extension) {
              const fileType = getFileType(node.extension);
              if (fileType === 'video') {
                videoFiles.push({
                  name: node.name,
                  path: node.path,
                  type: 'video',
                });
              }
            }
            if (node.children) {
              node.children.forEach(collectVideoFiles);
            }
          };
          
          collectVideoFiles(videoTree);
          setGeneratedVideos(videoFiles);
        } catch (err) {
          // Directory might not exist yet
          setGeneratedVideos([]);
        }
      } catch (err) {
        console.error('Failed to load media files:', err);
      } finally {
        setIsLoadingMedia(false);
      }
    };

    loadMediaFiles();

    // Listen for file changes to refresh media files
    const unsubscribe = window.electron.project.onFileChange((event) => {
      // Refresh if files changed in placement directories
      if (event.path.includes('image-placements') || event.path.includes('video-placements')) {
        loadMediaFiles();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectDirectory]);

  // Resolve image paths
  useEffect(() => {
    if (!projectDirectory || generatedImages.length === 0) {
      setImagePaths({});
      return;
    }

    const resolvePaths = async () => {
      const paths: Record<string, string> = {};
      for (const image of generatedImages) {
        try {
          const resolved = await resolveAssetPathForDisplay(image.path, projectDirectory);
          if (shouldUseBase64(resolved)) {
            const base64 = await imageToBase64(resolved);
            if (base64) {
              paths[image.path] = base64;
              continue;
            }
          }
          paths[image.path] = resolved;
        } catch (err) {
          console.error(`Failed to resolve image path for ${image.name}:`, err);
        }
      }
      setImagePaths(paths);
    };

    resolvePaths();
  }, [projectDirectory, generatedImages]);

  // Resolve video paths
  useEffect(() => {
    if (!projectDirectory || generatedVideos.length === 0) {
      setVideoPaths({});
      return;
    }

    const resolvePaths = async () => {
      const paths: Record<string, string> = {};
      for (const video of generatedVideos) {
        try {
          const resolved = await resolveAssetPathForDisplay(video.path, projectDirectory);
          paths[video.path] = resolved;
        } catch (err) {
          console.error(`Failed to resolve video path for ${video.name}:`, err);
        }
      }
      setVideoPaths(paths);
    };

    resolvePaths();
  }, [projectDirectory, generatedVideos]);

  // Show empty state if no project
  if (!projectDirectory) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <ImageIcon size={48} className={styles.emptyIcon} />
          <h3>No Project Open</h3>
          <p>Open a project to view generated assets</p>
        </div>
      </div>
    );
  }

  // Show empty state if no assets
  const hasAnyAssets = generatedImages.length > 0 || generatedVideos.length > 0;
  
  if (!isLoadingMedia && !hasAnyAssets) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <ImageIcon size={48} className={styles.emptyIcon} />
          <h3>No Generated Assets Yet</h3>
          <p>Generated images and videos will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.content}>
          {/* Generated Images Section */}
          {(generatedImages.length > 0 || isLoadingMedia) && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <ImageIcon size={16} />
                <h3>Generated Images</h3>
                <span className={styles.count}>{generatedImages.length}</span>
              </div>
              <div className={styles.grid}>
                {isLoadingMedia ? (
                  <div className={styles.emptySection}>
                    <p>Loading images...</p>
                  </div>
                ) : generatedImages.length > 0 ? (
                  generatedImages.map((image) => {
                    const imageSrc = imagePaths[image.path];
                    return (
                      <div
                        key={image.path}
                        className={styles.mediaCard}
                        onClick={() => setSelectedImage(image)}
                      >
                        <div className={styles.mediaThumbnail}>
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={image.name}
                              className={styles.thumbnailImage}
                            />
                          ) : (
                            <div className={styles.mediaPlaceholder}>
                              <ImageIcon size={32} />
                            </div>
                          )}
                        </div>
                        <div className={styles.mediaName}>{image.name}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptySection}>
                    <p>No generated images yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generated Videos Section */}
          {(generatedVideos.length > 0 || isLoadingMedia) && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <Video size={16} />
                <h3>Generated Videos</h3>
                <span className={styles.count}>{generatedVideos.length}</span>
              </div>
              <div className={styles.grid}>
                {isLoadingMedia ? (
                  <div className={styles.emptySection}>
                    <p>Loading videos...</p>
                  </div>
                ) : generatedVideos.length > 0 ? (
                  generatedVideos.map((video) => {
                    const videoSrc = videoPaths[video.path];
                    return (
                      <div
                        key={video.path}
                        className={styles.mediaCard}
                        onClick={() => setSelectedVideo(video)}
                      >
                        <div className={styles.mediaThumbnail}>
                          {videoSrc ? (
                            <>
                              <video
                                src={videoSrc}
                                className={styles.thumbnailVideo}
                                preload="metadata"
                                muted
                              />
                              <div className={styles.playOverlay}>
                                <Play size={32} />
                              </div>
                            </>
                          ) : (
                            <div className={styles.mediaPlaceholder}>
                              <Video size={32} />
                            </div>
                          )}
                        </div>
                        <div className={styles.mediaName}>{video.name}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptySection}>
                    <p>No generated videos yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && imagePaths[selectedImage.path] && (
        <div className={styles.modalOverlay} onClick={() => setSelectedImage(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              onClick={() => setSelectedImage(null)}
              aria-label="Close"
            >
              <X size={24} />
            </button>
            <img
              src={imagePaths[selectedImage.path]}
              alt={selectedImage.name}
              className={styles.modalImage}
            />
            <div className={styles.modalTitle}>{selectedImage.name}</div>
          </div>
        </div>
      )}

      {/* Video Modal */}
      {selectedVideo && videoPaths[selectedVideo.path] && (
        <div className={styles.modalOverlay} onClick={() => setSelectedVideo(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              onClick={() => setSelectedVideo(null)}
              aria-label="Close"
            >
              <X size={24} />
            </button>
            <video
              src={videoPaths[selectedVideo.path]}
              controls
              autoPlay
              className={styles.modalVideo}
            />
            <div className={styles.modalTitle}>{selectedVideo.name}</div>
          </div>
        </div>
      )}
    </>
  );
}
