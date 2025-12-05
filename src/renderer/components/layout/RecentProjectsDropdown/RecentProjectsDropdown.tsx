import { useState, useRef, useEffect, useMemo } from 'react';
import { FolderOpen, Folder, ChevronDown } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type { RecentProject } from '../../../../shared/fileSystemTypes';
import styles from './RecentProjectsDropdown.module.scss';

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
  const parts = filePath.split('/');
  if (parts.length > 3) {
    return `~/${parts.slice(-3).join('/')}`;
  }
  return filePath;
}

export default function RecentProjectsDropdown() {
  const {
    recentProjects,
    openProject,
    isLoading,
    projectName,
    projectDirectory,
  } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedProjects = useMemo(
    () => [...recentProjects].sort((a, b) => b.lastOpened - a.lastOpened),
    [recentProjects],
  );

  const handleOpenProject = async () => {
    try {
      const selectedPath = await window.electron.project.selectDirectory();
      if (selectedPath) {
        await openProject(selectedPath);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  };

  const handleSelectProject = async (path: string) => {
    try {
      await openProject(path);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [isOpen]);

  const displayName =
    projectName || (projectDirectory ? shortenPath(projectDirectory) : null);

  return (
    <div ref={dropdownRef} className={styles.container}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setIsOpen(!isOpen)}
        title={displayName || 'Open Project (Ctrl+O)'}
        disabled={isLoading}
      >
        <FolderOpen size={16} />
        {displayName && (
          <span className={styles.projectName}>{displayName}</span>
        )}
        <ChevronDown size={14} className={styles.chevron} />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <button
            type="button"
            className={styles.dropdownItem}
            onClick={handleOpenProject}
          >
            <FolderOpen size={16} className={styles.icon} />
            <span>Open Project...</span>
          </button>

          {sortedProjects.length > 0 && (
            <>
              <div className={styles.divider} />
              {sortedProjects.map((project: RecentProject) => (
                <button
                  key={project.path}
                  type="button"
                  className={styles.dropdownItem}
                  onClick={() => handleSelectProject(project.path)}
                >
                  <Folder size={16} className={styles.icon} />
                  <div className={styles.projectInfo}>
                    <span className={styles.path}>
                      {shortenPath(project.path)}
                    </span>
                    <span className={styles.time}>
                      {formatRelativeTime(project.lastOpened)}
                    </span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
