/* eslint-disable react/require-default-props */
import { useState, useEffect, useCallback } from 'react';
import { User, MapPin, Package, Image as ImageIcon, FileText } from 'lucide-react';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import { useProject } from '../../../contexts/ProjectContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { generateSlug } from '../../../utils/slug';
import MarkdownPreview from '../MarkdownPreview';
import styles from './AssetCard.module.scss';

export type AssetType = 'character' | 'location' | 'prop';

export interface AssetCardProps {
  type: AssetType;
  name: string;
  description?: string;
  imagePath?: string;
  projectDirectory?: string;
  metadata?: Record<string, string | number | undefined>;
  slug?: string; // Optional slug, will be auto-generated from name if not provided
}

const TYPE_ICONS = {
  character: User,
  location: MapPin,
  prop: Package,
};

const TYPE_COLORS = {
  character: 'cyan',
  location: 'green',
  prop: 'orange',
} as const;

export default function AssetCard({
  type,
  name,
  description = '',
  imagePath = '',
  projectDirectory = '',
  metadata = {},
  slug,
}: AssetCardProps) {
  const [imageError, setImageError] = useState(false);
  const [fullImagePath, setFullImagePath] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(false);
  const { useMockData } = useProject();
  const { projectDirectory: workspaceProjectDir } = useWorkspace();

  const effectiveProjectDir = projectDirectory || workspaceProjectDir || '';
  const assetSlug = slug || generateSlug(name);

  const Icon = TYPE_ICONS[type];
  const colorClass = styles[TYPE_COLORS[type]];

  // Resolve image path asynchronously and convert to base64 if needed
  useEffect(() => {
    if (!imagePath) {
      setFullImagePath('');
      return;
    }

    resolveAssetPathForDisplay(
      imagePath,
      projectDirectory || null,
      useMockData,
    ).then(async (resolved) => {
      // For test images in mock mode, try to convert to base64
      if (shouldUseBase64(resolved, useMockData)) {
        const base64 = await imageToBase64(resolved);
        if (base64) {
          setFullImagePath(base64);
          return;
        }
      }
      // Fallback to file:// path
      setFullImagePath(resolved);
    });
  }, [imagePath, projectDirectory, useMockData]);

  const hasImage = fullImagePath && !imageError;

  // Determine markdown file path based on asset type
  const getMarkdownPath = useCallback((): string => {
    const basePath = effectiveProjectDir || '/mock';
    const agentPath = `${basePath}/.kshana/agent`;
    
    switch (type) {
      case 'character':
        return `${agentPath}/characters/${assetSlug}/character.md`;
      case 'location':
        return `${agentPath}/settings/${assetSlug}/setting.md`;
      case 'prop':
        return `${agentPath}/props/${assetSlug}/prop.md`;
      default:
        return '';
    }
  }, [type, assetSlug, effectiveProjectDir]);

  // Load markdown content when preview is opened
  const handleViewDetails = useCallback(async () => {
    setIsPreviewOpen(true);
    setIsLoadingMarkdown(true);
    
    const markdownPath = getMarkdownPath();
    if (!markdownPath) {
      setMarkdownContent('# ' + name + '\n\nNo details available.');
      setIsLoadingMarkdown(false);
      return;
    }

    try {
      const content = await window.electron.project.readFile(markdownPath);
      if (content !== null) {
        setMarkdownContent(content);
      } else {
        setMarkdownContent(`# ${name}\n\n${description || 'No details available.'}`);
      }
    } catch (error) {
      console.error('Failed to load markdown:', error);
      setMarkdownContent(`# ${name}\n\n${description || 'No details available.'}`);
    } finally {
      setIsLoadingMarkdown(false);
    }
  }, [getMarkdownPath, name, description]);

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setMarkdownContent('');
  }, []);

  return (
    <>
      <div className={styles.card}>
        <div className={styles.imageContainer}>
        {hasImage ? (
          <img
            src={fullImagePath}
            alt={name}
            className={styles.image}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={`${styles.placeholder} ${colorClass}`}>
            <Icon size={32} className={styles.placeholderIcon} />
          </div>
        )}
        <span className={`${styles.typeBadge} ${colorClass}`}>
          <Icon size={12} />
          {type}
        </span>
        </div>

        <div className={styles.content}>
        <h4 className={styles.name}>{name}</h4>
        {description && <p className={styles.description}>{description}</p>}

        {metadata && Object.keys(metadata).length > 0 && (
          <div className={styles.metadata}>
            {Object.entries(metadata).map(
              ([key, value]) =>
                value !== undefined && (
                  <span key={key} className={styles.metaItem}>
                    <span className={styles.metaKey}>{key}:</span>
                    <span className={styles.metaValue}>{value}</span>
                  </span>
                ),
            )}
          </div>
        )}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.viewDetailsButton}
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetails();
            }}
            title="View details"
          >
            <FileText size={12} />
            View Details
          </button>
          {hasImage ? (
            <span className={styles.statusGenerated}>
              <span className={styles.statusDot} />
              Reference Ready
            </span>
          ) : (
            <span className={styles.statusPending}>
              <ImageIcon size={12} />
              No Reference
            </span>
          )}
        </div>
        </div>
      </div>
      <MarkdownPreview
      isOpen={isPreviewOpen}
      title={name}
      content={isLoadingMarkdown ? 'Loading...' : markdownContent || 'Loading...'}
      onClose={handleClosePreview}
    />
  </>
  );
}
