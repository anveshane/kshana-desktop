import { useState, useMemo, useCallback } from 'react';
import { Grid, List, Film } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import type { StoryboardScene, Artifact } from '../../../types/projectState';
import SceneCard from '../SceneCard';
import styles from './StoryboardView.module.scss';

type FilterType = 'all' | 'drafts' | 'final';
type ViewType = 'grid' | 'list';

export default function StoryboardView() {
  const { projectDirectory } = useWorkspace();
  const {
    isLoaded,
    isLoading,
    scenes: projectScenes,
    useMockData,
  } = useProject();
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewType, setViewType] = useState<ViewType>('grid');

  // Convert SceneRef from ProjectContext to StoryboardScene format for SceneCard compatibility
  const scenes: StoryboardScene[] = useMemo(() => {
    if (!isLoaded || projectScenes.length === 0) {
      return [];
    }

    return projectScenes.map((scene) => ({
      scene_number: scene.scene_number,
      name: scene.title,
      description: scene.description || '',
      duration: 5, // Default duration
      shot_type: 'Mid Shot',
      lighting: 'Natural',
    }));
  }, [isLoaded, projectScenes]);

  // Build artifacts map from scene data for backward compatibility
  const artifactsByScene: Record<number, Artifact> = useMemo(() => {
    const map: Record<number, Artifact> = {};

    if (!isLoaded || projectScenes.length === 0) return map;

    for (const scene of projectScenes) {
      // Check if scene has an approved image
      if (scene.image_approval_status === 'approved' && scene.folder) {
        map[scene.scene_number] = {
          artifact_id: `scene-${scene.scene_number}-image`,
          artifact_type: 'image',
          scene_number: scene.scene_number,
          file_path: `${scene.folder}/image.png`,
          status: 'completed',
          created_at: new Date().toISOString(),
        };
      }
    }

    return map;
  }, [isLoaded, projectScenes]);

  // Filter scenes based on status
  const filteredScenes = useMemo(() => {
    return scenes.filter((scene) => {
      if (filter === 'all') return true;
      const hasArtifact = !!artifactsByScene[scene.scene_number];
      if (filter === 'final') return hasArtifact;
      if (filter === 'drafts') return !hasArtifact;
      return true;
    });
  }, [scenes, filter, artifactsByScene]);

  const handleExpand = useCallback((scene: StoryboardScene) => {
    // TODO: Implement scene expansion/preview
    console.log('Expand scene:', scene.scene_number);
  }, []);

  const handleRegenerate = useCallback((scene: StoryboardScene) => {
    // TODO: Implement scene regeneration
    console.log('Regenerate scene:', scene.scene_number);
  }, []);

  const handleNameChange = useCallback(
    async (sceneNumber: number, name: string) => {
      // TODO: Implement name change via ProjectContext
      console.log('Name change:', sceneNumber, name);
    },
    [],
  );

  // Show empty state if no project and not using mock data
  if (!projectDirectory && !useMockData) {
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

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading storyboard...</div>
      </div>
    );
  }

  // Show empty state if no scenes
  if (!isLoaded || scenes.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Film size={48} className={styles.emptyIcon} />
          <h3>No Scenes Yet</h3>
          <p>Start a conversation to generate your storyboard</p>
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
              All ({scenes.length})
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
                projectDirectory={projectDirectory || '/mock'}
                onExpand={handleExpand}
                onRegenerate={handleRegenerate}
                onNameChange={handleNameChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
