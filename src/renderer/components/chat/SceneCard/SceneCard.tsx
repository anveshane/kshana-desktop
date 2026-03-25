import { useState } from 'react';
import styles from './SceneCard.module.scss';

interface Shot {
  shotNumber: number;
  shotType: string;
  duration: number;
  prompt: string;
  dialogue?: string | null;
  cameraWork?: string;
  referenceImages?: string[];
}

interface SceneData {
  sceneNumber: number;
  sceneTitle?: string;
  shots: Shot[];
  totalSceneDuration?: number;
}

interface SceneCardProps {
  data: SceneData;
}

function ShotRow({ shot }: { shot: Shot }) {
  const [expanded, setExpanded] = useState(false);

  const typeClass =
    styles[shot.shotType as keyof typeof styles] || styles.default;

  return (
    <div className={styles.shot}>
      <div className={styles.shotHeader}>
        <span className={styles.shotNumber}>#{shot.shotNumber}</span>
        <span className={`${styles.shotTypeBadge} ${typeClass}`}>
          {shot.shotType.replace(/_/g, ' ')}
        </span>
        <span className={styles.shotDuration}>{shot.duration}s</span>
      </div>

      {shot.prompt && (
        <>
          <div
            className={`${styles.prompt} ${expanded ? styles.expanded : ''}`}
            onClick={() => setExpanded((v) => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
          >
            {shot.prompt}
          </div>
          {shot.prompt.length > 180 && (
            <button
              type="button"
              className={styles.promptToggle}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}

      {shot.dialogue && (
        <div className={styles.dialogue}>&ldquo;{shot.dialogue}&rdquo;</div>
      )}

      {shot.cameraWork && (
        <div className={styles.meta}>
          <span className={styles.metaIcon}>🎥</span>
          <span>{shot.cameraWork}</span>
        </div>
      )}
    </div>
  );
}

export default function SceneCard({ data }: SceneCardProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.sceneLabel}>Scene {data.sceneNumber}</span>
        {data.sceneTitle && (
          <span className={styles.sceneTitle}>{data.sceneTitle}</span>
        )}
        {data.totalSceneDuration != null && (
          <span className={styles.totalDuration}>
            {data.totalSceneDuration}s
          </span>
        )}
      </div>

      <div className={styles.shots}>
        {data.shots.map((shot) => (
          <ShotRow key={shot.shotNumber} shot={shot} />
        ))}
      </div>
    </div>
  );
}

export function tryParseSceneData(content: string): SceneData | null {
  try {
    const parsed = JSON.parse(content.trim());
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.sceneNumber === 'number' &&
      Array.isArray(parsed.shots) &&
      parsed.shots.length > 0
    ) {
      return parsed as SceneData;
    }
  } catch {
    // not valid JSON or not a scene
  }
  return null;
}
