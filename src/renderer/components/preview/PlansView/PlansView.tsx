import { useState, useCallback, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import MarkdownEditor from '../MarkdownEditor';
import styles from './PlansView.module.scss';

interface PlanFile {
  name: string;
  displayName: string;
  path: string;
  category: 'plans' | 'content';
}

const PLAN_FILES: PlanFile[] = [
  // Content files section
  {
    name: 'content-plan.md',
    displayName: 'Content Plan',
    path: 'plans/content-plan.md',
    category: 'content',
  },
  {
    name: 'transcript.md',
    displayName: 'Transcript',
    path: 'content/transcript.md',
    category: 'content',
  },
  {
    name: 'image-placements.md',
    displayName: 'Image Placements',
    path: 'content/image-placements.md',
    category: 'content',
  },
  {
    name: 'video-placements.md',
    displayName: 'Video Placements',
    path: 'content/video-placements.md',
    category: 'content',
  },
  {
    name: 'infographic-placements.md',
    displayName: 'Infographic Placements',
    path: 'content/infographic-placements.md',
    category: 'content',
  },
];

interface PlansViewProps {
  fileToOpen?: string | null;
  onFileOpened?: () => void;
}

export default function PlansView({ fileToOpen, onFileOpened }: PlansViewProps) {
  const { projectDirectory } = useWorkspace();
  const [selectedPlan, setSelectedPlan] = useState<PlanFile | null>(null);
  const [planContent, setPlanContent] = useState<string>('');
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);

  const effectiveProjectDir = projectDirectory || '/mock';

  const loadPlanFile = useCallback(
    async (plan: PlanFile) => {
      setSelectedPlan(plan);
      setIsLoadingPlan(true);
      setError(null);

      const planPath = `${effectiveProjectDir}/.kshana/agent/${plan.path}`;

      try {
        const content = await window.electron.project.readFile(planPath);
        if (content !== null) {
          setPlanContent(content);
        } else {
          setPlanContent(`# ${plan.displayName}\n\nContent not available.`);
        }
      } catch (err) {
        console.error('Failed to load plan file:', err);
        setError('Failed to load plan file');
        setPlanContent(`# ${plan.displayName}\n\nFailed to load content.`);
      } finally {
        setIsLoadingPlan(false);
      }
    },
    [effectiveProjectDir],
  );

  const handlePlanClick = useCallback(
    (plan: PlanFile) => {
      loadPlanFile(plan);
    },
    [loadPlanFile],
  );

  // Handle fileToOpen from navigation
  useEffect(() => {
    if (fileToOpen) {
      // Find matching plan file by path
      const matchingPlan = PLAN_FILES.find((plan) => {
        // Match by full path, relative path, or filename
        const fullPath = `${effectiveProjectDir}/.kshana/agent/${plan.path}`;
        return (
          fileToOpen === fullPath ||
          fileToOpen === plan.path ||
          fileToOpen.endsWith(plan.path) ||
          fileToOpen.endsWith(plan.name)
        );
      });

      if (matchingPlan) {
        loadPlanFile(matchingPlan);
      }
      
      // Clear the navigation after handling
      onFileOpened?.();
    }
  }, [fileToOpen, effectiveProjectDir, loadPlanFile, onFileOpened]);

  // Auto-load transcript.md by default when project directory is set
  useEffect(() => {
    if (projectDirectory && !selectedPlan && !hasAutoLoaded) {
      const defaultFile = PLAN_FILES.find((f) => f.name === 'transcript.md');
      if (defaultFile) {
        loadPlanFile(defaultFile);
        setHasAutoLoaded(true);
      }
    }
  }, [projectDirectory, selectedPlan, hasAutoLoaded, loadPlanFile]);

  const getFilePath = (plan: PlanFile | null): string | undefined => {
    if (!plan) return undefined;
    return `${effectiveProjectDir}/.kshana/agent/${plan.path}`;
  };

  const contentFiles = PLAN_FILES.filter((f) => f.category === 'content');

  return (
    <div className={styles.container}>
      <div className={styles.plansSection}>
        <div className={styles.sectionHeader}>
          <FileText size={16} />
          <h3>Content Files</h3>
        </div>
        <div className={styles.plansGrid}>
          {contentFiles.map((plan) => (
            <button
              key={plan.name}
              type="button"
              className={`${styles.planItem} ${
                selectedPlan?.name === plan.name ? styles.active : ''
              }`}
              onClick={() => handlePlanClick(plan)}
            >
              <FileText size={16} className={styles.planIcon} />
              <span className={styles.planName}>{plan.displayName}</span>
              <span className={styles.planFileName}>{plan.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.editorSection}>
        {isLoadingPlan ? (
          <div className={styles.loading}>Loading...</div>
        ) : selectedPlan ? (
          <MarkdownEditor
            content={planContent || ''}
            fileName={selectedPlan.name}
            filePath={getFilePath(selectedPlan)}
          />
        ) : (
          <div className={styles.placeholder}>
            <FileText size={48} className={styles.placeholderIcon} />
            <p className={styles.placeholderText}>Select a plan file to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}
