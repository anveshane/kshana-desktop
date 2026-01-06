import React, { useMemo } from 'react';
import { FileImage, FileVideo } from 'lucide-react';
import type { StoryboardScene } from '../../../types/projectState';
import { useProject } from '../../../contexts/ProjectContext';
import type { SceneVersions } from '../../../types/kshana/timeline';
import styles from './VersionSelector.module.scss';

export interface SceneVersion {
  sceneNumber: number;
  imageVersions: number[];
  videoVersions: number[];
}

interface VersionSelectorProps {
  sceneBlocks: Array<{
    scene: StoryboardScene;
    startTime: number;
    duration: number;
  }>;
  activeVersions?: Record<number, SceneVersions>; // sceneNumber -> { image?: number, video?: number }
  onVersionSelect?: (
    sceneNumber: number,
    assetType: 'image' | 'video',
    version: number,
  ) => void;
}

export default function VersionSelector({
  sceneBlocks,
  activeVersions = {},
  onVersionSelect,
}: VersionSelectorProps) {
  const { assetManifest } = useProject();

  // Get both image and video versions from asset manifest (source of truth)
  const sceneVersions = useMemo(() => {
    if (!assetManifest?.assets || sceneBlocks.length === 0) {
      return [];
    }

    return sceneBlocks.map((block) => {
      const sceneNumber = block.scene.scene_number;

      // Filter assets for this scene by type
      const imageAssets = assetManifest.assets.filter(
        (asset) =>
          asset.type === 'scene_image' && asset.scene_number === sceneNumber,
      );
      const videoAssets = assetManifest.assets.filter(
        (asset) =>
          asset.type === 'scene_video' && asset.scene_number === sceneNumber,
      );

      // Extract and sort version numbers
      const imageVersions = imageAssets
        .map((asset) => asset.version)
        .sort((a, b) => a - b);
      const videoVersions = videoAssets
        .map((asset) => asset.version)
        .sort((a, b) => a - b);

      return {
        sceneNumber,
        imageVersions,
        videoVersions,
      };
    });
  }, [assetManifest, sceneBlocks]);

  const handleVersionClick = (
    sceneNumber: number,
    assetType: 'image' | 'video',
    version: number,
  ): void => {
    if (onVersionSelect) {
      onVersionSelect(sceneNumber, assetType, version);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Versions</span>
      </div>
      <div className={styles.versionsList}>
        {sceneVersions.map((sceneVersion) => {
          // Only show scenes that have at least one version (image or video)
          if (
            sceneVersion.imageVersions.length === 0 &&
            sceneVersion.videoVersions.length === 0
          ) {
            return null;
          }

          const activeVersionsForScene =
            activeVersions[sceneVersion.sceneNumber] || {};
          const activeImageVersion =
            activeVersionsForScene.image ?? sceneVersion.imageVersions[0];
          const activeVideoVersion =
            activeVersionsForScene.video ?? sceneVersion.videoVersions[0];

          return (
            <div
              key={sceneVersion.sceneNumber}
              className={styles.sceneVersions}
            >
              <div className={styles.sceneLabel}>
                SCN_{String(sceneVersion.sceneNumber).padStart(2, '0')}
              </div>

              {/* Image Versions */}
              {sceneVersion.imageVersions.length > 0 && (
                <div className={styles.assetTypeSection}>
                  <div className={styles.assetTypeLabel}>
                    <FileImage size={12} />
                    <span>Image</span>
                  </div>
                  <div className={styles.versionBadges}>
                    {sceneVersion.imageVersions.map((version) => {
                      const isActive = version === activeImageVersion;
                      return (
                        <button
                          key={`image-${version}`}
                          type="button"
                          className={`${styles.versionBadge} ${isActive ? styles.active : ''}`}
                          onClick={() =>
                            handleVersionClick(
                              sceneVersion.sceneNumber,
                              'image',
                              version,
                            )
                          }
                          title={`Scene ${sceneVersion.sceneNumber} - Image Version ${version}`}
                        >
                          v{version}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Video Versions */}
              {sceneVersion.videoVersions.length > 0 && (
                <div className={styles.assetTypeSection}>
                  <div className={styles.assetTypeLabel}>
                    <FileVideo size={12} />
                    <span>Video</span>
                  </div>
                  <div className={styles.versionBadges}>
                    {sceneVersion.videoVersions.map((version) => {
                      const isActive = version === activeVideoVersion;
                      return (
                        <button
                          key={`video-${version}`}
                          type="button"
                          className={`${styles.versionBadge} ${isActive ? styles.active : ''}`}
                          onClick={() =>
                            handleVersionClick(
                              sceneVersion.sceneNumber,
                              'video',
                              version,
                            )
                          }
                          title={`Scene ${sceneVersion.sceneNumber} - Video Version ${version}`}
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
