import { useMemo } from 'react';
import { Folder } from 'lucide-react';
import type { RecentProject } from '../../../../shared/fileSystemTypes';
import styles from './RecentProjects.module.scss';

interface RecentProjectsProps {
  projects: RecentProject[];
  onSelect: (path: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (weeks === 1) return 'Last week';
  return `${weeks} weeks ago`;
}

function shortenPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length > 3) {
    return `~/${parts.slice(-3).join('/')}`;
  }
  return filePath;
}

export default function RecentProjects({
  projects,
  onSelect,
}: RecentProjectsProps) {
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.lastOpened - a.lastOpened),
    [projects],
  );

  if (sortedProjects.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Recent Projects</h3>
      <ul className={styles.list}>
        {sortedProjects.map((project) => (
          <li key={project.path}>
            <button
              type="button"
              className={styles.projectItem}
              onClick={() => onSelect(project.path)}
            >
              <Folder size={16} className={styles.icon} />
              <span className={styles.path}>{shortenPath(project.path)}</span>
              <span className={styles.time}>
                {formatRelativeTime(project.lastOpened)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
