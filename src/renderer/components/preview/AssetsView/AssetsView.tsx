import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Image as ImageIcon, Video, X, Play, ImagePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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

const resolveMediaDisplayPath = async (
  media: MediaAsset,
  projectDirectory: string,
): Promise<string> => {
  const resolved = await resolveAssetPathForDisplay(
    media.path,
    projectDirectory,
  );
  if (media.type === 'image' && shouldUseBase64(resolved)) {
    const base64 = await imageToBase64(resolved);
    if (base64) {
      return base64;
    }
  }
  return resolved;
};

interface LazyMediaCardProps {
  media: MediaAsset;
  projectDirectory: string;
  PlaceholderIcon: LucideIcon;
  onClick: () => void;
}

function LazyMediaCard({
  media,
  projectDirectory,
  PlaceholderIcon,
  onClick,
}: LazyMediaCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [shouldResolve, setShouldResolve] = useState(false);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  useEffect(() => {
    setShouldResolve(false);
    setResolvedPath(null);
  }, [media.path, projectDirectory]);

  useEffect(() => {
    if (shouldResolve) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldResolve(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldResolve(true);
          observer.disconnect();
        }
      },
      { rootMargin: '280px 0px' },
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [shouldResolve]);

  useEffect(() => {
    if (!shouldResolve) return undefined;

    let cancelled = false;
    resolveMediaDisplayPath(media, projectDirectory)
      .then((path) => {
        if (!cancelled) {
          setResolvedPath(path);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            `[AssetsView] Failed to resolve media path for ${media.name}:`,
            error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [media, projectDirectory, shouldResolve]);

  return (
    <div ref={cardRef} className={styles.mediaCard} onClick={onClick}>
      <div className={styles.mediaThumbnail}>
        {resolvedPath ? (
          media.type === 'image' ? (
            <img
              src={resolvedPath}
              alt={media.name}
              className={styles.thumbnailImage}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <>
              <video
                src={resolvedPath}
                className={styles.thumbnailVideo}
                preload="metadata"
                muted
              />
              <div className={styles.playOverlay}>
                <Play size={32} />
              </div>
            </>
          )
        ) : (
          <div className={styles.mediaPlaceholder}>
            <PlaceholderIcon size={32} />
          </div>
        )}
      </div>
      <div className={styles.mediaName}>{media.name}</div>
    </div>
  );
}

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
  const [selectedImagePath, setSelectedImagePath] = useState<string | null>(
    null,
  );
  const [selectedVideoPath, setSelectedVideoPath] = useState<string | null>(
    null,
  );
  const [selectedInfographicPath, setSelectedInfographicPath] = useState<
    string | null
  >(null);
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const fileChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const currentLoadIdRef = useRef(0);
  const [validFinalVideoPaths, setValidFinalVideoPaths] =
    useState<Set<string> | null>(null);
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
              normalizeMediaPath(
                manifestFinalVideoAsset.path,
                projectDirectory,
              ),
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
  }, [
    generatedImages.length,
    generatedVideos.length,
    generatedInfographics.length,
  ]);

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
          if (await window.electron.project.checkFileExists(absolutePath)) {
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

  const loadMediaFiles = useCallback(
    async (options?: { background?: boolean; scanTree?: boolean }) => {
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

      const shouldScanTree = options?.scanTree ?? true;

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

        if (shouldScanTree) {
          const start =
            process.env.NODE_ENV === 'development' ? performance.now() : 0;
          try {
            const projectTree = await window.electron.project.readTree(
              projectDirectory,
              MAX_SCAN_DEPTH,
            );
            collectScannedMedia(projectTree, discoveredMedia, projectDirectory);
            if (process.env.NODE_ENV === 'development') {
              // eslint-disable-next-line no-console
              console.debug(
                `[perf][AssetsView] readTree(depth=${MAX_SCAN_DEPTH}) ${(performance.now() - start).toFixed(1)}ms`,
              );
            }
          } catch (error) {
            console.error(
              '[AssetsView] Failed to scan project tree for media:',
              error,
            );
          }
        }

        const allMedia = Array.from(discoveredMedia.values()).sort(
          (left, right) => left.name.localeCompare(right.name),
        );
        const filteredMedia = allMedia.filter((asset) => {
          const normalizedPath = normalizeMediaPath(
            asset.path,
            projectDirectory,
          );
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
          void loadMediaFiles({ background: true, scanTree: true });
        }
      }
    },
    [assetManifest, projectDirectory, validFinalVideoPaths],
  );

  useEffect(() => {
    void loadMediaFiles({ scanTree: false });

    const scheduleDeepScan = () => {
      void loadMediaFiles({ background: true, scanTree: true });
    };

    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(scheduleDeepScan, {
        timeout: 1200,
      });
      return () => {
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(scheduleDeepScan, 250);
    return () => {
      clearTimeout(timeoutId);
    };
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
        const isBurstAssetWrite =
          normalizedPath.includes('/assets/images/') ||
          normalizedPath.includes('/assets/infographics/');
        fileChangeDebounceRef.current = setTimeout(
          () => {
            fileChangeDebounceRef.current = null;
            void loadMediaFiles({ background: true, scanTree: true });
          },
          isBurstAssetWrite ? 1000 : 500,
        );
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

  useEffect(() => {
    let cancelled = false;
    setSelectedImagePath(null);
    if (!selectedImage || !projectDirectory) return undefined;

    resolveMediaDisplayPath(selectedImage, projectDirectory)
      .then((path) => {
        if (!cancelled) setSelectedImagePath(path);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            `[AssetsView] Failed to resolve selected image ${selectedImage.name}:`,
            error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedImage, projectDirectory]);

  useEffect(() => {
    let cancelled = false;
    setSelectedVideoPath(null);
    if (!selectedVideo || !projectDirectory) return undefined;

    resolveMediaDisplayPath(selectedVideo, projectDirectory)
      .then((path) => {
        if (!cancelled) setSelectedVideoPath(path);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            `[AssetsView] Failed to resolve selected video ${selectedVideo.name}:`,
            error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVideo, projectDirectory]);

  useEffect(() => {
    let cancelled = false;
    setSelectedInfographicPath(null);
    if (!selectedInfographic || !projectDirectory) return undefined;

    resolveMediaDisplayPath(selectedInfographic, projectDirectory)
      .then((path) => {
        if (!cancelled) setSelectedInfographicPath(path);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(
            `[AssetsView] Failed to resolve selected infographic ${selectedInfographic.name}:`,
            error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedInfographic, projectDirectory]);

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
                  generatedImages.map((image) => (
                    <LazyMediaCard
                      key={image.path}
                      media={image}
                      projectDirectory={projectDirectory}
                      PlaceholderIcon={ImageIcon}
                      onClick={() => setSelectedImage(image)}
                    />
                  ))
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
                  generatedVideos.map((video) => (
                    <LazyMediaCard
                      key={video.path}
                      media={video}
                      projectDirectory={projectDirectory}
                      PlaceholderIcon={Video}
                      onClick={() => setSelectedVideo(video)}
                    />
                  ))
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
                  generatedInfographics.map((infographic) => (
                    <LazyMediaCard
                      key={infographic.path}
                      media={infographic}
                      projectDirectory={projectDirectory}
                      PlaceholderIcon={ImagePlus}
                      onClick={() => setSelectedInfographic(infographic)}
                    />
                  ))
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
      {selectedImage && selectedImagePath && (
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
              src={selectedImagePath}
              alt={selectedImage.name}
              className={styles.modalImage}
              decoding="async"
            />
            <div className={styles.modalTitle}>{selectedImage.name}</div>
          </div>
        </div>
      )}

      {/* Video Modal */}
      {selectedVideo && selectedVideoPath && (
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
              src={selectedVideoPath}
              controls
              autoPlay
              className={styles.modalVideo}
            />
            <div className={styles.modalTitle}>{selectedVideo.name}</div>
          </div>
        </div>
      )}

      {/* Infographic Modal */}
      {selectedInfographic && selectedInfographicPath && (
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
              src={selectedInfographicPath}
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
