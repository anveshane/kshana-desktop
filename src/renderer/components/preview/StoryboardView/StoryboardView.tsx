import { useState, useEffect, useCallback } from 'react';
import { Grid, List, Film } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type {
  ProjectState,
  StoryboardScene,
  Artifact,
} from '../../../types/projectState';
import SceneCard from '../SceneCard';
import styles from './StoryboardView.module.scss';

type FilterType = 'all' | 'drafts' | 'final';
type ViewType = 'grid' | 'list';

// Mock scenes for when no project state exists
const MOCK_SCENES: StoryboardScene[] = [
  {
    scene_number: 1,
    description:
      'A young boy is seen lying in the ground, looking up at the sky. The lighting suggests late afternoon golden hour.',
    duration: 5,
    shot_type: 'Mid Shot',
    lighting: 'Golden Hour',
  },
  {
    scene_number: 2,
    description:
      'The boy stands up abruptly and kicks the soccer ball with significant force towards the horizon. Dust particles float.',
    duration: 3,
    shot_type: 'Low Angle',
    lighting: 'Action',
  },
  {
    scene_number: 3,
    description:
      "The Exchange - A mysterious figure's hand, covered in a ragged glove, hands over a metallic data drive in the rain.",
    duration: 8,
    shot_type: 'Close Up',
    lighting: 'Night',
  },
  {
    scene_number: 4,
    description:
      'Escape sequence - The protagonist flees on a high-speed bike through neon-lit streets. Blurring lights create streaks.',
    duration: 12,
    shot_type: 'Tracking',
    lighting: 'Speed',
  },
];

export default function StoryboardView() {
  const { projectDirectory } = useWorkspace();
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewType, setViewType] = useState<ViewType>('grid');
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(false);

  // Load project state from .kshana/project.json
  const loadProjectState = useCallback(async () => {
    if (!projectDirectory) return;

    setLoading(true);
    try {
      const stateFilePath = `${projectDirectory}/.kshana/project.json`;
      const content = await window.electron.project.readFile(stateFilePath);
      // readFile returns null if file doesn't exist (no error thrown)
      if (content) {
        const state = JSON.parse(content) as ProjectState;
        setProjectState(state);
      } else {
        // Project state doesn't exist yet - will use mock data
        setProjectState(null);
      }
    } catch {
      // Parse error or other issue - use mock data
      setProjectState(null);
    } finally {
      setLoading(false);
    }
  }, [projectDirectory]);

  useEffect(() => {
    loadProjectState();
  }, [loadProjectState]);

  // Get scenes from project state or use mock data
  const scenes: StoryboardScene[] =
    projectState?.storyboard_outline?.scenes || MOCK_SCENES;

  // Get artifacts map for quick lookup by scene number
  const artifactsByScene: Record<number, Artifact> = {};
  if (projectState?.artifacts) {
    for (const artifact of projectState.artifacts) {
      if (artifact.scene_number && artifact.artifact_type === 'image') {
        artifactsByScene[artifact.scene_number] = artifact;
      }
    }
  }

  // Filter scenes based on status
  const filteredScenes = scenes.filter((scene) => {
    if (filter === 'all') return true;
    const hasArtifact = !!artifactsByScene[scene.scene_number];
    if (filter === 'final') return hasArtifact;
    if (filter === 'drafts') return !hasArtifact;
    return true;
  });

  const handleExpand = (scene: StoryboardScene) => {
    // TODO: Implement scene expansion/preview
    console.log('Expand scene:', scene.scene_number);
  };

  const handleRegenerate = (scene: StoryboardScene) => {
    // TODO: Implement scene regeneration
    console.log('Regenerate scene:', scene.scene_number);
  };

  if (!projectDirectory) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Film size={48} className={styles.emptyIcon} />
          <h3>No Project Open</h3>
          <p>Open a project to view the storyboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>Filter by:</span>
          <div className={styles.filterButtons}>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === 'drafts' ? styles.active : ''}`}
              onClick={() => setFilter('drafts')}
            >
              Drafts
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${filter === 'final' ? styles.active : ''}`}
              onClick={() => setFilter('final')}
            >
              Final
            </button>
          </div>
        </div>

        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.viewButton} ${viewType === 'grid' ? styles.active : ''}`}
            onClick={() => setViewType('grid')}
            title="Grid view"
          >
            <Grid size={16} />
          </button>
          <button
            type="button"
            className={`${styles.viewButton} ${viewType === 'list' ? styles.active : ''}`}
            onClick={() => setViewType('list')}
            title="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading storyboard...</div>
      ) : (
        <div
          className={`${styles.content} ${viewType === 'list' ? styles.listView : ''}`}
        >
          {filteredScenes.length === 0 ? (
            <div className={styles.emptyState}>
              <Film size={32} className={styles.emptyIcon} />
              <p>No scenes match the current filter</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredScenes.map((scene) => (
                <SceneCard
                  key={scene.scene_number}
                  scene={scene}
                  artifact={artifactsByScene[scene.scene_number]}
                  projectDirectory={projectDirectory}
                  onExpand={handleExpand}
                  onRegenerate={handleRegenerate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

