/* eslint-disable react/require-default-props */
import { useState, useEffect } from 'react';
import { User, MapPin, Package, Image as ImageIcon } from 'lucide-react';
import { resolveAssetPathForDisplay } from '../../../utils/pathResolver';
import { imageToBase64, shouldUseBase64 } from '../../../utils/imageToBase64';
import { useProject } from '../../../contexts/ProjectContext';
import styles from './AssetCard.module.scss';

export type AssetType = 'character' | 'location' | 'prop';

export interface AssetCardProps {
  type: AssetType;
  name: string;
  description?: string;
  imagePath?: string;
  projectDirectory?: string;
  metadata?: Record<string, string | number | undefined>;
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
}: AssetCardProps) {
  const [imageError, setImageError] = useState(false);
  const [fullImagePath, setFullImagePath] = useState<string>('');
  const { useMockData } = useProject();

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

  return (
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
  );
}
