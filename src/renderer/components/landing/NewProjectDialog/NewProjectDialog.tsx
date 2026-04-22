import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, LogIn, Plus, X } from 'lucide-react';
import { useProject } from '../../../contexts/ProjectContext';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type { AccountInfo } from '../../../../shared/settingsTypes';
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
    closeProject,
    error: projectError,
    isLoading: isProjectLoading,
  } = useProject();
  const { openProject } = useWorkspace();

  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setProjectName('');
      setDescription('');
      setWorkspacePath('');
      setError(null);
      setIsSubmitting(false);
      setAccount(null);
      setAccountLoading(true);
      setSigningIn(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      setAccountLoading(true);
      try {
        const info = await window.electron.account.get();
        if (!cancelled) {
          setAccount(info);
        }
      } catch {
        if (!cancelled) {
          setAccount(null);
        }
      } finally {
        if (!cancelled) {
          setAccountLoading(false);
        }
      }
    };

    void load();

    const unsubscribe = window.electron.account.onChange((info) => {
      if (!cancelled) {
        setAccount(info);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
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

  const handleSignIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      await window.electron.account.signIn();
    } catch (err) {
      setError(
        `Could not start sign-in: ${(err as Error).message}. Try again from Settings → Account.`,
      );
    } finally {
      setSigningIn(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedName = projectName.trim();
    const trimmedDescription = description.trim();
    const normalizedWorkspacePath = normalizePathValue(workspacePath);

    const cloudAccount = await window.electron.account.get();
    if (!cloudAccount?.token) {
      setError(
        'Sign in to Kshana Cloud first so new projects can sync credits and sessions.',
      );
      return;
    }

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
    let didCreateProject = false;
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
      didCreateProject = true;

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
      if (didCreateProject) {
        closeProject();
      }
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    createProject,
    closeProject,
    description,
    onClose,
    openProject,
    projectError,
    projectName,
    workspacePath,
  ]);

  const cloudConnected = Boolean(account?.token);
  const formLocked =
    isSubmitting || isProjectLoading || accountLoading || !cloudConnected;

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
            disabled={isSubmitting || isProjectLoading || signingIn}
          >
            <X size={16} />
          </button>
        </div>

        {!accountLoading && !cloudConnected ? (
          <div className={styles.cloudNotice}>
            <p className={styles.cloudNoticeTitle}>Sign in to Kshana Cloud</p>
            <p className={styles.cloudNoticeText}>
              New projects need an active cloud account for credits and session
              sync. Sign in below — your browser will open to log you in, then
              you can finish creating the project here.
            </p>
            <button
              type="button"
              className={styles.signInButton}
              onClick={handleSignIn}
              disabled={signingIn || isSubmitting}
            >
              <LogIn size={15} />
              {signingIn ? 'Opening browser…' : 'Sign in with Kshana'}
            </button>
          </div>
        ) : null}

        <div className={styles.form}>
          <span className={styles.label}>Project Name</span>
          <input
            id="new-project-name"
            className={styles.input}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="My Agentic Video Project"
            disabled={formLocked}
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
            disabled={formLocked}
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
              disabled={formLocked}
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
            disabled={isSubmitting || isProjectLoading || signingIn}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.createButton}
            onClick={handleCreate}
            disabled={formLocked}
          >
            <Plus size={15} />
            {isSubmitting || isProjectLoading
              ? 'Creating...'
              : accountLoading
                ? 'Checking account…'
                : !cloudConnected
                  ? 'Sign in to create'
                  : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
