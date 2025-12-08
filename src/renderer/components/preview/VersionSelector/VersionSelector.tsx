import React from 'react';
import type { StoryboardScene } from '../../../types/projectState';
import styles from './VersionSelector.module.scss';

export interface SceneVersion {
  sceneNumber: number;
  versions: number[]; // [1, 2, 3] for v1, v2, v3
}

interface VersionSelectorProps {
  sceneBlocks: Array<{
    scene: StoryboardScene;
    startTime: number;
    duration: number;
  }>;
  activeVersions?: Record<number, number>; // sceneNumber -> activeVersion
  onVersionSelect?: (sceneNumber: number, version: number) => void;
}

// Mock version data - can be replaced with real data later
const generateMockVersions = (
  sceneBlocks: Array<{ scene: StoryboardScene }>,
): SceneVersion[] => {
  return sceneBlocks.map((block) => ({
    sceneNumber: block.scene.scene_number,
    versions: [1, 2, 3], // Mock: all scenes have 3 versions
  }));
};

export default function VersionSelector({
  sceneBlocks,
  activeVersions = {},
  onVersionSelect,
}: VersionSelectorProps) {
  const sceneVersions = React.useMemo(
    () => generateMockVersions(sceneBlocks),
    [sceneBlocks],
  );

  const handleVersionClick = (
    sceneNumber: number,
    version: number,
  ): void => {
    if (onVersionSelect) {
      onVersionSelect(sceneNumber, version);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Versions</span>
      </div>
      <div className={styles.versionsList}>
        {sceneVersions.map((sceneVersion) => {
          const activeVersion =
            activeVersions[sceneVersion.sceneNumber] || sceneVersion.versions[0];
          return (
            <div key={sceneVersion.sceneNumber} className={styles.sceneVersions}>
              <div className={styles.sceneLabel}>
                SCN_{String(sceneVersion.sceneNumber).padStart(2, '0')}
              </div>
              <div className={styles.versionBadges}>
                {sceneVersion.versions.map((version) => {
                  const isActive = version === activeVersion;
                  return (
                    <button
                      key={version}
                      type="button"
                      className={`${styles.versionBadge} ${isActive ? styles.active : ''}`}
                      onClick={() =>
                        handleVersionClick(sceneVersion.sceneNumber, version)
                      }
                      title={`Scene ${sceneVersion.sceneNumber} - Version ${version}`}
                    >
                      v{version}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

