import React, { useMemo } from 'react';
import { FileImage, FileVideo } from 'lucide-react';
import { useProject } from '../../../contexts/ProjectContext';
import type { SceneVersions } from '../../../types/kshana/timeline';
import type { TimelineItem } from '../../../hooks/useTimelineData';
import styles from './VersionSelector.module.scss';

export interface PlacementVersion {
  placementNumber: number;
  imageVersions: number[];
  videoVersions: number[];
}

interface VersionSelectorProps {
  timelineItems: TimelineItem[];
  activeVersions?: Record<number, SceneVersions>; // placementNumber -> { image?: number, video?: number }
  onVersionSelect?: (
    placementNumber: number,
    assetType: 'image' | 'video',
    version: number,
  ) => void;
}

export default function VersionSelector({
  timelineItems,
  activeVersions = {},
  onVersionSelect,
}: VersionSelectorProps) {
  const { assetManifest } = useProject();

  // Get both image and video versions from asset manifest by placementNumber
  const placementVersions = useMemo(() => {
    if (!assetManifest?.assets || timelineItems.length === 0) {
      return [];
    }

    // Get unique placement numbers from timeline items
    const placementNumbers = new Set<number>();
    timelineItems.forEach((item) => {
      if (item.placementNumber !== undefined) {
        placementNumbers.add(item.placementNumber);
      }
    });

    return Array.from(placementNumbers)
      .sort((a, b) => a - b)
      .map((placementNumber) => {
        // Filter assets for this placement by type and placementNumber
        const imageAssets = assetManifest.assets.filter(
          (asset) =>
            asset.type === 'scene_image' &&
            (asset.metadata?.placementNumber === placementNumber ||
              asset.scene_number === placementNumber), // Fallback to scene_number
        );
        const videoAssets = assetManifest.assets.filter(
          (asset) =>
            asset.type === 'scene_video' &&
            (asset.metadata?.placementNumber === placementNumber ||
              asset.scene_number === placementNumber), // Fallback to scene_number
        );

        // Extract and sort version numbers
        const imageVersions = imageAssets
          .map((asset) => asset.version)
          .sort((a, b) => a - b);
        const videoVersions = videoAssets
          .map((asset) => asset.version)
          .sort((a, b) => a - b);

        return {
          placementNumber,
          imageVersions,
          videoVersions,
        };
      })
      .filter(
        (pv) => pv.imageVersions.length > 0 || pv.videoVersions.length > 0,
      );
  }, [assetManifest, timelineItems]);

  const handleVersionClick = (
    placementNumber: number,
    assetType: 'image' | 'video',
    version: number,
  ): void => {
    if (onVersionSelect) {
      onVersionSelect(placementNumber, assetType, version);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Versions</span>
      </div>
      <div className={styles.versionsList}>
        {placementVersions.map((placementVersion) => {
          const activeVersionsForPlacement =
            activeVersions[placementVersion.placementNumber] || {};
          const activeImageVersion =
            activeVersionsForPlacement.image ??
            placementVersion.imageVersions[0];
          const activeVideoVersion =
            activeVersionsForPlacement.video ??
            placementVersion.videoVersions[0];

          return (
            <div
              key={placementVersion.placementNumber}
              className={styles.sceneVersions}
            >
              <div className={styles.sceneLabel}>
                PLM_{String(placementVersion.placementNumber).padStart(2, '0')}
              </div>

              {/* Image Versions */}
              {placementVersion.imageVersions.length > 0 && (
                <div className={styles.assetTypeSection}>
                  <div className={styles.assetTypeLabel}>
                    <FileImage size={12} />
                    <span>Image</span>
                  </div>
                  <div className={styles.versionBadges}>
                    {placementVersion.imageVersions.map((version) => {
                      const isActive = version === activeImageVersion;
                      return (
                        <button
                          key={`image-${version}`}
                          type="button"
                          className={`${styles.versionBadge} ${isActive ? styles.active : ''}`}
                          onClick={() =>
                            handleVersionClick(
                              placementVersion.placementNumber,
                              'image',
                              version,
                            )
                          }
                          title={`Placement ${placementVersion.placementNumber} - Image Version ${version}`}
                        >
                          v{version}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Video Versions */}
              {placementVersion.videoVersions.length > 0 && (
                <div className={styles.assetTypeSection}>
                  <div className={styles.assetTypeLabel}>
                    <FileVideo size={12} />
                    <span>Video</span>
                  </div>
                  <div className={styles.versionBadges}>
                    {placementVersion.videoVersions.map((version) => {
                      const isActive = version === activeVideoVersion;
                      return (
                        <button
                          key={`video-${version}`}
                          type="button"
                          className={`${styles.versionBadge} ${isActive ? styles.active : ''}`}
                          onClick={() =>
                            handleVersionClick(
                              placementVersion.placementNumber,
                              'video',
                              version,
                            )
                          }
                          title={`Placement ${placementVersion.placementNumber} - Video Version ${version}`}
                        >
                          v{version}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
