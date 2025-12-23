import { useMemo } from 'react';
import { User, MapPin, Package, Layers } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useProject } from '../../../contexts/ProjectContext';
import { MOCK_PROPS as mockPropsData } from '../../../services/project/mockData/mockProps';
import AssetCard from '../AssetCard';
import styles from './AssetsView.module.scss';

interface CharacterAsset {
  name: string;
  slug: string;
  description?: string;
  appearance?: string;
  imagePath?: string;
}

interface LocationAsset {
  name: string;
  slug: string;
  description?: string;
  atmosphere?: string;
  imagePath?: string;
}

export default function AssetsView() {
  const { projectDirectory } = useWorkspace();
  const {
    isLoaded,
    isLoading,
    characters: projectCharacters,
    settings: projectSettings,
    useMockData,
  } = useProject();

  // Convert CharacterData from ProjectContext to CharacterAsset format
  const characters: CharacterAsset[] = useMemo(() => {
    if (!isLoaded || projectCharacters.length === 0) {
      return [];
    }

    return projectCharacters.map((char) => ({
      name: char.name,
      slug: char.slug,
      description: char.visual_description,
      appearance: char.visual_description,
      // CharacterData uses reference_image_approval_status and reference_image_path
      imagePath:
        char.reference_image_approval_status === 'approved'
          ? char.reference_image_path
          : undefined,
    }));
  }, [isLoaded, projectCharacters]);

  // Convert SettingData from ProjectContext to LocationAsset format
  const locations: LocationAsset[] = useMemo(() => {
    if (!isLoaded || projectSettings.length === 0) {
      return [];
    }

    return projectSettings.map((setting) => ({
      name: setting.name,
      slug: setting.slug,
      description: setting.visual_description,
      atmosphere: setting.visual_description, // Settings use visual_description for atmosphere
      // SettingData uses reference_image_approval_status and reference_image_path
      imagePath:
        setting.reference_image_approval_status === 'approved'
          ? setting.reference_image_path
          : undefined,
    }));
  }, [isLoaded, projectSettings]);

  // Get props from mock data
  const props = useMemo(() => {
    return mockPropsData.map((prop) => ({
      id: prop.id,
      name: prop.name,
      slug: prop.slug,
      description: prop.description,
      category: prop.category,
      imagePath: prop.image_path,
    }));
  }, []);

  // Show empty state if no project and not using mock data
  if (!projectDirectory && !useMockData) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Layers size={48} className={styles.emptyIcon} />
          <h3>No Project Open</h3>
          <p>Open a project to view assets</p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading assets...</div>
      </div>
    );
  }

  // Show empty state if no assets
  if (!isLoaded || (characters.length === 0 && locations.length === 0)) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Layers size={48} className={styles.emptyIcon} />
          <h3>No Assets Yet</h3>
          <p>Start a conversation to generate characters and locations</p>
        </div>
      </div>
    );
  }

  const effectiveProjectDir = projectDirectory || '/mock';

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Characters Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <User size={16} />
            <h3>Characters</h3>
            <span className={styles.count}>{characters.length}</span>
          </div>
          <div className={styles.grid}>
            {characters.length > 0 ? (
              characters.map((char) => (
                <AssetCard
                  key={char.name}
                  type="character"
                  name={char.name}
                  slug={char.slug}
                  description={char.appearance || char.description}
                  imagePath={char.imagePath}
                  projectDirectory={effectiveProjectDir}
                />
              ))
            ) : (
              <div className={styles.emptySection}>
                <p>No characters yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Locations Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <MapPin size={16} />
            <h3>Locations</h3>
            <span className={styles.count}>{locations.length}</span>
          </div>
          <div className={styles.grid}>
            {locations.length > 0 ? (
              locations.map((loc) => (
                <AssetCard
                  key={loc.name}
                  type="location"
                  name={loc.name}
                  slug={loc.slug}
                  description={loc.description}
                  imagePath={loc.imagePath}
                  projectDirectory={effectiveProjectDir}
                />
              ))
            ) : (
              <div className={styles.emptySection}>
                <p>No locations yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Props Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Package size={16} />
            <h3>Props</h3>
            <span className={styles.count}>{props.length}</span>
          </div>
          <div className={styles.grid}>
            {props.map((prop) => (
              <AssetCard
                key={prop.id || prop.name}
                type="prop"
                name={prop.name}
                slug={prop.slug}
                description={prop.description}
                imagePath={prop.imagePath}
                projectDirectory={effectiveProjectDir}
                metadata={{
                  Category: prop.category,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
