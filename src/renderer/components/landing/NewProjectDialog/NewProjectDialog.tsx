import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus, X } from 'lucide-react';
import { useProject } from '../../../contexts/ProjectContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import styles from './NewProjectDialog.module.scss';

const PROJECT_SETUP_STORAGE_KEY = 'kshana.pendingProjectSetup';

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalizePathValue(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function joinPath(basePath: string, segment: string): string {
  const normalizedBase = normalizePathValue(basePath);
  const normalizedSegment = segment.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedSegment}`;
}

async function isExistingProjectDirectory(directory: string): Promise<boolean> {
  const normalizedDirectory = normalizePathValue(directory);
  const hasRootProjectFile = await window.electron.project.checkFileExists(
    joinPath(normalizedDirectory, 'project.json'),
  );
  const hasLegacyProjectFile = await window.electron.project.checkFileExists(
    joinPath(normalizedDirectory, '.kshana/agent/project.json'),
  );

  return hasRootProjectFile || hasLegacyProjectFile;
}

export default function NewProjectDialog({
  isOpen,
  onClose,
}: NewProjectDialogProps) {
  const {
    createProject,
    error: projectError,
    isLoading: isProjectLoading,
  } = useProject();
  const { openProject } = useWorkspace();

  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setProjectName('');
      setDescription('');
      setWorkspacePath('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handlePickWorkspace = useCallback(async () => {
    setError(null);
    try {
      const selectedPath = await window.electron.project.selectDirectory();
      if (selectedPath) {
        setWorkspacePath(selectedPath);
      }
    } catch (err) {
      setError(`Failed to select folder: ${(err as Error).message}`);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedName = projectName.trim();
    const trimmedDescription = description.trim();
    const normalizedWorkspacePath = normalizePathValue(workspacePath);

    if (!trimmedName) {
      setError('Project name is required.');
      return;
    }
    if (!normalizedWorkspacePath) {
      setError('Please select a workspace folder.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      let projectDirectory = joinPath(normalizedWorkspacePath, trimmedName);

      if (await isExistingProjectDirectory(normalizedWorkspacePath)) {
        throw new Error(
          'Selected location is already a Kshana project. Choose a parent folder instead.',
        );
      }

      if (await isExistingProjectDirectory(projectDirectory)) {
        throw new Error(
          `A project named "${trimmedName}" already exists in the selected location.`,
        );
      }

      const createdDirectory = await window.electron.project.createFolder(
        normalizedWorkspacePath,
        trimmedName,
        { source: 'renderer', intent: 'new_project_parent' },
      );

      if (!createdDirectory) {
        throw new Error(
          'Could not create project folder in selected workspace.',
        );
      }

      projectDirectory = normalizePathValue(createdDirectory);

      const created = await createProject(
        projectDirectory,
        trimmedName,
        trimmedDescription || undefined,
      );
      if (!created) {
        throw new Error(projectError || 'Project creation failed.');
      }

      try {
        window.localStorage.setItem(
          PROJECT_SETUP_STORAGE_KEY,
          projectDirectory,
        );
      } catch {
        // Ignore localStorage availability issues.
      }

      await openProject(projectDirectory);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    createProject,
    description,
    onClose,
    openProject,
    projectError,
    projectName,
    workspacePath,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Create new project"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Create New Project</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close create project dialog"
            disabled={isSubmitting || isProjectLoading}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.form}>
          <span className={styles.label}>Project Name</span>
          <input
            id="new-project-name"
            className={styles.input}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="My Agentic Video Project"
            disabled={isSubmitting || isProjectLoading}
            aria-label="Project name"
          />

          <span className={styles.label}>Description (optional)</span>
          <textarea
            id="new-project-description"
            className={styles.textarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this project is about..."
            rows={3}
            disabled={isSubmitting || isProjectLoading}
            aria-label="Project description"
          />

          <div className={styles.locationRow}>
            <div className={styles.locationInfo}>
              <span className={styles.locationLabel}>Location</span>
              <span className={styles.locationPath}>
                {workspacePath || 'No folder selected'}
              </span>
            </div>
            <button
              type="button"
              className={styles.pickButton}
              onClick={handlePickWorkspace}
              disabled={isSubmitting || isProjectLoading}
            >
              <FolderOpen size={15} />
              Choose Folder
            </button>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isSubmitting || isProjectLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.createButton}
            onClick={handleCreate}
            disabled={isSubmitting || isProjectLoading}
          >
            <Plus size={15} />
            {isSubmitting || isProjectLoading
              ? 'Creating...'
              : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
