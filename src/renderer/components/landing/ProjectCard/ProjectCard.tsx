import { useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { formatRelativeTime, shortenPath, toFileUrl } from '../projectDisplay';
import styles from './ProjectCard.module.scss';

export interface LandingProjectCard {
  path: string;
  name: string;
  lastOpened: number;
  description?: string | null;
  thumbnailPath?: string | null;
  sceneCount?: number | null;
  characterCount?: number | null;
}

interface ProjectCardProps {
  project: LandingProjectCard;
  onOpen: (path: string) => void;
}

export default function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumbnailUrl = useMemo(() => {
    if (!project.thumbnailPath || imageFailed) {
      return null;
    }
    return toFileUrl(project.thumbnailPath);
  }, [imageFailed, project.thumbnailPath]);

  const stats = useMemo(() => {
    const values: string[] = [];
    if (typeof project.sceneCount === 'number') {
      values.push(
        `${project.sceneCount} ${project.sceneCount === 1 ? 'scene' : 'scenes'}`,
      );
    }
    if (typeof project.characterCount === 'number') {
      values.push(
        `${project.characterCount} ${
          project.characterCount === 1 ? 'character' : 'characters'
        }`,
      );
    }
    return values.join(' · ');
  }, [project.characterCount, project.sceneCount]);

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onOpen(project.path)}
      title={project.path}
    >
      <div className={styles.media}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`${project.name} preview`}
            className={styles.thumbnail}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={styles.placeholder}>
            <FolderOpen size={22} />
            <span>Agentic Workspace</span>
          </div>
        )}
        <div className={styles.overlay}>
          <h3 className={styles.title}>{project.name}</h3>
          {project.description && (
            <p className={styles.description}>{project.description}</p>
          )}
          {stats && <p className={styles.stats}>{stats}</p>}
          <p className={styles.meta}>
            {shortenPath(project.path)} ·{' '}
            {formatRelativeTime(project.lastOpened)}
          </p>
        </div>
      </div>
    </button>
  );
}
