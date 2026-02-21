import { useCallback, useState } from 'react';
import { Play, FolderOpen } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import RecentProjects from '../RecentProjects/RecentProjects';
import styles from './LandingScreen.module.scss';

const APP_VERSION = 'v1.0.6';

export default function LandingScreen() {
  const { recentProjects, openProject, isLoading } = useWorkspace();
  const [error, setError] = useState<string | null>(null);

  const handleOpenDirectory = useCallback(async () => {
    setError(null);
    try {
      const selectedPath = await window.electron.project.selectDirectory();
      if (selectedPath) {
        await openProject(selectedPath);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [openProject]);

  const handleSelectRecent = useCallback(
    async (path: string) => {
      setError(null);
      try {
        await openProject(path);
      } catch (err) {
        setError(`Failed to open project: ${(err as Error).message}`);
      }
    },
    [openProject],
  );

  return (
    <div className={styles.container}>
      <div className={styles.main}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <Play size={48} className={styles.playIcon} />
          </div>

          <h1 className={styles.title}>Kshana Desktop</h1>
          <p className={styles.subtitle}>
            Agentic Video Workspace. Mount a directory to begin.
          </p>

          <button
            type="button"
            className={styles.openButton}
            onClick={handleOpenDirectory}
            disabled={isLoading}
          >
            <FolderOpen size={18} />
            {isLoading ? 'Opening...' : 'Open Project Directory...'}
          </button>

          {error && <p className={styles.error}>{error}</p>}

          <RecentProjects
            projects={recentProjects}
            onSelect={handleSelectRecent}
          />
        </div>

        <footer className={styles.footer}>
          <span>{APP_VERSION}</span>
          <span className={styles.footerDivider}>·</span>
          <button type="button" className={styles.footerLink}>
            Help
          </button>
          <span className={styles.footerDivider}>·</span>
          <button type="button" className={styles.footerLink}>
            Settings
          </button>
        </footer>
      </div>
    </div>
  );
}
