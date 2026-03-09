import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FileText } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import MarkdownEditor from '../MarkdownEditor';
import styles from './PlansView.module.scss';

interface PlanFile {
  name: string;
  displayName: string;
  path: string;
  category: 'content' | 'other';
}

interface PlansViewProps {
  fileToOpen?: string | null;
  onFileOpened?: () => void;
}

const MARKDOWN_EXTENSION = '.md';

const getRelativeProjectPath = (
  projectDirectory: string,
  filePath: string,
): string => {
  const normalizedProjectDirectory = projectDirectory
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  if (normalizedFilePath.startsWith(`${normalizedProjectDirectory}/`)) {
    return normalizedFilePath.slice(normalizedProjectDirectory.length + 1);
  }

  return normalizedFilePath.replace(/^\/+/, '');
};

const toTitleCase = (value: string): string => {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getPlanDisplayName = (relativePath: string): string => {
  const segments = relativePath.split('/');
  const fileName = segments[segments.length - 1] || relativePath;
  const baseName = fileName.replace(/\.md$/i, '');

  if (baseName === 'original_input') {
    return 'Original Input';
  }

  return toTitleCase(baseName);
};

const categorizeMarkdownFile = (relativePath: string): PlanFile['category'] => {
  if (
    relativePath === 'original_input.md' ||
    relativePath.startsWith('plans/') ||
    relativePath.startsWith('content/')
  ) {
    return 'content';
  }

  return 'other';
};

const comparePlanFiles = (left: PlanFile, right: PlanFile): number => {
  if (left.category !== right.category) {
    return left.category === 'content' ? -1 : 1;
  }

  const leftPriority =
    left.path === 'content/transcript.md'
      ? 0
      : left.path === 'plans/content-plan.md'
        ? 1
        : left.path === 'original_input.md'
          ? 2
          : 3;
  const rightPriority =
    right.path === 'content/transcript.md'
      ? 0
      : right.path === 'plans/content-plan.md'
        ? 1
        : right.path === 'original_input.md'
          ? 2
          : 3;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.path.localeCompare(right.path);
};

export default function PlansView({
  fileToOpen,
  onFileOpened,
}: PlansViewProps) {
  const { projectDirectory } = useWorkspace();
  const [availablePlans, setAvailablePlans] = useState<PlanFile[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanFile | null>(null);
  const [planContent, setPlanContent] = useState<string>('');
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const selectedPlanRef = useRef<PlanFile | null>(null);
  const isEditorDirtyRef = useRef(false);

  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  useEffect(() => {
    isEditorDirtyRef.current = isEditorDirty;
  }, [isEditorDirty]);

  const readPlanContent = useCallback(
    async (plan: PlanFile): Promise<string> => {
      if (!projectDirectory) {
        throw new Error('Project directory is not available');
      }

      const content = await window.electron.project.readFile(
        `${projectDirectory}/${plan.path}`,
      );

      if (content !== null) {
        return content;
      }

      return `# ${plan.displayName}\n\nContent not available.`;
    },
    [projectDirectory],
  );

  const loadPlanFile = useCallback(
    async (
      plan: PlanFile,
      options?: { preserveSelection?: boolean; showLoading?: boolean },
    ) => {
      if (!projectDirectory) {
        return;
      }

      const preserveSelection = options?.preserveSelection ?? false;
      const showLoading = options?.showLoading ?? true;

      if (!preserveSelection) {
        setSelectedPlan(plan);
      }
      if (showLoading) {
        setIsLoadingPlan(true);
      }
      setError(null);

      try {
        const content = await readPlanContent(plan);
        setPlanContent(content);
        setIsEditorDirty(false);
      } catch (err) {
        console.error('Failed to load markdown file:', err);
        setError('Failed to load markdown file');
        setPlanContent(`# ${plan.displayName}\n\nFailed to load content.`);
      } finally {
        if (showLoading) {
          setIsLoadingPlan(false);
        }
      }
    },
    [projectDirectory, readPlanContent],
  );

  const reloadPlanList = useCallback(async (): Promise<PlanFile[]> => {
    if (!projectDirectory) {
      setAvailablePlans([]);
      setSelectedPlan(null);
      setPlanContent('');
      setError(null);
      setHasAutoLoaded(false);
      setIsEditorDirty(false);
      return [];
    }

    setIsLoadingPlans(true);
    setError(null);

    try {
      const snapshot =
        await window.electron.project.readProjectSnapshot(projectDirectory);
      const plans = Object.keys(snapshot.files)
        .filter((relativePath) =>
          relativePath.toLowerCase().endsWith(MARKDOWN_EXTENSION),
        )
        .map<PlanFile>((relativePath) => ({
          name: relativePath.split('/').pop() || relativePath,
          displayName: getPlanDisplayName(relativePath),
          path: relativePath,
          category: categorizeMarkdownFile(relativePath),
        }))
        .sort(comparePlanFiles);

      setAvailablePlans(plans);
      if (
        selectedPlanRef.current &&
        !plans.some(
          (candidate) => candidate.path === selectedPlanRef.current?.path,
        )
      ) {
        setPlanContent('');
        setSelectedPlan(null);
        setIsEditorDirty(false);
      }
      return plans;
    } catch (err) {
      console.error('Failed to discover markdown files:', err);
      setAvailablePlans([]);
      setSelectedPlan(null);
      setPlanContent('');
      setError('Failed to discover markdown files');
      setIsEditorDirty(false);
      return [];
    } finally {
      setIsLoadingPlans(false);
    }
  }, [projectDirectory]);

  useEffect(() => {
    reloadPlanList();
  }, [reloadPlanList]);

  useEffect(() => {
    setHasAutoLoaded(false);
    setIsEditorDirty(false);
  }, [projectDirectory]);

  useEffect(() => {
    if (!projectDirectory) {
      return undefined;
    }

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let shouldRefreshSelected = false;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const normalizedProjectDirectory = projectDirectory
        .replace(/\\/g, '/')
        .replace(/\/+$/, '');
      const normalizedPath = event.path.replace(/\\/g, '/');

      if (
        normalizedPath !== normalizedProjectDirectory &&
        !normalizedPath.startsWith(`${normalizedProjectDirectory}/`)
      ) {
        return;
      }

      const isMarkdownFile = normalizedPath
        .toLowerCase()
        .endsWith(MARKDOWN_EXTENSION);
      const isDirectoryChange =
        event.type === 'addDir' || event.type === 'unlinkDir';

      if (!isMarkdownFile && !isDirectoryChange) {
        return;
      }

      const relativePath = getRelativeProjectPath(
        projectDirectory,
        normalizedPath,
      );
      if (
        isMarkdownFile &&
        selectedPlanRef.current &&
        selectedPlanRef.current.path === relativePath &&
        event.type !== 'unlink'
      ) {
        shouldRefreshSelected = true;
      }

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(async () => {
        const selectedPath = selectedPlanRef.current?.path ?? null;
        const plans = await reloadPlanList();

        if (
          !shouldRefreshSelected ||
          !selectedPath ||
          isEditorDirtyRef.current
        ) {
          shouldRefreshSelected = false;
          return;
        }

        const updatedSelection = plans.find(
          (plan) => plan.path === selectedPath,
        );
        shouldRefreshSelected = false;

        if (updatedSelection) {
          await loadPlanFile(updatedSelection, {
            preserveSelection: true,
            showLoading: false,
          });
        }
      }, 250);
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [loadPlanFile, projectDirectory, reloadPlanList]);

  useEffect(() => {
    if (!fileToOpen || !projectDirectory || availablePlans.length === 0) {
      return;
    }

    const relativeTarget = getRelativeProjectPath(projectDirectory, fileToOpen);
    const matchingPlan = availablePlans.find((plan) => {
      return (
        plan.path === relativeTarget ||
        fileToOpen.endsWith(`/${plan.path}`) ||
        fileToOpen.endsWith(`/${plan.name}`) ||
        fileToOpen === plan.path ||
        fileToOpen === plan.name
      );
    });

    if (matchingPlan) {
      loadPlanFile(matchingPlan);
    }

    onFileOpened?.();
  }, [
    availablePlans,
    fileToOpen,
    loadPlanFile,
    onFileOpened,
    projectDirectory,
  ]);

  useEffect(() => {
    if (
      !projectDirectory ||
      selectedPlan ||
      hasAutoLoaded ||
      availablePlans.length === 0
    ) {
      return;
    }

    const preferredPlan =
      availablePlans.find((plan) => plan.path === 'content/transcript.md') ||
      availablePlans.find((plan) => plan.path === 'plans/content-plan.md') ||
      availablePlans.find((plan) => plan.path === 'original_input.md') ||
      availablePlans[0];

    if (preferredPlan) {
      loadPlanFile(preferredPlan);
      setHasAutoLoaded(true);
    }
  }, [
    availablePlans,
    hasAutoLoaded,
    loadPlanFile,
    projectDirectory,
    selectedPlan,
  ]);

  const contentFiles = useMemo(
    () => availablePlans.filter((plan) => plan.category === 'content'),
    [availablePlans],
  );
  const otherFiles = useMemo(
    () => availablePlans.filter((plan) => plan.category === 'other'),
    [availablePlans],
  );

  const renderPlanSection = (title: string, plans: PlanFile[]) => {
    if (plans.length === 0) {
      return null;
    }

    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <FileText size={16} />
          <h3>{title}</h3>
          <span className={styles.count}>{plans.length}</span>
        </div>
        <div className={styles.fileList}>
          {plans.map((plan) => (
            <button
              key={plan.path}
              type="button"
              className={`${styles.planItem} ${
                selectedPlan?.path === plan.path ? styles.active : ''
              }`}
              onClick={() => loadPlanFile(plan)}
            >
              <FileText size={15} className={styles.planIcon} />
              <span className={styles.planMeta}>
                <span className={styles.planName}>{plan.displayName}</span>
                <span className={styles.planFileName}>{plan.path}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const getFilePath = (plan: PlanFile | null): string | undefined => {
    if (!plan || !projectDirectory) return undefined;
    return `${projectDirectory}/${plan.path}`;
  };

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div>
            <p className={styles.eyebrow}>Markdown Navigator</p>
            <h2 className={styles.sidebarTitle}>Project Documents</h2>
          </div>
          <span className={styles.totalCount}>{availablePlans.length}</span>
        </div>

        {isLoadingPlans ? (
          <div className={styles.loading}>Loading markdown files...</div>
        ) : availablePlans.length > 0 ? (
          <div className={styles.sidebarContent}>
            {renderPlanSection('Content Files', contentFiles)}
            {renderPlanSection('Markdown Files', otherFiles)}
          </div>
        ) : (
          <div className={styles.emptyList}>
            No markdown files found in this project yet.
          </div>
        )}
      </aside>

      <div className={styles.editorSection}>
        {isLoadingPlan ? (
          <div className={styles.loading}>Loading...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : selectedPlan ? (
          <MarkdownEditor
            content={planContent || ''}
            fileName={selectedPlan.name}
            filePath={getFilePath(selectedPlan)}
            onDirtyChange={setIsEditorDirty}
          />
        ) : (
          <div className={styles.placeholder}>
            <FileText size={48} className={styles.placeholderIcon} />
            <p className={styles.placeholderText}>
              Select a markdown file to preview
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
