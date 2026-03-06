import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, Plus, Play, Sparkles } from 'lucide-react';
import type { KshanaManifest, AgentProjectFile } from '../../../types/kshana';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { safeJsonParse } from '../../../utils/safeJsonParse';
import { useProject } from '../../../contexts/ProjectContext';
import type { LandingProjectCard } from '../ProjectCard/ProjectCard';
import ProjectCard from '../ProjectCard/ProjectCard';
import RecentProjectsList from '../RecentProjectsList/RecentProjectsList';
import { getProjectNameFromPath, sortRecentProjects } from '../projectDisplay';
import styles from './LandingScreen.module.scss';

const FALLBACK_APP_VERSION = 'v?.?.?';
const THUMBNAIL_CANDIDATES = [
  '.kshana/ui/thumbnail.jpg',
  '.kshana/ui/thumbnail.png',
  '.kshana/ui/thumbnail.webp',
  'thumbnail.jpg',
  'thumbnail.png',
  'thumbnail.webp',
];

interface ProjectMetadata {
  manifestName?: string;
  description?: string | null;
  sceneCount?: number | null;
  characterCount?: number | null;
  thumbnailPath?: string | null;
}

function joinPath(basePath: string, segment: string): string {
  const normalizedBase = basePath.replace(/\/+$/, '');
  const normalizedSegment = segment.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedSegment}`;
}

async function findThumbnailPath(
  projectPath: string,
  candidateIndex = 0,
): Promise<string | null> {
  if (candidateIndex >= THUMBNAIL_CANDIDATES.length) {
    return null;
  }

  const fullPath = joinPath(projectPath, THUMBNAIL_CANDIDATES[candidateIndex]);
  try {
    const exists = await window.electron.project.checkFileExists(fullPath);
    if (exists) {
      return fullPath;
    }
  } catch {
    // Ignore file existence check issues.
  }

  return findThumbnailPath(projectPath, candidateIndex + 1);
}

async function loadSingleProjectMetadata(
  projectPath: string,
): Promise<ProjectMetadata> {
  const metadata: ProjectMetadata = {};
  try {
    const manifestContent = await window.electron.project.readFile(
      joinPath(projectPath, 'kshana.json'),
    );
    if (manifestContent) {
      const manifest = safeJsonParse<KshanaManifest>(manifestContent);
      metadata.manifestName = manifest.name;
      metadata.description = manifest.description || null;
    }
  } catch {
    // Ignore malformed or missing manifest for older/non-standard folders.
  }

  try {
    const agentProjectContent = await window.electron.project.readFile(
      joinPath(projectPath, '.kshana/agent/project.json'),
    );
    if (agentProjectContent) {
      const agentProject = safeJsonParse<AgentProjectFile>(agentProjectContent);
      metadata.sceneCount = agentProject.scenes.length;
      metadata.characterCount = agentProject.characters.length;
    }
  } catch {
    // Ignore if this isn't a complete Kshana project yet.
  }

  metadata.thumbnailPath = await findThumbnailPath(projectPath);
  return metadata;
}

export default function LandingScreen() {
  const { recentProjects, openProject, isLoading } = useWorkspace();
  const { isLoading: isProjectLoading, createProject } = useProject();
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>(FALLBACK_APP_VERSION);
  const [metadataByPath, setMetadataByPath] = useState<
    Record<string, ProjectMetadata>
  >({});

  useEffect(() => {
    let isMounted = true;
    const getVersion = window.electron?.app?.getVersion;
    if (!getVersion) {
      return () => {
        isMounted = false;
      };
    }

    getVersion()
      .then((version) => {
        if (!isMounted) return null;
        setAppVersion(version ? `v${version}` : FALLBACK_APP_VERSION);
        return null;
      })
      .catch(() => {
        if (!isMounted) return null;
        setAppVersion(FALLBACK_APP_VERSION);
        return null;
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadMetadata = async () => {
      const entries: Array<readonly [string, ProjectMetadata]> = [];
      const loadSequentially = async (index: number): Promise<void> => {
        if (index >= recentProjects.length) return;
        const project = recentProjects[index];
        const metadata = await loadSingleProjectMetadata(project.path);
        entries.push([project.path, metadata] as const);
        await loadSequentially(index + 1);
      };
      await loadSequentially(0);

      if (!isActive) return;
      setMetadataByPath(Object.fromEntries(entries));
    };

    loadMetadata();

    return () => {
      isActive = false;
    };
  }, [recentProjects]);

  const projectCards = useMemo<LandingProjectCard[]>(
    () =>
      sortRecentProjects(recentProjects).map((project) => {
        const metadata = metadataByPath[project.path];
        return {
          path: project.path,
          name:
            metadata?.manifestName ||
            project.name ||
            getProjectNameFromPath(project.path),
          lastOpened: project.lastOpened,
          description: metadata?.description || null,
          sceneCount: metadata?.sceneCount ?? null,
          characterCount: metadata?.characterCount ?? null,
          thumbnailPath: metadata?.thumbnailPath || null,
        };
      }),
    [metadataByPath, recentProjects],
  );

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

  const handleCreateNewProject = useCallback(async () => {
    setError(null);
    try {
      // Use native folder picker so users can click "New Folder" directly in macOS/Windows dialog.
      const selectedPath = await window.electron.project.selectDirectory();
      if (!selectedPath) return;

      // Ensure guarded IPC writes use this folder as active project root.
      await window.electron.project.watchDirectory(selectedPath);

      const projectName = getProjectNameFromPath(selectedPath);
      const created = await createProject(selectedPath, projectName);
      if (!created) {
        throw new Error('Failed to initialize project in selected folder.');
      }

      await openProject(selectedPath);
    } catch (err) {
      setError(`Failed to create project: ${(err as Error).message}`);
    }
  }, [createProject, openProject]);

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
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <Play size={20} className={styles.playIcon} />
          </div>
          <h1 className={styles.brandTitle}>Kshana Desktop</h1>
        </div>

        <div className={styles.sidebarSection}>
          <p className={styles.sectionLabel}>Quick Actions</p>
          <button
            type="button"
            className={styles.newProjectButton}
            onClick={handleCreateNewProject}
            disabled={isLoading || isProjectLoading}
          >
            <Plus size={16} />
            New Project
          </button>
          <button
            type="button"
            className={styles.openWorkspaceButton}
            onClick={handleOpenDirectory}
            disabled={isLoading || isProjectLoading}
          >
            <FolderOpen size={16} />
            {isLoading ? 'Opening...' : 'Open Workspace'}
          </button>
        </div>

        <div className={styles.sidebarSection}>
          <p className={styles.sectionLabel}>Recent Projects</p>
          <RecentProjectsList
            projects={recentProjects}
            onSelect={handleSelectRecent}
          />
        </div>

        <div className={styles.sidebarFooter}>
          <span>{appVersion}</span>
          <span className={styles.footerDivider}>·</span>
          <button type="button" className={styles.footerLink}>
            Help
          </button>
          <span className={styles.footerDivider}>·</span>
          <button type="button" className={styles.footerLink}>
            Settings
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <section className={styles.hero}>
          <Sparkles size={16} />
          <div>
            <h2 className={styles.heroTitle}>Agentic Video Workspace</h2>
            <p className={styles.heroSubtitle}>
              Create and manage your projects with a clean visual dashboard.
            </p>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.projectsSection}>
          <div className={styles.projectsHeader}>
            <h3 className={styles.projectsTitle}>Projects</h3>
          </div>

          {projectCards.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No projects yet. Create your first project to get started.</p>
              <button
                type="button"
                className={styles.newProjectButton}
                onClick={handleCreateNewProject}
                disabled={isLoading || isProjectLoading}
              >
                <Plus size={16} />
                Create Project
              </button>
            </div>
          ) : (
            <div className={styles.projectsGrid}>
              {projectCards.map((project) => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  onOpen={handleSelectRecent}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
