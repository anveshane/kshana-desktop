import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  AlertTriangle,
  AudioLines,
  Captions,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Circle,
  FileCode,
  FolderOpen,
  Headphones,
  Image as ImageIcon,
  Orbit,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Square,
  Star,
  Sticker,
  Triangle,
  Type,
  Upload,
  Video,
  WandSparkles,
  ArrowRight,
  Hexagon,
  RefreshCw,
} from 'lucide-react';
import { useProject } from '../../../contexts/ProjectContext';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import styles from './VideoPreviewLeftPanel.module.scss';

type LeftPanelTab = 'media' | 'text' | 'stickers' | 'graphics' | 'ai';

type LeftAssetType = 'video' | 'audio' | 'image';

export interface VideoPreviewLeftPanelAsset {
  id: string;
  name: string;
  type: LeftAssetType;
  path: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
  isMissing: boolean;
  metadata?: Record<string, unknown>;
}

export interface VideoPreviewLeftPanelProps {
  projectDirectory: string | null;
  playheadSeconds: number;
  onAddMediaToTimeline: (assetIdOrPath: string) => Promise<void> | void;
  onAddTextPreset: (
    preset: 'title' | 'subtitle' | 'lower-third' | 'caption',
  ) => Promise<void> | void;
  onAddSticker: (stickerId: string) => Promise<void> | void;
  onAddShape: (
    shapeType: 'rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'polygon',
  ) => Promise<void> | void;
  onImport: (sourcePath: string) => Promise<void>;
  onReplace: (assetId: string, sourcePath: string) => Promise<void>;
  onAddSvg?: (svgContentOrPath: string) => Promise<void> | void;
}

interface StickerItem {
  id: string;
  name: string;
  preview: string;
}

const STICKER_REGISTRY: StickerItem[] = [
  { id: 'emoji:smile', name: 'Smile', preview: '😊' },
  { id: 'emoji:star', name: 'Star', preview: '⭐' },
  { id: 'emoji:fire', name: 'Fire', preview: '🔥' },
  { id: 'emoji:rocket', name: 'Rocket', preview: '🚀' },
  { id: 'emoji:heart', name: 'Heart', preview: '❤️' },
  { id: 'emoji:check', name: 'Check', preview: '✅' },
  { id: 'flag:us', name: 'US Flag', preview: '🇺🇸' },
  { id: 'shape:circle', name: 'Circle', preview: '⚪' },
];

const GRAPHICS_PRESETS = [
  {
    id: 'bg-sunrise',
    name: 'Sunrise',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f97316"/><stop offset="55%" stop-color="#fb7185"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/></svg>',
  },
  {
    id: 'bg-midnight',
    name: 'Midnight',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111827"/><stop offset="55%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#0f766e"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/></svg>',
  },
  {
    id: 'bg-emerald',
    name: 'Emerald',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="50%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/></svg>',
  },
];

const PRIMARY_TAB_ITEMS = [
  { id: 'media' as const, label: 'Media', icon: FolderOpen },
  { id: 'text' as const, label: 'Text', icon: Type },
  { id: 'stickers' as const, label: 'Stickers', icon: Smile },
  { id: 'graphics' as const, label: 'Graphics', icon: WandSparkles },
  { id: 'ai' as const, label: 'AI', icon: ChevronsRight },
];

const SECONDARY_ICON_ITEMS = [
  { id: 'audio', label: 'Audio (Coming soon)', icon: Headphones },
  { id: 'captions', label: 'Captions (Coming soon)', icon: Captions },
  { id: 'effects', label: 'Effects (Coming soon)', icon: Orbit },
  { id: 'adjustments', label: 'Adjustments (Coming soon)', icon: SlidersHorizontal },
];

function inferAssetType(params: {
  assetType: string;
  path: string;
}): LeftAssetType | null {
  const loweredPath = params.path.toLowerCase();
  if (
    params.assetType === 'final_audio' ||
    /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(loweredPath)
  ) {
    return 'audio';
  }
  if (
    params.assetType === 'scene_image' ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(loweredPath)
  ) {
    return 'image';
  }
  if (
    params.assetType === 'scene_video' ||
    params.assetType === 'final_video' ||
    /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(loweredPath)
  ) {
    return 'video';
  }
  return null;
}

function formatDuration(duration: number | undefined): string | null {
  if (!duration || duration <= 0) return null;
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatResolution(
  width: number | undefined,
  height: number | undefined,
): string | null {
  if (!width || !height) return null;
  return `${width}×${height}`;
}

export default function VideoPreviewLeftPanel({
  projectDirectory,
  playheadSeconds,
  onAddMediaToTimeline,
  onAddTextPreset,
  onAddSticker,
  onAddShape,
  onImport,
  onReplace,
  onAddSvg,
}: VideoPreviewLeftPanelProps) {
  const { assetManifest } = useProject();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<LeftPanelTab>('media');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [missingByPath, setMissingByPath] = useState<Record<string, boolean>>({});
  const [resolvedImagePaths, setResolvedImagePaths] = useState<
    Record<string, string>
  >({});

  const activeTabLabel = useMemo(
    () =>
      PRIMARY_TAB_ITEMS.find((tabItem) => tabItem.id === activeTab)?.label ||
      'Media',
    [activeTab],
  );

  const mediaAssets = useMemo<VideoPreviewLeftPanelAsset[]>(() => {
    if (!assetManifest?.assets) return [];

    return assetManifest.assets.reduce<VideoPreviewLeftPanelAsset[]>(
      (acc, asset) => {
        const importedFlag = Boolean(asset.metadata?.imported);
        const inAssetsDir = asset.path.startsWith('.kshana/assets/');
        if (!importedFlag && !inAssetsDir) {
          return acc;
        }

        const mediaType = inferAssetType({
          assetType: asset.type,
          path: asset.path,
        });
        if (!mediaType) {
          return acc;
        }

        const metadata = (asset.metadata || {}) as Record<string, unknown>;
        acc.push({
          id: asset.id,
          name: asset.path.replace(/\\/g, '/').split('/').pop() || asset.id,
          type: mediaType,
          path: asset.path,
          thumbnail:
            typeof metadata.thumbnailPath === 'string'
              ? metadata.thumbnailPath
              : undefined,
          duration:
            typeof metadata.duration === 'number' ? metadata.duration : undefined,
          width: typeof metadata.width === 'number' ? metadata.width : undefined,
          height:
            typeof metadata.height === 'number' ? metadata.height : undefined,
          isMissing: false,
          metadata,
        });
        return acc;
      },
      [],
    );
  }, [assetManifest?.assets]);

  const filteredMediaAssets = useMemo(() => {
    if (!searchQuery.trim()) return mediaAssets;
    const query = searchQuery.trim().toLowerCase();
    return mediaAssets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(query) ||
        asset.path.toLowerCase().includes(query),
    );
  }, [mediaAssets, searchQuery]);

  const filteredStickers = useMemo(() => {
    if (!searchQuery.trim()) return STICKER_REGISTRY;
    const query = searchQuery.trim().toLowerCase();
    return STICKER_REGISTRY.filter(
      (sticker) =>
        sticker.name.toLowerCase().includes(query) ||
        sticker.id.toLowerCase().includes(query),
    );
  }, [searchQuery]);

  useEffect(() => {
    if (!projectDirectory || mediaAssets.length === 0) {
      setMissingByPath({});
      return;
    }

    let cancelled = false;
    const checkMissing = async () => {
      const checks = await Promise.all(
        mediaAssets.map(async (asset) => {
          const absolutePath =
            asset.path.startsWith('/') || /^[A-Za-z]:/.test(asset.path)
              ? asset.path
              : `${projectDirectory}/${asset.path}`;
          const exists =
            await window.electron.project.checkFileExists(absolutePath);
          return [asset.path, !exists] as const;
        }),
      );
      if (!cancelled) {
        setMissingByPath(Object.fromEntries(checks));
      }
    };

    checkMissing().catch(() => {
      if (!cancelled) {
        setMissingByPath({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectDirectory, mediaAssets]);

  useEffect(() => {
    if (!projectDirectory || mediaAssets.length === 0) {
      setResolvedImagePaths({});
      return;
    }

    const imageAssets = mediaAssets.filter((asset) => asset.type === 'image');
    if (imageAssets.length === 0) {
      setResolvedImagePaths({});
      return;
    }

    let cancelled = false;
    const resolvePaths = async () => {
      const entries = await Promise.all(
        imageAssets.map(async (asset) => {
          const resolved = await resolveAssetPathForDisplay(
            asset.path,
            projectDirectory,
          );
          return [asset.path, resolved] as const;
        }),
      );
      if (!cancelled) {
        setResolvedImagePaths(Object.fromEntries(entries));
      }
    };

    resolvePaths().catch(() => {
      if (!cancelled) {
        setResolvedImagePaths({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectDirectory, mediaAssets]);

  const handleImportPath = useCallback(
    async (sourcePath: string) => {
      if (!sourcePath) return;
      setImportingPath(sourcePath);
      try {
        await onImport(sourcePath);
      } finally {
        setImportingPath(null);
      }
    },
    [onImport],
  );

  const handleFileInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        const sourcePath = (file as File & { path?: string }).path;
        if (sourcePath) {
          // eslint-disable-next-line no-await-in-loop
          await handleImportPath(sourcePath);
        }
      }
      event.target.value = '';
    },
    [handleImportPath],
  );

  const handleDropImport = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(event.dataTransfer.files);
      for (const file of droppedFiles) {
        const sourcePath = (file as File & { path?: string }).path;
        if (sourcePath) {
          // eslint-disable-next-line no-await-in-loop
          await handleImportPath(sourcePath);
        }
      }
    },
    [handleImportPath],
  );

  const handleReplace = useCallback(
    async (asset: VideoPreviewLeftPanelAsset) => {
      const selectedPath =
        asset.type === 'audio'
          ? await window.electron.project.selectAudioFile()
          : asset.type === 'image'
            ? await window.electron.project.selectImageFile()
            : await window.electron.project.selectVideoFile();

      if (!selectedPath) return;
      await onReplace(asset.id, selectedPath);
    },
    [onReplace],
  );

  const handleSvgImport = useCallback(async () => {
    if (!onAddSvg) return;
    const selectedPath = await window.electron.project.selectImageFile();
    if (!selectedPath) return;

    if (!/\.svg$/i.test(selectedPath)) {
      alert('Please select an SVG file.');
      return;
    }

    const content = await window.electron.project.readFile(selectedPath);
    if (!content || !/<svg[\s>]/i.test(content)) {
      alert('Invalid SVG file. Please choose a valid SVG.');
      return;
    }

    await onAddSvg(content);
  }, [onAddSvg]);

  const renderMediaTab = () => (
    <div
      className={styles.tabContent}
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
        onChange={handleFileInput}
        className={styles.hiddenFileInput}
      />

      <div className={styles.mediaToolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search media"
          />
        </div>
        <button
          type="button"
          className={styles.importButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={!!importingPath}
        >
          <Upload size={14} />
          <span>{importingPath ? 'Importing...' : 'Import'}</span>
        </button>
      </div>

      <div className={styles.cardGrid}>
        {filteredMediaAssets.length === 0 ? (
          <div className={styles.emptyState}>
            <Upload size={26} />
            <p>No media assets</p>
            <span>Import files or drop them here to populate the panel.</span>
          </div>
        ) : (
          filteredMediaAssets.map((asset) => {
            const isMissing = Boolean(missingByPath[asset.path]);
            const duration = formatDuration(asset.duration);
            const resolution = formatResolution(asset.width, asset.height);
            const imageSrc = resolvedImagePaths[asset.path];

            return (
              <div
                key={asset.id}
                className={styles.assetCard}
                onDoubleClick={() => {
                  if (!isMissing) {
                    void onAddMediaToTimeline(asset.id);
                  }
                }}
                title={
                  isMissing
                    ? 'Missing file. Replace to relink.'
                    : 'Double-click to add to timeline'
                }
              >
                <div className={styles.assetThumbnail}>
                  {asset.type === 'image' && imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={asset.name}
                      className={styles.thumbnailImage}
                    />
                  ) : (
                    <div className={styles.assetTypeBadge}>
                      {asset.type === 'video' ? (
                        <Video size={18} />
                      ) : asset.type === 'audio' ? (
                        <AudioLines size={18} />
                      ) : (
                        <ImageIcon size={18} />
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

                <div className={styles.assetInfo}>
                  <div className={styles.assetName}>{asset.name}</div>
                  <div className={styles.assetMeta}>
                    {resolution && <span>{resolution}</span>}
                    {resolution && duration && <span>•</span>}
                    {duration && <span>{duration}</span>}
                  </div>
                </div>

                <div className={styles.assetActions}>
                  <button
                    type="button"
                    className={styles.addButton}
                    disabled={isMissing}
                    onClick={() => {
                      void onAddMediaToTimeline(asset.id);
                    }}
                  >
                    <Plus size={12} />
                    <span>Add</span>
                  </button>
                  {isMissing && (
                    <button
                      type="button"
                      className={styles.replaceButton}
                      onClick={() => {
                        void handleReplace(asset);
                      }}
                    >
                      <RefreshCw size={12} />
                      <span>Replace</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {isDragOver && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropOverlayText}>
            Drop files to import into project assets
          </div>
        </div>
      )}
    </div>
  );

  const renderTextTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>
        <Type size={14} />
        <span>Text Presets</span>
      </div>
      <div className={styles.buttonList}>
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => {
            void onAddTextPreset('title');
          }}
        >
          <div>
            <strong>Title</strong>
            <span>Large headline at playhead {playheadSeconds.toFixed(1)}s</span>
          </div>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => {
            void onAddTextPreset('subtitle');
          }}
        >
          <div>
            <strong>Subtitle</strong>
            <span>Support text block</span>
          </div>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => {
            void onAddTextPreset('lower-third');
          }}
        >
          <div>
            <strong>Lower Third</strong>
            <span>Name + role style caption</span>
          </div>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className={styles.presetButton}
          onClick={() => {
            void onAddTextPreset('caption');
          }}
        >
          <div>
            <strong>Caption</strong>
            <span>Small subtitle style cue</span>
          </div>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );

  const renderStickersTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>
        <Sticker size={14} />
        <span>Offline Stickers</span>
      </div>
      <div className={styles.stickerGrid}>
        {filteredStickers.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            className={styles.stickerCard}
            onClick={() => {
              void onAddSticker(sticker.id);
            }}
            title={`${sticker.name} (${sticker.id})`}
          >
            <span className={styles.stickerPreview}>{sticker.preview}</span>
            <span className={styles.stickerName}>{sticker.name}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderGraphicsTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>
        <Sparkles size={14} />
        <span>Graphics</span>
      </div>

      <div className={styles.graphicsSection}>
        <h4>Shapes</h4>
        <div className={styles.shapeGrid}>
          <button
            type="button"
            className={styles.shapeButton}
            onClick={() => {
              void onAddShape('rectangle');
            }}
          >
            <Square size={14} />
            <span>Rectangle</span>
          </button>
          <button
            type="button"
            className={styles.shapeButton}
            onClick={() => {
              void onAddShape('circle');
            }}
          >
            <Circle size={14} />
            <span>Circle</span>
          </button>
          <button
            type="button"
            className={styles.shapeButton}
            onClick={() => {
              void onAddShape('triangle');
            }}
          >
            <Triangle size={14} />
            <span>Triangle</span>
          </button>
          <button
            type="button"
            className={styles.shapeButton}
            onClick={() => {
              void onAddShape('star');
            }}
          >
            <Star size={14} />
            <span>Star</span>
          </button>
          <button
            type="button"
            className={styles.shapeButton}
            onClick={() => {
              void onAddShape('arrow');
            }}
          >
            <ArrowRight size={14} />
            <span>Arrow</span>
          </button>
          <button
            type="button"
            className={styles.shapeButton}
            onClick={() => {
              void onAddShape('polygon');
            }}
          >
            <Hexagon size={14} />
            <span>Polygon</span>
          </button>
        </div>
      </div>

      <div className={styles.graphicsSection}>
        <h4>SVG</h4>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!onAddSvg}
          onClick={() => {
            void handleSvgImport();
          }}
        >
          <FileCode size={14} />
          <span>Import SVG</span>
        </button>
      </div>

      <div className={styles.graphicsSection}>
        <h4>Background Presets</h4>
        <div className={styles.presetChipGrid}>
          {GRAPHICS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetChip}
              onClick={() => {
                if (onAddSvg) {
                  void onAddSvg(preset.svg);
                }
              }}
              disabled={!onAddSvg}
            >
              <span>{preset.name}</span>
              <Plus size={12} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAiTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.aiPlaceholder}>
        <WandSparkles size={20} />
        <strong>AI Tools Placeholder</strong>
        <p>AI-assisted media and graphics tools will land in a follow-up pass.</p>
      </div>
    </div>
  );

  return (
    <div className={`${styles.container} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.iconRail}>
        <div className={styles.iconRailPrimary}>
          {PRIMARY_TAB_ITEMS.map((tabItem) => {
            const TabIcon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                type="button"
                className={`${styles.iconButton} ${
                  activeTab === tabItem.id ? styles.iconButtonActive : ''
                }`}
                onClick={() => {
                  setActiveTab(tabItem.id);
                  if (isCollapsed) {
                    setIsCollapsed(false);
                  }
                }}
                title={tabItem.label}
                aria-label={tabItem.label}
              >
                <TabIcon size={22} />
              </button>
            );
          })}
        </div>

        <div className={styles.iconRailSecondary}>
          {SECONDARY_ICON_ITEMS.map((item) => {
            const RailIcon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={styles.iconButtonMuted}
                title={item.label}
                aria-label={item.label}
                disabled
              >
                <RailIcon size={20} />
              </button>
            );
          })}
        </div>

        <div className={styles.iconRailFooter}>
          <button
            type="button"
            className={styles.iconButtonMuted}
            title="Settings (Coming soon)"
            aria-label="Settings (Coming soon)"
            disabled
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className={styles.collapseToggle}
        onClick={() => setIsCollapsed((current) => !current)}
        aria-label={isCollapsed ? 'Expand left panel' : 'Collapse left panel'}
        title={isCollapsed ? 'Expand left panel' : 'Collapse left panel'}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={styles.panelArea} hidden={isCollapsed}>
        <div className={styles.panelHeader}>
          <h4>{activeTabLabel}</h4>
        </div>

        {activeTab === 'media' && renderMediaTab()}
        {activeTab === 'text' && renderTextTab()}
        {activeTab === 'stickers' && renderStickersTab()}
        {activeTab === 'graphics' && renderGraphicsTab()}
        {activeTab === 'ai' && renderAiTab()}
      </div>
    </div>
  );
}
