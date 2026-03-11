import { Folder } from 'lucide-react';
import type { RecentProject } from '../../../../shared/fileSystemTypes';
import {
  formatRelativeTime,
  getProjectNameFromPath,
  sortRecentProjects,
} from '../projectDisplay';
import styles from './RecentProjectsList.module.scss';

interface RecentProjectsListProps {
  projects: RecentProject[];
  onSelect: (path: string) => void;
}

export default function RecentProjectsList({
  projects,
  onSelect,
}: RecentProjectsListProps) {
  const sortedProjects = sortRecentProjects(projects).slice(0, 8);

  if (sortedProjects.length === 0) {
    return <p className={styles.empty}>No recent projects</p>;
  }

  return (
    <ul className={styles.list}>
      {sortedProjects.map((project) => (
        <li key={project.path}>
          <button
            type="button"
            className={styles.item}
            onClick={() => onSelect(project.path)}
            title={project.path}
          >
            <Folder size={14} className={styles.icon} />
            <div className={styles.textBlock}>
              <span className={styles.name}>
                {getProjectNameFromPath(project.name || project.path)}
              </span>
              <span className={styles.time}>
                {formatRelativeTime(project.lastOpened)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
