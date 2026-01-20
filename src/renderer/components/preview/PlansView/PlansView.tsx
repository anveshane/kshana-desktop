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
];

export default function PlansView() {
  const { projectDirectory } = useWorkspace();
  const [selectedPlan, setSelectedPlan] = useState<PlanFile | null>(null);
  const [planContent, setPlanContent] = useState<string>('');
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Load first plan by default if no project directory
  useEffect(() => {
    if (!projectDirectory) {
    }
    // Don't auto-load, let user select
  }, [projectDirectory]);

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
