import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ChangeEvent,
} from 'react';
import {
  Image as ImageIcon,
  Video,
  X,
  Play,
  ImagePlus,
  Search,
  Upload,
  RefreshCw,
  AlertTriangle,
  Music,
} from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { FileNode, getFileType } from '../../../../shared/fileSystemTypes';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import {
  appendImportedMediaToTimelineState,
  importedMediaToAssetInfo,
  importMediaToProject,
  replaceMediaInProject,
  type ImportedMediaData,
} from '../../../services/media';
import styles from './AssetsView.module.scss';

interface MediaAsset {
  name: string;
  path: string;
  type: 'image' | 'video';
}

interface ImportedAssetRecord {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video' | 'audio';
  metadata?: Record<string, unknown>;
}

export default function AssetsView() {
  const { projectDirectory } = useWorkspace();
  const {
    manifest,
    assetManifest,
    addAsset,
    timelineState,
    updateTimelineTracks,
    updateImportedClips,
  } = useProject();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [generatedImages, setGeneratedImages] = useState<MediaAsset[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<MediaAsset[]>([]);
  const [generatedInfographics, setGeneratedInfographics] = useState<
    MediaAsset[]
  >([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [selectedImage, setSelectedImage] = useState<MediaAsset | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<MediaAsset | null>(null);
  const [selectedInfographic, setSelectedInfographic] =
    useState<MediaAsset | null>(null);
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});
  const [videoPaths, setVideoPaths] = useState<Record<string, string>>({});
  const [infographicPaths, setInfographicPaths] = useState<
    Record<string, string>
  >({});
  const [importedDisplayPaths, setImportedDisplayPaths] = useState<
    Record<string, string>
  >({});
  const [searchQuery, setSearchQuery] = useState('');
  const [importingAssetPath, setImportingAssetPath] = useState<string | null>(
    null,
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [missingImportedPaths, setMissingImportedPaths] = useState<
    Record<string, boolean>
  >({});

  const importedAssets = useMemo<ImportedAssetRecord[]>(() => {
    if (!assetManifest?.assets) return [];

    return assetManifest.assets
      .filter((asset) => {
        const importedFlag = Boolean(asset.metadata?.imported);
        const inAssetsDir = asset.path.startsWith('.kshana/assets/');
        return importedFlag || inAssetsDir;
      })
      .map((asset) => {
        const loweredPath = asset.path.toLowerCase();
        let type: ImportedAssetRecord['type'] = 'video';
        if (/\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(loweredPath)) {
          type = 'audio';
        } else if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(loweredPath)) {
          type = 'image';
        }

        return {
          id: asset.id,
          name: asset.path.replace(/\\/g, '/').split('/').pop() || asset.id,
          path: asset.path,
          type,
          metadata: asset.metadata,
        };
      });
  }, [assetManifest?.assets]);

  const filteredImportedAssets = useMemo(() => {
    if (!searchQuery.trim()) return importedAssets;
    const query = searchQuery.trim().toLowerCase();
    return importedAssets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(query) ||
        asset.path.toLowerCase().includes(query),
    );
  }, [importedAssets, searchQuery]);

  // Load generated images and videos from placement directories
  useEffect(() => {
    if (!projectDirectory) {
      setGeneratedImages([]);
      setGeneratedVideos([]);
      setGeneratedInfographics([]);
      return;
    }

    const loadMediaFiles = async () => {
      setIsLoadingMedia(true);
      try {
        const imagePlacementsDir = `${projectDirectory}/.kshana/agent/image-placements`;
        const videoPlacementsDir = `${projectDirectory}/.kshana/agent/video-placements`;
        const infographicPlacementsDir = `${projectDirectory}/.kshana/agent/infographic-placements`;

        // Load images
        try {
          const imageTree = await window.electron.project.readTree(
            imagePlacementsDir,
            1,
          );
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
          const videoTree = await window.electron.project.readTree(
            videoPlacementsDir,
            1,
          );
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
          setGeneratedVideos([]);
        }

        // Load infographics (MP4s and WebMs from Remotion)
        try {
          const infographicTree = await window.electron.project.readTree(
            infographicPlacementsDir,
            2, // Increased depth to handle subdirectories
          );
          const infographicFiles: MediaAsset[] = [];

          const collectInfographicFiles = (node: FileNode) => {
            if (node.type === 'file' && node.extension) {
              // Display both MP4 and WebM files (WebM for transparency support)
              const ext = node.extension.toLowerCase();
              if (ext === '.mp4' || ext === '.webm') {
                console.log('[AssetsView] Found infographic file:', node.name, node.path);
                infographicFiles.push({
                  name: node.name,
                  path: node.path,
                  type: 'video',
                });
              }
            }
            if (node.children) {
              node.children.forEach(collectInfographicFiles);
            }
          };

          collectInfographicFiles(infographicTree);
          console.log('[AssetsView] Total infographic files found:', infographicFiles.length);
          setGeneratedInfographics(infographicFiles);
        } catch (err) {
          console.error('[AssetsView] Error loading infographics:', err);
          setGeneratedInfographics([]);
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
      if (
        event.path.includes('image-placements') ||
        event.path.includes('video-placements') ||
        event.path.includes('infographic-placements')
      ) {
        loadMediaFiles();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectDirectory]);

  useEffect(() => {
    if (!projectDirectory || importedAssets.length === 0) {
      setMissingImportedPaths({});
      return;
    }

    let cancelled = false;
    const checkMissingAssets = async () => {
      const entries = await Promise.all(
        importedAssets.map(async (asset) => {
          const absolutePath =
            asset.path.startsWith('/') || /^[A-Za-z]:/.test(asset.path)
              ? asset.path
              : `${projectDirectory}/${asset.path}`;
          const exists = await window.electron.project.checkFileExists(
            absolutePath,
          );
          return [asset.path, !exists] as const;
        }),
      );

      if (!cancelled) {
        setMissingImportedPaths(Object.fromEntries(entries));
      }
    };

    checkMissingAssets().catch(() => {
      if (!cancelled) {
        setMissingImportedPaths({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectDirectory, importedAssets]);

  const importFromPath = useCallback(
    async (sourcePath: string) => {
      if (!projectDirectory || !sourcePath) return;
      setImportingAssetPath(sourcePath);

      try {
        const imported = await importMediaToProject({
          projectDirectory,
          sourcePath,
        });
        await addAsset(importedMediaToAssetInfo(imported));
      } catch (error) {
        console.error('[AssetsView] Failed to import asset:', error);
      } finally {
        setImportingAssetPath(null);
      }
    },
    [projectDirectory, addAsset],
  );

  const isAspectRatioCompatible = useCallback(
    (metadata?: Record<string, unknown>) => {
      const projectWidth = manifest?.settings?.resolution?.width;
      const projectHeight = manifest?.settings?.resolution?.height;
      if (!projectWidth || !projectHeight || !metadata) {
        return true;
      }

      const mediaWidth = metadata.width;
      const mediaHeight = metadata.height;
      if (typeof mediaWidth !== 'number' || typeof mediaHeight !== 'number') {
        return true;
      }

      const projectRatio = projectWidth / projectHeight;
      const mediaRatio = mediaWidth / mediaHeight;
      const ratioDelta = Math.abs(projectRatio - mediaRatio);
      if (ratioDelta <= 0.03) {
        return true;
      }

      return window.confirm(
        `Imported media aspect ratio (${mediaWidth}x${mediaHeight}) differs from project ratio (${projectWidth}x${projectHeight}). Add to timeline anyway?`,
      );
    },
    [manifest?.settings?.resolution?.height, manifest?.settings?.resolution?.width],
  );

  const appendImportedAssetToTimeline = useCallback(
    (asset: ImportedAssetRecord) => {
      if (!projectDirectory || !isAspectRatioCompatible(asset.metadata)) {
        return;
      }

      const metadata = asset.metadata ?? {};
      const imported: ImportedMediaData = {
        id: asset.id,
        type: asset.type,
        relativePath: asset.path,
        absolutePath:
          asset.path.startsWith('/') || /^[A-Za-z]:/.test(asset.path)
            ? asset.path
            : `${projectDirectory}/${asset.path}`,
        extractedAudioRelativePath:
          typeof metadata.extractedAudioPath === 'string'
            ? metadata.extractedAudioPath
            : undefined,
        thumbnailRelativePath:
          typeof metadata.thumbnailPath === 'string'
            ? metadata.thumbnailPath
            : undefined,
        waveformRelativePath:
          typeof metadata.waveformPath === 'string'
            ? metadata.waveformPath
            : undefined,
        metadata: {
          duration:
            typeof metadata.duration === 'number' ? metadata.duration : undefined,
          width: typeof metadata.width === 'number' ? metadata.width : undefined,
          height:
            typeof metadata.height === 'number' ? metadata.height : undefined,
          fps: typeof metadata.fps === 'number' ? metadata.fps : undefined,
          size: typeof metadata.size === 'number' ? metadata.size : 0,
          lastModified:
            typeof metadata.lastModified === 'number'
              ? metadata.lastModified
              : Date.now(),
        },
      };

      const nextTimelineState = appendImportedMediaToTimelineState(
        timelineState,
        imported,
      );
      updateTimelineTracks(nextTimelineState.tracks);
      updateImportedClips(nextTimelineState.imported_clips);
    },
    [
      projectDirectory,
      isAspectRatioCompatible,
      timelineState,
      updateTimelineTracks,
      updateImportedClips,
    ],
  );

  const handleFilePickerImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        // Electron exposes absolute file path on File.
        const sourcePath = (file as File & { path?: string }).path;
        if (sourcePath) {
          // eslint-disable-next-line no-await-in-loop
          await importFromPath(sourcePath);
        }
      }
      event.target.value = '';
    },
    [importFromPath],
  );

  const handleDropImport = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(event.dataTransfer.files);
      for (const file of droppedFiles) {
        const sourcePath = (file as File & { path?: string }).path;
        if (sourcePath) {
          // eslint-disable-next-line no-await-in-loop
          await importFromPath(sourcePath);
        }
      }
    },
    [importFromPath],
  );

  const handleReplaceImportedAsset = useCallback(
    async (asset: ImportedAssetRecord) => {
      if (!projectDirectory) return;

      const selectedPath =
        asset.type === 'audio'
          ? await window.electron.project.selectAudioFile()
          : asset.type === 'image'
            ? await window.electron.project.selectImageFile()
          : await window.electron.project.selectVideoFile();
      if (!selectedPath) return;

      try {
        const result = await replaceMediaInProject({
          projectDirectory,
          currentRelativePath: asset.path,
          sourcePath: selectedPath,
        });
        const nextAsset = importedMediaToAssetInfo({
          id: asset.id,
          type: asset.type,
          relativePath: result.relativePath,
          absolutePath: result.absolutePath,
          metadata: result.metadata,
        });
        nextAsset.metadata = {
          ...(asset.metadata || {}),
          ...(nextAsset.metadata || {}),
          thumbnailPath:
            result.thumbnailRelativePath ||
            (nextAsset.metadata?.thumbnailPath as string | undefined),
          waveformPath:
            result.waveformRelativePath ||
            (nextAsset.metadata?.waveformPath as string | undefined),
          extractedAudioPath:
            result.extractedAudioRelativePath ||
            (nextAsset.metadata?.extractedAudioPath as string | undefined),
          imported: true,
          replacedAt: Date.now(),
        };
        await addAsset(nextAsset);
      } catch (error) {
        console.error('[AssetsView] Failed to replace imported asset:', error);
      }
    },
    [projectDirectory, addAsset],
  );

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
          const resolved = await resolveAssetPathForDisplay(
            image.path,
            projectDirectory,
          );
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
          const resolved = await resolveAssetPathForDisplay(
            video.path,
            projectDirectory,
          );
          paths[video.path] = resolved;
        } catch (err) {
          console.error(`Failed to resolve video path for ${video.name}:`, err);
        }
      }
      setVideoPaths(paths);
    };

    resolvePaths();
  }, [projectDirectory, generatedVideos]);

  // Resolve infographic paths
  useEffect(() => {
    if (!projectDirectory || generatedInfographics.length === 0) {
      setInfographicPaths({});
      return;
    }

    const resolvePaths = async () => {
      const paths: Record<string, string> = {};
      for (const infographic of generatedInfographics) {
        try {
          console.log('[AssetsView] Resolving infographic path:', infographic.path);
          const resolved = await resolveAssetPathForDisplay(
            infographic.path,
            projectDirectory,
          );
          console.log('[AssetsView] Resolved to:', resolved);
          paths[infographic.path] = resolved;
        } catch (err) {
          console.error(
            `[AssetsView] Failed to resolve infographic path for ${infographic.name}:`,
            err,
          );
        }
      }
      setInfographicPaths(paths);
      console.log('[AssetsView] All infographic paths resolved:', Object.keys(paths).length);
    };

    resolvePaths();
  }, [projectDirectory, generatedInfographics]);

  useEffect(() => {
    if (!projectDirectory || importedAssets.length === 0) {
      setImportedDisplayPaths({});
      return;
    }

    const resolvePaths = async () => {
      const nextPaths: Record<string, string> = {};
      for (const asset of importedAssets) {
        try {
          const resolved = await resolveAssetPathForDisplay(
            asset.path,
            projectDirectory,
          );
          nextPaths[asset.path] = resolved;
        } catch (error) {
          console.warn('[AssetsView] Failed to resolve imported asset path:', {
            assetPath: asset.path,
            error,
          });
        }
      }
      setImportedDisplayPaths(nextPaths);
    };

    resolvePaths();
  }, [projectDirectory, importedAssets]);

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
  const hasAnyAssets =
    importedAssets.length > 0 ||
    generatedImages.length > 0 ||
    generatedVideos.length > 0 ||
    generatedInfographics.length > 0;

  if (!isLoadingMedia && !hasAnyAssets) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <ImageIcon size={48} className={styles.emptyIcon} />
          <h3>No Assets Yet</h3>
          <p>Import media or generate assets to populate this view</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.container}>
        <div
          className={styles.content}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setIsDragOver(false);
            }
          }}
          onDrop={handleDropImport}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            onChange={handleFileInputChange}
            className={styles.hiddenFileInput}
          />

          <div className={styles.importHeader}>
            <div className={styles.searchBox}>
              <Search size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search imported assets"
              />
            </div>
            <button
              type="button"
              className={styles.importButton}
              onClick={handleFilePickerImport}
              disabled={!!importingAssetPath}
            >
              <Upload size={14} />
              <span>{importingAssetPath ? 'Importing...' : 'Import Media'}</span>
            </button>
            <button
              type="button"
              className={styles.aiTabPlaceholder}
              disabled
              title="AI-assisted asset tools coming soon"
            >
              AI
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Upload size={16} />
              <h3>Imported Assets</h3>
              <span className={styles.count}>{filteredImportedAssets.length}</span>
            </div>
            <div className={styles.importHint}>
              Double-click an asset to place it on the timeline.
            </div>
            <div className={styles.grid}>
              {filteredImportedAssets.length === 0 ? (
                <div className={styles.emptySection}>
                  <p>Import media to add local clips, audio, text, and overlays</p>
                </div>
              ) : (
                filteredImportedAssets.map((asset) => {
                  const displayPath = importedDisplayPaths[asset.path];
                  const isMissing = Boolean(missingImportedPaths[asset.path]);
                  return (
                    <div
                      key={asset.id}
                      className={styles.mediaCard}
                      onDoubleClick={() => {
                        if (!isMissing) {
                          appendImportedAssetToTimeline(asset);
                        }
                      }}
                    >
                      <div className={styles.mediaThumbnail}>
                        {asset.type === 'image' && displayPath && (
                          <img
                            src={displayPath}
                            alt={asset.name}
                            className={styles.thumbnailImage}
                          />
                        )}
                        {(asset.type === 'video' || asset.type === 'audio') && (
                          <div className={styles.mediaPlaceholder}>
                            {asset.type === 'video' ? (
                              <Video size={32} />
                            ) : (
                              <Music size={32} />
                            )}
                          </div>
                        )}
                        {isMissing && (
                          <div className={styles.missingBadge}>
                            <AlertTriangle size={12} />
                            <span>Missing</span>
                          </div>
                        )}
                      </div>
                      <div className={styles.mediaName}>{asset.name}</div>
                      {isMissing && (
                        <button
                          type="button"
                          className={styles.replaceButton}
                          onClick={() => handleReplaceImportedAsset(asset)}
                        >
                          <RefreshCw size={12} />
                          <span>Replace</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {isDragOver && (
            <div className={styles.dropOverlay}>
              <div className={styles.dropOverlayContent}>
                Drop files to import into `.kshana/assets`
              </div>
            </div>
          )}

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

          {/* Generated Infographics Section */}
          {(generatedInfographics.length > 0 || isLoadingMedia) && (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <ImagePlus size={16} />
                <h3>Generated Infographics</h3>
                <span className={styles.count}>
                  {generatedInfographics.length}
                </span>
              </div>
              <div className={styles.grid}>
                {isLoadingMedia ? (
                  <div className={styles.emptySection}>
                    <p>Loading infographics...</p>
                  </div>
                ) : generatedInfographics.length > 0 ? (
                  generatedInfographics.map((infographic) => {
                    const videoSrc = infographicPaths[infographic.path];
                    if (!videoSrc) {
                      console.warn('[AssetsView] No video src for infographic:', infographic.name, infographic.path);
                    }
                    return (
                      <div
                        key={infographic.path}
                        className={styles.mediaCard}
                        onClick={() => setSelectedInfographic(infographic)}
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
                              <ImagePlus size={32} />
                            </div>
                          )}
                        </div>
                        <div className={styles.mediaName}>
                          {infographic.name}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptySection}>
                    <p>No generated infographics yet</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && imagePaths[selectedImage.path] && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedImage(null)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
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
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
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

      {/* Infographic Modal */}
      {selectedInfographic &&
        infographicPaths[selectedInfographic.path] && (
          <div
            className={styles.modalOverlay}
            onClick={() => setSelectedInfographic(null)}
          >
            <div
              className={styles.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.modalClose}
                onClick={() => setSelectedInfographic(null)}
                aria-label="Close"
              >
                <X size={24} />
              </button>
              <video
                src={infographicPaths[selectedInfographic.path]}
                controls
                autoPlay
                className={styles.modalVideo}
              />
              <div className={styles.modalTitle}>
                {selectedInfographic.name}
              </div>
            </div>
          </div>
        )}
    </>
  );
}
