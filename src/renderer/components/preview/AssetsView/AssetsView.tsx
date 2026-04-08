import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Image as ImageIcon, Video, X, Play, ImagePlus } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { FileNode, getFileType } from '../../../../shared/fileSystemTypes';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import {
  buildProjectAbsolutePath,
  getFinalVideoStateWarning,
  getManifestFinalVideoAsset,
} from '../../../services/project/finalVideoValidation';
import styles from './AssetsView.module.scss';

interface MediaAsset {
  name: string;
  path: string;
  type: 'image' | 'video';
  category: 'images' | 'videos' | 'infographics';
}

const MEDIA_SCAN_ROOTS = ['assets', 'characters', 'settings', 'scenes'];
const MAX_SCAN_DEPTH = 5;

const normalizeMediaPath = (
  filePath: string,
  projectDirectory: string | null,
): string => {
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const normalizedProjectDirectory = projectDirectory
    ?.trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');

  if (
    normalizedProjectDirectory &&
    (normalizedPath === normalizedProjectDirectory ||
      normalizedPath.startsWith(`${normalizedProjectDirectory}/`))
  ) {
    return normalizedPath.slice(normalizedProjectDirectory.length + 1);
  }

  return normalizedPath;
};

const assetKey = (
  asset: Pick<MediaAsset, 'path' | 'category'>,
  projectDirectory: string | null,
): string =>
  `${asset.category}:${normalizeMediaPath(asset.path, projectDirectory)}`;

const mediaNameFromPath = (filePath: string): string => {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath;
};

const inferCategoryFromManifest = (
  path: string,
  type?: string,
): MediaAsset['category'] | null => {
  if (type === 'scene_infographic' || /infographic/i.test(path)) {
    return 'infographics';
  }

  if (
    type === 'scene_video' ||
    type === 'final_video' ||
    type === 'scene_dialogue_audio' ||
    type === 'scene_music' ||
    type === 'scene_sfx' ||
    type === 'scene_audio_mix'
  ) {
    return 'videos';
  }

  if (
    type === 'character_ref' ||
    type === 'setting_ref' ||
    type === 'scene_image' ||
    type === 'scene_thumbnail'
  ) {
    return 'images';
  }

  const ext = path.split('.').pop()?.toLowerCase();
  const fileType = getFileType(ext ? `.${ext}` : undefined);
  if (fileType === 'image') {
    return 'images';
  }
  if (fileType === 'video') {
    return /infographic/i.test(path) ? 'infographics' : 'videos';
  }

  return null;
};

const classifyScannedMedia = (
  node: FileNode,
  projectDirectory: string | null,
): Pick<MediaAsset, 'name' | 'path' | 'type' | 'category'> | null => {
  if (node.type !== 'file') {
    return null;
  }

  const fileType = getFileType(node.extension);
  if (fileType !== 'image' && fileType !== 'video') {
    return null;
  }

  const normalizedPath = node.path.replace(/\\/g, '/');
  if (
    !MEDIA_SCAN_ROOTS.some((segment) => normalizedPath.includes(`/${segment}/`))
  ) {
    return null;
  }

  const category =
    fileType === 'video' && /infographic/i.test(normalizedPath)
      ? 'infographics'
      : fileType === 'video'
        ? 'videos'
        : 'images';

  return {
    name: node.name,
    path: normalizeMediaPath(normalizedPath, projectDirectory),
    type: fileType,
    category,
  };
};

const collectScannedMedia = (
  node: FileNode,
  map: Map<string, MediaAsset>,
  projectDirectory: string | null,
): void => {
  const media = classifyScannedMedia(node, projectDirectory);
  if (media) {
    const key = assetKey(media, projectDirectory);
    if (!map.has(key)) {
      map.set(key, media);
    }
  }

  node.children?.forEach((child) =>
    collectScannedMedia(child, map, projectDirectory),
  );
};

export default function AssetsView() {
  const { projectDirectory } = useWorkspace();
  const { assetManifest, agentState } = useProject();

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
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const fileChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const currentLoadIdRef = useRef(0);
  const [validFinalVideoPaths, setValidFinalVideoPaths] = useState<Set<string> | null>(
    null,
  );
  const manifestFinalVideoAsset = useMemo(
    () => getManifestFinalVideoAsset(agentState, assetManifest),
    [agentState, assetManifest],
  );
  const finalVideoWarning = useMemo(
    () =>
      getFinalVideoStateWarning(
        agentState,
        assetManifest,
        projectDirectory,
        manifestFinalVideoAsset && validFinalVideoPaths
          ? validFinalVideoPaths.has(
              normalizeMediaPath(manifestFinalVideoAsset.path, projectDirectory),
            )
          : undefined,
      ),
    [
      agentState,
      assetManifest,
      projectDirectory,
      manifestFinalVideoAsset,
      validFinalVideoPaths,
    ],
  );

  const hasAnyAssetsRef = useRef(false);

  useEffect(() => {
    hasAnyAssetsRef.current =
      generatedImages.length > 0 ||
      generatedVideos.length > 0 ||
      generatedInfographics.length > 0;
  }, [generatedImages.length, generatedVideos.length, generatedInfographics.length]);

  useEffect(() => {
    let cancelled = false;

    const verifyFinalVideos = async () => {
      if (!projectDirectory || !assetManifest?.assets?.length) {
        if (!cancelled) {
          setValidFinalVideoPaths(new Set());
        }
        return;
      }

      const finalVideoAssets = assetManifest.assets.filter(
        (asset) => asset.type === 'final_video',
      );
      const nextValidPaths = new Set<string>();

      await Promise.all(
        finalVideoAssets.map(async (asset) => {
          const absolutePath = buildProjectAbsolutePath(
            projectDirectory,
            asset.path,
          );
          if (
            await window.electron.project.checkFileExists(absolutePath)
          ) {
            nextValidPaths.add(
              normalizeMediaPath(asset.path, projectDirectory),
            );
          }
        }),
      );

      if (!cancelled) {
        setValidFinalVideoPaths(nextValidPaths);
      }
    };

    void verifyFinalVideos();
    return () => {
      cancelled = true;
    };
  }, [assetManifest, projectDirectory]);

  const areMediaListsEqual = (
    left: MediaAsset[],
    right: MediaAsset[],
  ): boolean => {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((asset, index) => {
      const other = right[index];
      return (
        other &&
        asset.name === other.name &&
        asset.path === other.path &&
        asset.type === other.type &&
        asset.category === other.category
      );
    });
  };

  const loadMediaFiles = useCallback(async (options?: { background?: boolean }) => {
    if (!projectDirectory) {
      setGeneratedImages([]);
      setGeneratedVideos([]);
      setGeneratedInfographics([]);
      return;
    }

    if (refreshInFlightRef.current) {
      pendingRefreshRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    const loadId = currentLoadIdRef.current + 1;
    currentLoadIdRef.current = loadId;

    const shouldShowLoading =
      !options?.background && !hasAnyAssetsRef.current;

    if (shouldShowLoading) {
      setIsLoadingMedia(true);
    }

    try {
      const discoveredMedia = new Map<string, MediaAsset>();

      for (const asset of assetManifest?.assets || []) {
        if (
          asset.type === 'final_video' &&
          !validFinalVideoPaths?.has(
            normalizeMediaPath(asset.path, projectDirectory),
          )
        ) {
          continue;
        }
        const category = inferCategoryFromManifest(asset.path, asset.type);
        if (!category) {
          continue;
        }

        const media: MediaAsset = {
          name: mediaNameFromPath(asset.path),
          path: normalizeMediaPath(asset.path, projectDirectory),
          type: category === 'images' ? 'image' : 'video',
          category,
        };
        discoveredMedia.set(assetKey(media, projectDirectory), media);
      }

      try {
        const projectTree = await window.electron.project.readTree(
          projectDirectory,
          MAX_SCAN_DEPTH,
        );
        collectScannedMedia(projectTree, discoveredMedia, projectDirectory);
      } catch (error) {
        console.error(
          '[AssetsView] Failed to scan project tree for media:',
          error,
        );
      }

      const allMedia = Array.from(discoveredMedia.values()).sort(
        (left, right) => left.name.localeCompare(right.name),
      );
      const filteredMedia = allMedia.filter((asset) => {
        const normalizedPath = normalizeMediaPath(asset.path, projectDirectory);
        if (!normalizedPath.includes('assets/final_video/')) {
          return true;
        }
        return validFinalVideoPaths?.has(normalizedPath) ?? false;
      });

      const nextGeneratedImages = filteredMedia.filter(
        (asset) => asset.category === 'images',
      );
      const nextGeneratedVideos = filteredMedia.filter(
        (asset) => asset.category === 'videos',
      );
      const nextGeneratedInfographics = filteredMedia.filter(
        (asset) => asset.category === 'infographics',
      );

      if (currentLoadIdRef.current !== loadId) {
        return;
      }

      setGeneratedImages((prev) =>
        areMediaListsEqual(prev, nextGeneratedImages)
          ? prev
          : nextGeneratedImages,
      );
      setGeneratedVideos((prev) =>
        areMediaListsEqual(prev, nextGeneratedVideos)
          ? prev
          : nextGeneratedVideos,
      );
      setGeneratedInfographics((prev) =>
        areMediaListsEqual(prev, nextGeneratedInfographics)
          ? prev
          : nextGeneratedInfographics,
      );
    } catch (err) {
      console.error('Failed to load media files:', err);
    } finally {
      if (currentLoadIdRef.current === loadId && shouldShowLoading) {
        setIsLoadingMedia(false);
      }
      refreshInFlightRef.current = false;

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        void loadMediaFiles({ background: true });
      }
    }
  }, [assetManifest, projectDirectory, validFinalVideoPaths]);

  useEffect(() => {
    void loadMediaFiles();
  }, [loadMediaFiles]);

  useEffect(() => {
    const unsubscribe = window.electron.project.onFileChange((event) => {
      const normalizedPath = event.path.replace(/\\/g, '/');
      const isRelevantMediaChange =
        normalizedPath.includes('/assets/') ||
        normalizedPath.includes('/characters/') ||
        normalizedPath.includes('/settings/') ||
        normalizedPath.includes('/scenes/') ||
        normalizedPath.endsWith('/assets/manifest.json');

      if (isRelevantMediaChange) {
        if (fileChangeDebounceRef.current) {
          clearTimeout(fileChangeDebounceRef.current);
        }
        fileChangeDebounceRef.current = setTimeout(() => {
          fileChangeDebounceRef.current = null;
          void loadMediaFiles({ background: true });
        }, 250);
      }
    });

    return () => {
      if (fileChangeDebounceRef.current) {
        clearTimeout(fileChangeDebounceRef.current);
        fileChangeDebounceRef.current = null;
      }
      unsubscribe();
    };
  }, [loadMediaFiles]);

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
          console.log(
            '[AssetsView] Resolving infographic path:',
            infographic.path,
          );
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
      console.log(
        '[AssetsView] All infographic paths resolved:',
        Object.keys(paths).length,
      );
    };

    resolvePaths();
  }, [projectDirectory, generatedInfographics]);

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
    generatedImages.length > 0 ||
    generatedVideos.length > 0 ||
    generatedInfographics.length > 0;

  if (!isLoadingMedia && !hasAnyAssets) {
    return (
      <div className={styles.container}>
        {finalVideoWarning ? (
          <div className={styles.warningBanner}>{finalVideoWarning}</div>
        ) : null}
        <div className={styles.emptyState}>
          <ImageIcon size={48} className={styles.emptyIcon} />
          <h3>No Generated Assets Yet</h3>
          <p>Generated images, videos, and infographics will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.container}>
        {finalVideoWarning ? (
          <div className={styles.warningBanner}>{finalVideoWarning}</div>
        ) : null}
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
                      console.warn(
                        '[AssetsView] No video src for infographic:',
                        infographic.name,
                        infographic.path,
                      );
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
      {selectedInfographic && infographicPaths[selectedInfographic.path] && (
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
            <div className={styles.modalTitle}>{selectedInfographic.name}</div>
          </div>
        </div>
      )}
    </>
  );
}
