import { useState, useCallback, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import CodePreview from '../CodePreview/CodePreview';
import styles from './PlansView.module.scss';

interface PlanFile {
  name: string;
  displayName: string;
  path: string;
}

const PLAN_FILES: PlanFile[] = [
  { name: 'plot.md', displayName: 'Plot Summary', path: 'plans/plot.md' },
  { name: 'story.md', displayName: 'Full Story', path: 'plans/story.md' },
  {
    name: 'scenes.md',
    displayName: 'Scene Breakdown',
    path: 'plans/scenes.md',
  },
  {
    name: 'full_script.md',
    displayName: 'Full Script',
    path: 'plans/full_script.md',
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

  return (
    <div className={styles.container}>
      <div className={styles.plansSection}>
        <div className={styles.sectionHeader}>
          <FileText size={16} />
          <h3>Plans</h3>
          <span className={styles.count}>{PLAN_FILES.length}</span>
        </div>
        <div className={styles.plansGrid}>
          {PLAN_FILES.map((plan) => (
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
          <CodePreview
            content={planContent || ''}
            extension=".md"
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
