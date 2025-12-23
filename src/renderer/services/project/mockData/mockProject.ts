/**
 * Mock Project Manifest Data
 * Based on the "Desert Survival Story" example from the specification
 */

import type { KshanaManifest } from '../../../types/kshana';

/**
 * Mock project ID for the Desert Survival Story
 */
export const MOCK_PROJECT_ID = 'proj_desert_survival_001';

/**
 * Current Kshana version
 */
export const KSHANA_VERSION = '1.0.0';

/**
 * Creates a mock KshanaManifest for the Desert Survival Story
 */
export function createMockManifest(): KshanaManifest {
  return {
    id: MOCK_PROJECT_ID,
    name: 'Desert Survival Story',
    description: 'A short film about a wanderer in the Sahara',
    created_at: '2025-12-12T10:30:00Z',
    updated_at: '2025-12-15T15:45:00Z',
    settings: {
      resolution: { width: 1920, height: 1080 },
      framerate: 30,
      aspect_ratio: '16:9',
    },
    schema_version: '1',
    kshana_version: KSHANA_VERSION,
  };
}

/**
 * Creates a mock manifest with custom name
 */
export function createMockManifestWithName(
  name: string,
  description?: string,
): KshanaManifest {
  const manifest = createMockManifest();
  return {
    ...manifest,
    id: `proj_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    name,
    description,
  };
}
