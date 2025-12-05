import { useState } from 'react';
import { Maximize2, RefreshCw, Image as ImageIcon, Edit2, Check, X } from 'lucide-react';
import type { StoryboardScene, Artifact } from '../../../types/projectState';
import styles from './SceneCard.module.scss';

interface SceneCardProps {
  scene: StoryboardScene;
  artifact?: Artifact;
  projectDirectory: string;
  onExpand?: (scene: StoryboardScene) => void;
  onRegenerate?: (scene: StoryboardScene) => void;
  onNameChange?: (sceneNumber: number, name: string) => void;
}

export default function SceneCard({
  scene,
  artifact,
  projectDirectory,
  onExpand,
  onRegenerate,
  onNameChange,
}: SceneCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(scene.name || '');

  const sceneId = `SCN_${String(scene.scene_number).padStart(2, '0')}`;
  const hasImage = artifact && !imageError;
  
  const displayName = scene.name || `Scene ${scene.scene_number}`;

  // Construct the full image path
  const imagePath = artifact
    ? `file://${projectDirectory}/${artifact.file_path}`
    : null;

  // Default metadata tags
  const duration = scene.duration || 5;
  const shotType = scene.shot_type || 'Mid Shot';
  const lighting = scene.lighting || scene.mood || 'Natural';

  const status = artifact ? 'Generated' : 'Pending';

  const handleNameEdit = () => {
    setIsEditingName(true);
    setEditedName(scene.name || '');
  };

  const handleNameSave = () => {
    if (onNameChange) {
      onNameChange(scene.scene_number, editedName.trim());
    }
    setIsEditingName(false);
  };

  const handleNameCancel = () => {
    setEditedName(scene.name || '');
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.imageContainer}>
        <span className={styles.sceneId}>{sceneId}</span>

        {hasImage && imagePath ? (
          <img
            src={imagePath}
            alt={`Scene ${scene.scene_number}`}
            className={styles.image}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={styles.placeholder}>
            <ImageIcon size={32} className={styles.placeholderIcon} />
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.nameSection}>
          {isEditingName ? (
            <div className={styles.nameEdit}>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameSave}
                className={styles.nameInput}
                autoFocus
                placeholder={`Scene ${scene.scene_number}`}
              />
              <button
                type="button"
                className={styles.nameButton}
                onClick={handleNameSave}
                title="Save"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                className={styles.nameButton}
                onClick={handleNameCancel}
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className={styles.nameDisplay}>
              <h3 className={styles.sceneName}>{displayName}</h3>
              {onNameChange && (
                <button
                  type="button"
                  className={styles.editNameButton}
                  onClick={handleNameEdit}
                  title="Edit name"
                >
                  <Edit2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className={styles.tags}>
          <span className={styles.tag}>{duration}s</span>
          <span className={styles.tag}>{shotType}</span>
          <span className={styles.tag}>{lighting}</span>
        </div>

        <p className={styles.description}>{scene.description}</p>

        <div className={styles.footer}>
          <span
            className={`${styles.status} ${artifact ? styles.generated : styles.pending}`}
          >
            <span className={styles.statusDot} />
            {status}
          </span>

          <div className={styles.actions}>
            {onExpand && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => onExpand(scene)}
                title="Expand"
              >
                <Maximize2 size={14} />
              </button>
            )}
            {onRegenerate && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => onRegenerate(scene)}
                title="Regenerate"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
