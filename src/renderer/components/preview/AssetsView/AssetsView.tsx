import { useState, useEffect, useCallback } from 'react';
import { User, MapPin, Package, Layers } from 'lucide-react';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import type { ProjectState, PropAsset } from '../../../types/projectState';
import { MOCK_PROPS as mockPropsData } from '../../../types/projectState';
import AssetCard from '../AssetCard';
import styles from './AssetsView.module.scss';

interface CharacterAsset {
  name: string;
  description?: string;
  appearance?: string;
  imagePath?: string;
  role?: string;
  age?: number;
}

interface LocationAsset {
  name: string;
  description?: string;
  atmosphere?: string;
  imagePath?: string;
}

// Mock characters for when no project state exists
const MOCK_CHARACTERS: CharacterAsset[] = [
  {
    name: 'Keerti',
    description:
      'A young woman who wakes up on a deserted island after a plane crash',
    appearance: 'Athletic build, long black hair, brown eyes, olive skin',
    role: 'Protagonist',
    age: 28,
  },
  {
    name: 'The Stranger',
    description: 'A mysterious figure encountered on the island',
    appearance: 'Tall, weathered face, grey hair, worn clothing',
    role: 'Supporting',
  },
];

// Mock locations for when no project state exists
const MOCK_LOCATIONS: LocationAsset[] = [
  {
    name: 'Island Beach',
    description:
      'A lush tropical island with white sandy beaches and crystal clear water',
    atmosphere: 'Isolated, mysterious, beautiful yet dangerous',
  },
  {
    name: 'Jungle Spring',
    description: 'A hidden freshwater spring deep in the jungle',
    atmosphere: 'Serene, verdant, life-giving',
  },
];

export default function AssetsView() {
  const { projectDirectory } = useWorkspace();
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

  // Build characters list from project state or mock data
  const getCharacters = (): CharacterAsset[] => {
    if (!projectState) return MOCK_CHARACTERS;

    const characters: CharacterAsset[] = [];
    const characterDetails = projectState.character_details || {};
    const characterAssets = projectState.character_assets || {};

    // Get artifact paths for characters
    const artifactPaths: Record<string, string> = {};
    if (projectState.artifacts) {
      projectState.artifacts.forEach((artifact) => {
        if (artifact.metadata?.character) {
          artifactPaths[artifact.metadata.character as string] =
            artifact.file_path;
        }
      });
    }

    // Combine character details with asset paths
    Object.entries(characterDetails).forEach(([name, details]) => {
      const artifactId = characterAssets[name];
      const artifact = projectState.artifacts?.find(
        (a) => a.artifact_id === artifactId,
      );

      characters.push({
        name:
          typeof details === 'object' && details !== null
            ? (details as { character_name?: string }).character_name || name
            : name,
        description:
          typeof details === 'object' && details !== null
            ? (details as { visual_description?: string }).visual_description
            : undefined,
        appearance:
          typeof details === 'object' && details !== null
            ? (details as { appearance?: string }).appearance
            : undefined,
        role:
          typeof details === 'object' && details !== null
            ? (details as { role?: string }).role
            : undefined,
        age:
          typeof details === 'object' && details !== null
            ? (details as { age?: number }).age
            : undefined,
        imagePath: artifact?.file_path || artifactPaths[name],
      });
    });

    // If no characters from details, try from characters dict
    if (characters.length === 0 && projectState.characters) {
      Object.entries(projectState.characters).forEach(([name, char]) => {
        characters.push({
          name: char.name || name,
          description: char.description,
          appearance: char.appearance,
          imagePath: char.reference_image,
        });
      });
    }

    return characters.length > 0 ? characters : MOCK_CHARACTERS;
  };

  // Build locations list from project state or mock data
  const getLocations = (): LocationAsset[] => {
    if (!projectState) return MOCK_LOCATIONS;

    const locations: LocationAsset[] = [];
    const settingDetails = projectState.setting_details;
    const settingAssets = projectState.setting_assets || {};

    // Get artifact paths for settings
    const artifactPaths: Record<string, string> = {};
    if (projectState.artifacts) {
      projectState.artifacts.forEach((artifact) => {
        if (artifact.metadata?.setting) {
          artifactPaths[artifact.metadata.setting as string] =
            artifact.file_path;
        }
      });
    }

    // Add setting from setting_details
    if (settingDetails && typeof settingDetails === 'object') {
      const details = settingDetails as {
        name?: string;
        description?: string;
        atmosphere?: string;
      };
      if (details.name) {
        const artifactId = settingAssets[details.name];
        const artifact = projectState.artifacts?.find(
          (a) => a.artifact_id === artifactId,
        );
        locations.push({
          name: details.name,
          description: details.description,
          atmosphere: details.atmosphere,
          imagePath: artifact?.file_path || artifactPaths[details.name],
        });
      }
    }

    // Add from locations dict
    if (projectState.locations) {
      Object.entries(projectState.locations).forEach(([name, loc]) => {
        if (!locations.find((l) => l.name === name)) {
          locations.push({
            name: loc.name || name,
            description: loc.description,
            imagePath: loc.reference_image,
          });
        }
      });
    }

    return locations.length > 0 ? locations : MOCK_LOCATIONS;
  };

  // Get props (always mock data for now)
  const getProps = (): PropAsset[] => {
    return mockPropsData;
  };

  const characters = getCharacters();
  const locations = getLocations();
  const props = getProps();

  if (!projectDirectory) {
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

  return (
    <div className={styles.container}>
      {loading ? (
        <div className={styles.loading}>Loading assets...</div>
      ) : (
        <div className={styles.content}>
          {/* Characters Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <User size={16} />
              <h3>Characters</h3>
              <span className={styles.count}>{characters.length}</span>
            </div>
            <div className={styles.grid}>
              {characters.map((char) => (
                <AssetCard
                  key={char.name}
                  type="character"
                  name={char.name}
                  description={char.appearance || char.description}
                  imagePath={char.imagePath}
                  projectDirectory={projectDirectory}
                  metadata={{
                    Role: char.role,
                    Age: char.age,
                  }}
                />
              ))}
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
              {locations.map((loc) => (
                <AssetCard
                  key={loc.name}
                  type="location"
                  name={loc.name}
                  description={loc.description}
                  imagePath={loc.imagePath}
                  projectDirectory={projectDirectory}
                  metadata={{
                    Atmosphere: loc.atmosphere,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Props Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Package size={16} />
              <h3>Props</h3>
              <span className={styles.count}>{(props || []).length}</span>
            </div>
            <div className={styles.grid}>
              {(props || []).map((prop) => (
                <AssetCard
                  key={prop.id || prop.name}
                  type="prop"
                  name={prop.name}
                  description={prop.description}
                  metadata={{
                    Category: prop.category,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
